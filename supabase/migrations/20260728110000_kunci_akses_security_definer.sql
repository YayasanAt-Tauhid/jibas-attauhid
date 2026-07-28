-- ─────────────────────────────────────────────────────────────────────────────
-- Kunci akses fungsi SECURITY DEFINER keuangan
--
-- Ditemukan lewat `get_advisors` (security): 33 fungsi SECURITY DEFINER bisa
-- dipanggil LANGSUNG lewat RPC oleh role `anon` (tanpa login sama sekali,
-- hanya modal publishable key yang memang tertanam di bundle browser) maupun
-- `authenticated` (siapa pun yang login, apa pun rolenya). Tidak ada satupun
-- RLS policy di database ini yang menyasar role `anon`, jadi tidak ada alasan
-- sah bagi anon untuk mengakses fungsi apa pun di bawah ini.
--
-- Dua kelompok masalah yang diperbaiki migrasi ini:
--
-- 1. Fungsi mutasi keuangan yang HANYA dipanggil dari server function
--    (src/server/*.ts, pakai service_role) atau sama sekali tidak dipakai
--    lagi (migrate_jurnal_batch -- peninggalan migrasi data lama, tidak ada
--    referensi di kode manapun). Klien (browser) tidak pernah memanggilnya
--    langsung, jadi REVOKE dari anon+authenticated tidak mengubah perilaku
--    aplikasi sama sekali.
--
-- 2. Fungsi laporan/mutasi buku besar yang MEMANG dipanggil langsung dari
--    client (src/hooks/useJurnal.ts, useISAK35.ts, src/pages/keuangan/
--    TutupBuku.tsx) memakai publishable key -- jadi harus tetap bisa diakses
--    role `authenticated`. Tapi isi fungsinya tidak pernah mengecek role
--    pemanggil, padahal halaman yang memanggilnya dibatasi
--    (`_protected._app._finance.tsx`: allowedRoles admin/kepala_sekolah/
--    keuangan). Siapa pun yang login (termasuk akun ortu/siswa) bisa
--    memanggil RPC-nya langsung dan membaca seluruh buku besar atau menulis
--    ulang saldo awal ISAK 35. Migrasi ini menambahkan pengecekan role di
--    DALAM fungsinya sendiri, memakai kombinasi predikat yang PERSIS sama
--    dengan yang sudah dipakai RLS policy tabel keuangan lain (mis.
--    `admin_keuangan_manage_jurnal`): is_admin_or_kepala(auth.uid()) OR
--    has_role(auth.uid(), 'keuangan').
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Kelompok 1: fungsi mutasi yang hanya dipanggil server-side (atau tak
--    dipakai sama sekali) -- cabut akses anon & authenticated, sisakan
--    service_role saja (pola yang sudah dipakai RPC akrual, migrasi
--    20260728100002).
REVOKE ALL ON FUNCTION public.migrate_jurnal_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_jurnal_batch(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.proses_pembayaran_atomik(
  uuid, uuid, int, numeric, date, text, uuid, uuid, boolean, uuid, uuid, uuid, text, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proses_pembayaran_atomik(
  uuid, uuid, int, numeric, date, text, uuid, uuid, boolean, uuid, uuid, uuid, text, text, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.generate_tagihan_batch(uuid, uuid, integer, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tagihan_batch(uuid, uuid, integer, uuid, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.batalkan_tagihan_atomik(uuid, text, text, date, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_tagihan_atomik(uuid, text, text, date, uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.batalkan_tagihan_batch(uuid[], text, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_tagihan_batch(uuid[], text, date, uuid) TO service_role;

-- Fungsi trigger (handle_new_user, fn_blokir_periode_tutup) berjalan otomatis
-- lewat trigger, bukan lewat panggilan langsung -- mencabut EXECUTE dari
-- anon/authenticated tidak mempengaruhi trigger-nya sama sekali.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_blokir_periode_tutup() FROM PUBLIC, anon, authenticated;

-- ── Kelompok 2: fungsi yang dipanggil client, tambah pengecekan role di
--    dalam fungsi + tetap cabut anon (fungsi ini butuh login, tidak pernah
--    dipanggil sebelum login).

CREATE OR REPLACE FUNCTION public.buku_besar_mutasi(
  p_akun_id uuid, p_tgl_awal date, p_tgl_akhir date,
  p_departemen_ids uuid[] DEFAULT NULL::uuid[],
  p_include_penutup boolean DEFAULT false,
  p_exclude_koreksi boolean DEFAULT false
)
RETURNS TABLE(tanggal date, nomor text, lembaga text, keterangan text, debit numeric, kredit numeric, tipe text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses buku besar';
  END IF;

  RETURN QUERY
  SELECT j.tanggal,
         j.nomor,
         COALESCE(d.nama, '-'),
         COALESCE(NULLIF(jd.keterangan, ''), j.keterangan, '-'),
         jd.debit,
         jd.kredit,
         COALESCE(j.tipe, 'normal')
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  LEFT JOIN departemen d ON d.id = j.departemen_id
  WHERE jd.akun_id = p_akun_id
    AND j.status = 'posted'
    AND j.tanggal BETWEEN p_tgl_awal AND p_tgl_akhir
    AND (p_include_penutup OR COALESCE(j.tipe, '') <> 'penutup')
    AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
    AND (NOT p_exclude_koreksi OR (
      j.tipe <> 'pembalik'
      OR j.tipe IS NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM jurnal jp WHERE jp.jurnal_asal_id = j.id
    ))
  ORDER BY j.tanggal, j.nomor, jd.urutan;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buku_besar_saldo_awal(
  p_akun_id uuid, p_tgl_awal date,
  p_departemen_ids uuid[] DEFAULT NULL::uuid[],
  p_exclude_koreksi boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result numeric;
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses buku besar';
  END IF;

  WITH akun AS (
    SELECT saldo_normal FROM akun_rekening WHERE id = p_akun_id
  ),
  sa AS (
    SELECT COALESCE(SUM(s.saldo), 0) AS v
    FROM saldo_awal_isak35 s
    WHERE s.akun_id = p_akun_id
      AND s.tahun = EXTRACT(YEAR FROM p_tgl_awal)::int
      AND (p_departemen_ids IS NULL OR s.departemen_id = ANY(p_departemen_ids))
  ),
  mut AS (
    SELECT COALESCE(SUM(jd.debit), 0) AS d, COALESCE(SUM(jd.kredit), 0) AS k
    FROM jurnal_detail jd
    JOIN jurnal j ON j.id = jd.jurnal_id
    WHERE jd.akun_id = p_akun_id
      AND j.status = 'posted'
      AND COALESCE(j.tipe, '') <> 'penutup'
      AND j.tanggal >= make_date(EXTRACT(YEAR FROM p_tgl_awal)::int, 1, 1)
      AND j.tanggal < p_tgl_awal
      AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
      AND (NOT p_exclude_koreksi OR (
        j.tipe <> 'pembalik'
        OR j.tipe IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM jurnal jp WHERE jp.jurnal_asal_id = j.id
      ))
  )
  SELECT sa.v + CASE WHEN akun.saldo_normal = 'K' THEN mut.k - mut.d ELSE mut.d - mut.k END
  INTO v_result
  FROM akun, sa, mut;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_detail_jurnal_kas(
  p_tahun integer, p_akun_kas_ids uuid[], p_departemen_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(jurnal_id uuid, akun_id uuid, debit numeric, kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses jurnal kas';
  END IF;

  RETURN QUERY
  SELECT jd.jurnal_id, jd.akun_id, jd.debit, jd.kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND EXTRACT(YEAR FROM j.tanggal)::int = p_tahun
    AND (p_departemen_id IS NULL OR j.departemen_id = p_departemen_id)
    AND j.id IN (
      SELECT DISTINCT jd2.jurnal_id
      FROM jurnal_detail jd2
      WHERE jd2.akun_id = ANY(p_akun_kas_ids)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_detail_jurnal_kas(
  p_tahun integer, p_akun_kas_ids uuid[], p_departemen_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(jurnal_id uuid, akun_id uuid, debit numeric, kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses jurnal kas';
  END IF;

  RETURN QUERY
  SELECT jd.jurnal_id, jd.akun_id, jd.debit, jd.kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND date_part('year', j.tanggal) = p_tahun
    AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
    AND j.id IN (
      SELECT DISTINCT jd2.jurnal_id
      FROM jurnal_detail jd2
      WHERE jd2.akun_id = ANY(p_akun_kas_ids)
    )
  ORDER BY jd.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_detail_jurnal_kas(
  p_tahun integer, p_akun_kas_ids uuid[], p_departemen_id uuid DEFAULT NULL::uuid,
  p_kategori text[] DEFAULT NULL::text[]
)
RETURNS TABLE(jurnal_id uuid, akun_id uuid, debit numeric, kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses jurnal kas';
  END IF;

  RETURN QUERY
  WITH jurnal_kas AS (
    SELECT DISTINCT jd.jurnal_id
    FROM jurnal_detail jd
    JOIN jurnal j    ON j.id  = jd.jurnal_id
    JOIN departemen d ON d.id = j.departemen_id
    WHERE j.status  = 'posted'
      AND j.tanggal >= make_date(p_tahun, 1, 1)
      AND j.tanggal <= make_date(p_tahun, 12, 31)
      AND (p_departemen_id IS NULL OR j.departemen_id = p_departemen_id)
      AND (p_kategori      IS NULL OR d.kategori = ANY(p_kategori))
      AND jd.akun_id = ANY(p_akun_kas_ids)
  )
  SELECT jd.jurnal_id, jd.akun_id, jd.debit, jd.kredit
  FROM jurnal_detail jd
  JOIN jurnal_kas jk ON jk.jurnal_id = jd.jurnal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_detail_jurnal_kas_range(
  p_tgl_awal date, p_tgl_akhir date, p_akun_kas_ids uuid[],
  p_departemen_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(jurnal_id uuid, akun_id uuid, debit numeric, kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses jurnal kas';
  END IF;

  RETURN QUERY
  SELECT jd.jurnal_id, jd.akun_id, jd.debit, jd.kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND j.tanggal >= p_tgl_awal
    AND j.tanggal <= p_tgl_akhir
    AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
    AND j.id IN (
      SELECT DISTINCT jd2.jurnal_id
      FROM jurnal_detail jd2
      WHERE jd2.akun_id = ANY(p_akun_kas_ids)
    )
  ORDER BY jd.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hitung_mutasi_akun(
  p_tahun integer, p_departemen_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(akun_id uuid, total_debit numeric, total_kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses mutasi akun';
  END IF;

  RETURN QUERY
  SELECT jd.akun_id, COALESCE(SUM(jd.debit),0), COALESCE(SUM(jd.kredit),0)
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND EXTRACT(YEAR FROM j.tanggal)::int = p_tahun
    AND COALESCE(j.tipe,'') <> 'penutup'
    AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
  GROUP BY jd.akun_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hitung_mutasi_akun_range(
  p_tgl_awal date, p_tgl_akhir date, p_departemen_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(akun_id uuid, total_debit numeric, total_kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses mutasi akun';
  END IF;

  RETURN QUERY
  SELECT jd.akun_id, COALESCE(SUM(jd.debit),0), COALESCE(SUM(jd.kredit),0)
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND j.tanggal >= p_tgl_awal AND j.tanggal <= p_tgl_akhir
    AND COALESCE(j.tipe,'') <> 'penutup'
    AND (p_departemen_ids IS NULL OR j.departemen_id = ANY(p_departemen_ids))
  GROUP BY jd.akun_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hitung_saldo_akun_per_kategori(
  p_tanggal_mulai date, p_tanggal_selesai date, p_kategori text[]
)
RETURNS TABLE(akun_id uuid, total_debit numeric, total_kredit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengakses saldo akun';
  END IF;

  RETURN QUERY
  SELECT
    jd.akun_id,
    COALESCE(SUM(jd.debit),  0) AS total_debit,
    COALESCE(SUM(jd.kredit), 0) AS total_kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  JOIN departemen d ON d.id = j.departemen_id
  WHERE j.tanggal BETWEEN p_tanggal_mulai AND p_tanggal_selesai
    AND j.status = 'posted'
    AND d.kategori = ANY(p_kategori)
  GROUP BY jd.akun_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.isi_saldo_awal_isak35(
  p_tahun_ditutup integer, p_tgl_mulai date, p_tgl_selesai date, p_kategori text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tahun_baru int := p_tahun_ditutup + 1;
  v_jumlah int := 0;
  v_akun_ekuitas uuid;
BEGIN
  IF NOT (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan')) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengisi saldo awal ISAK 35';
  END IF;

  SELECT akun_id INTO v_akun_ekuitas
  FROM pengaturan_akun WHERE kode_setting = 'AKUN_ASET_NETO_TIDAK_TERIKAT' LIMIT 1;
  IF v_akun_ekuitas IS NULL THEN
    RAISE EXCEPTION 'Akun Aset Neto Tidak Terikat belum dikonfigurasi di pengaturan_akun';
  END IF;

  DELETE FROM saldo_awal_isak35 s
  WHERE s.tahun = v_tahun_baru
    AND s.departemen_id IN (SELECT id FROM departemen WHERE kategori = ANY(p_kategori));

  INSERT INTO saldo_awal_isak35 (departemen_id, tahun, akun_id, saldo)
  WITH mut AS (
    SELECT j.departemen_id, jd.akun_id, ar.jenis,
      CASE WHEN ar.saldo_normal = 'D'
        THEN COALESCE(SUM(jd.debit),0) - COALESCE(SUM(jd.kredit),0)
        ELSE COALESCE(SUM(jd.kredit),0) - COALESCE(SUM(jd.debit),0)
      END AS saldo
    FROM jurnal_detail jd
    JOIN jurnal j         ON j.id  = jd.jurnal_id
    JOIN departemen d     ON d.id  = j.departemen_id
    JOIN akun_rekening ar ON ar.id = jd.akun_id
    WHERE j.tanggal BETWEEN p_tgl_mulai AND p_tgl_selesai
      AND j.status = 'posted'
      AND COALESCE(j.tipe,'') <> 'penutup'
      AND d.kategori = ANY(p_kategori)
      AND ar.pos_isak35 IS NOT NULL
    GROUP BY j.departemen_id, jd.akun_id, ar.jenis, ar.saldo_normal
  ),
  awal_lama AS (
    SELECT s.departemen_id, s.akun_id, ar.jenis, s.saldo
    FROM saldo_awal_isak35 s
    JOIN akun_rekening ar ON ar.id = s.akun_id
    JOIN departemen d ON d.id = s.departemen_id
    WHERE s.tahun = p_tahun_ditutup AND d.kategori = ANY(p_kategori)
  ),
  semua AS (
    SELECT * FROM mut UNION ALL SELECT * FROM awal_lama
  ),
  neraca AS (
    SELECT departemen_id, akun_id, saldo FROM semua
    WHERE jenis IN ('aset','liabilitas','ekuitas')
  ),
  surplus AS (
    SELECT departemen_id, v_akun_ekuitas AS akun_id,
      SUM(CASE WHEN jenis = 'pendapatan' THEN saldo
               WHEN jenis = 'beban' THEN -saldo ELSE 0 END) AS saldo
    FROM semua WHERE jenis IN ('pendapatan','beban')
    GROUP BY departemen_id
  ),
  gabung AS (
    SELECT departemen_id, akun_id, SUM(saldo) AS saldo
    FROM (SELECT * FROM neraca UNION ALL SELECT * FROM surplus) x
    GROUP BY departemen_id, akun_id
  )
  SELECT departemen_id, v_tahun_baru, akun_id, saldo FROM gabung WHERE saldo <> 0;

  GET DIAGNOSTICS v_jumlah = ROW_COUNT;
  RETURN v_jumlah;
END;
$function$;

-- Cabut anon, sisakan authenticated -- fungsi ini memang dipanggil langsung
-- dari client setelah login (useJurnal.ts, useISAK35.ts, TutupBuku.tsx).
--
-- PENTING: privilege EXECUTE default sebuah fungsi baru datang dari grant
-- implisit ke PUBLIC (bukan grant eksplisit per-role) -- REVOKE ... FROM anon
-- saja TIDAK cukup karena anon tetap punya akses lewat keanggotaan PUBLIC.
-- Harus REVOKE dari PUBLIC dulu, baru GRANT eksplisit ke authenticated.
REVOKE ALL ON FUNCTION public.buku_besar_mutasi(uuid, date, date, uuid[], boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buku_besar_mutasi(uuid, date, date, uuid[], boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.buku_besar_saldo_awal(uuid, date, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buku_besar_saldo_awal(uuid, date, uuid[], boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_detail_jurnal_kas(integer, uuid[], uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_detail_jurnal_kas_range(date, date, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_detail_jurnal_kas_range(date, date, uuid[], uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_mutasi_akun(integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hitung_mutasi_akun(integer, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_mutasi_akun_range(date, date, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hitung_mutasi_akun_range(date, date, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_saldo_akun_per_kategori(date, date, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hitung_saldo_akun_per_kategori(date, date, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.isi_saldo_awal_isak35(integer, date, date, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.isi_saldo_awal_isak35(integer, date, date, text[]) TO authenticated, service_role;
