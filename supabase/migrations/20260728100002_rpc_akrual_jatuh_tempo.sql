-- ─────────────────────────────────────────────────────────────────────────────
-- Proses akrual jatuh tempo (dijalankan berkala, mis. harian)
--
-- Dua hal yang harus terjadi ketika sebuah periode tagihan akhirnya tiba:
--
--   1. Tagihan yang BELUM dibayar (status 'terjadwal') berubah jadi piutang:
--          (D) Piutang Siswa          (K) Pendapatan <jenis>
--      status -> 'belum_bayar'. Sejak titik ini, kalau lewat tanpa pelunasan,
--      tagihan tsb adalah TUNGGAKAN -- dan tunggakan tidak butuh jurnal baru,
--      karena akunnya sama (Piutang Siswa); yang berubah hanya umur piutangnya.
--
--   2. Tagihan yang SUDAH dibayar di muka (uangnya masuk sebelum jatuh tempo,
--      sehingga dibukukan sebagai liabilitas Pendapatan Diterima di Muka)
--      pendapatannya baru diakui sekarang:
--          (D) Pendapatan Diterima di Muka   (K) Pendapatan <jenis>
--      baris pendapatan_dimuka -> status 'diakui'.
--
-- Keduanya idempoten: baris yang sudah diproses tidak akan diproses lagi
-- (filter status + jurnal_*_id IS NULL), jadi job boleh dijalankan berkali-kali
-- dalam sehari tanpa menggandakan jurnal.
--
-- Tanggal jurnal memakai current_date, BUKAN tanggal jatuh tempo, supaya job
-- yang telat jalan tidak menyisipkan jurnal bertanggal mundur ke bulan yang
-- laporannya sudah terbit / bukunya sudah ditutup.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tagihan terjadwal yang jatuh tempo -> piutang ────────────────────────
CREATE OR REPLACE FUNCTION public.posting_piutang_jatuh_tempo(
  p_sampai_tanggal date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE(diposting integer, total_nominal numeric, errors text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batas date := COALESCE(p_sampai_tanggal, current_date);
  v_tanggal date := current_date;
  v_tahun integer := extract(year from current_date)::integer;
  v_piutang_akun_id uuid;
  v_pegawai_id uuid;
  v_row record;
  v_jurnal_id uuid;
  v_nomor text;
  v_dept_id uuid;
  v_diposting integer := 0;
  v_total numeric := 0;
  v_errors text[] := '{}';
BEGIN
  SELECT akun_id INTO v_piutang_akun_id
  FROM pengaturan_akun WHERE kode_setting = 'piutang_siswa';

  IF v_piutang_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun piutang siswa belum dikonfigurasi di Pengaturan Akun';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT pegawai_id INTO v_pegawai_id FROM users_profile WHERE id = p_user_id;
  END IF;

  FOR v_row IN
    SELECT t.id, t.siswa_id, t.kelas_id, t.nominal, t.bulan, t.jatuh_tempo,
           jp.nama AS jenis_nama, jp.akun_pendapatan_id
    FROM tagihan t
    JOIN jenis_pembayaran jp ON jp.id = t.jenis_id
    WHERE t.status = 'terjadwal'
      AND t.jurnal_piutang_id IS NULL
      AND t.jatuh_tempo IS NOT NULL
      AND t.jatuh_tempo <= v_batas
    ORDER BY t.jatuh_tempo, t.id
    LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
  LOOP
    BEGIN
      IF v_row.akun_pendapatan_id IS NULL THEN
        v_errors := v_errors ||
          ('Tagihan ' || v_row.id || ': akun pendapatan belum diset untuk jenis "' || v_row.jenis_nama || '"');
        CONTINUE;
      END IF;

      v_dept_id := NULL;
      IF v_row.kelas_id IS NOT NULL THEN
        SELECT departemen_id INTO v_dept_id FROM kelas WHERE id = v_row.kelas_id;
      END IF;
      IF v_dept_id IS NULL THEN
        SELECT departemen_id INTO v_dept_id FROM siswa WHERE id = v_row.siswa_id;
      END IF;

      v_nomor := generate_nomor_jurnal('JPI', v_tahun);

      INSERT INTO jurnal (nomor, tanggal, keterangan, referensi, departemen_id,
                          total_debit, total_kredit, status, dibuat_oleh)
      VALUES (
        v_nomor, v_tanggal,
        'Piutang ' || v_row.jenis_nama
          || CASE WHEN v_row.bulan IS NOT NULL THEN '-B' || v_row.bulan ELSE '' END
          || ' jatuh tempo ' || to_char(v_row.jatuh_tempo, 'YYYY-MM-DD')
          || ' - siswa ' || v_row.siswa_id,
        v_row.id::text, v_dept_id,
        v_row.nominal, v_row.nominal, 'posted', v_pegawai_id
      )
      RETURNING id INTO v_jurnal_id;

      INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
      VALUES
        (v_jurnal_id, v_piutang_akun_id, 'Piutang ' || v_row.jenis_nama, v_row.nominal, 0, 1),
        (v_jurnal_id, v_row.akun_pendapatan_id, 'Pendapatan ' || v_row.jenis_nama, 0, v_row.nominal, 2);

      -- Guard balapan: hanya update kalau baris masih benar-benar 'terjadwal'
      -- (mis. orang tua melunasi lewat portal tepat saat job berjalan).
      UPDATE tagihan
      SET status = 'belum_bayar', jurnal_piutang_id = v_jurnal_id
      WHERE id = v_row.id AND status = 'terjadwal' AND jurnal_piutang_id IS NULL;

      IF NOT FOUND THEN
        DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
        DELETE FROM jurnal WHERE id = v_jurnal_id;
        CONTINUE;
      END IF;

      v_diposting := v_diposting + 1;
      v_total := v_total + v_row.nominal;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || ('Tagihan ' || v_row.id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_diposting, v_total, v_errors;
END;
$function$;

COMMENT ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer) IS
  'Mengubah tagihan berstatus terjadwal yang sudah jatuh tempo menjadi piutang '
  '(D Piutang / K Pendapatan) dan memindahkan statusnya ke belum_bayar. Idempoten.';

-- ── 2. Pendapatan diterima di muka yang jatuh tempo -> pendapatan ───────────
CREATE OR REPLACE FUNCTION public.akui_pendapatan_dimuka_jatuh_tempo(
  p_sampai_tanggal date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE(diakui integer, total_nominal numeric, errors text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batas date := COALESCE(p_sampai_tanggal, current_date);
  v_tanggal date := current_date;
  v_tahun integer := extract(year from current_date)::integer;
  v_dimuka_global_id uuid;
  v_dimuka_akun_id uuid;
  v_pegawai_id uuid;
  v_row record;
  v_jurnal_id uuid;
  v_nomor text;
  v_diakui integer := 0;
  v_total numeric := 0;
  v_errors text[] := '{}';
BEGIN
  SELECT akun_id INTO v_dimuka_global_id
  FROM pengaturan_akun WHERE kode_setting = 'AKUN_PENDAPATAN_DIMUKA';

  IF p_user_id IS NOT NULL THEN
    SELECT pegawai_id INTO v_pegawai_id FROM users_profile WHERE id = p_user_id;
  END IF;

  FOR v_row IN
    SELECT pd.id, pd.siswa_id, pd.jumlah, pd.bulan, pd.departemen_id,
           pd.pembayaran_id, pd.tahun_ajaran_target_id,
           jp.nama AS jenis_nama, jp.akun_pendapatan_id, jp.akun_dimuka_id,
           s.nama AS siswa_nama,
           hitung_jatuh_tempo_tagihan(
             pd.tahun_ajaran_target_id, pd.bulan, jp.hari_jatuh_tempo
           ) AS jatuh_tempo
    FROM pendapatan_dimuka pd
    JOIN jenis_pembayaran jp ON jp.id = pd.jenis_id
    LEFT JOIN siswa s ON s.id = pd.siswa_id
    WHERE pd.status = 'pending'
      AND pd.jurnal_pengakuan_id IS NULL
    ORDER BY pd.created_at
    LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
  LOOP
    BEGIN
      -- Periode target belum tiba (atau tak bisa dihitung) -> belum boleh diakui.
      IF v_row.jatuh_tempo IS NULL OR v_row.jatuh_tempo > v_batas THEN
        CONTINUE;
      END IF;

      v_dimuka_akun_id := COALESCE(v_row.akun_dimuka_id, v_dimuka_global_id);

      IF v_dimuka_akun_id IS NULL OR v_row.akun_pendapatan_id IS NULL THEN
        v_errors := v_errors ||
          ('Pendapatan dimuka ' || v_row.id || ': akun pendapatan / akun diterima di muka belum dikonfigurasi');
        CONTINUE;
      END IF;

      v_nomor := generate_nomor_jurnal('PD', v_tahun);

      INSERT INTO jurnal (nomor, tanggal, keterangan, referensi, departemen_id,
                          total_debit, total_kredit, status, dibuat_oleh)
      VALUES (
        v_nomor, v_tanggal,
        'Pengakuan pendapatan ' || v_row.jenis_nama
          || CASE WHEN v_row.bulan IS NOT NULL THEN '-B' || v_row.bulan ELSE '' END
          || ' - ' || COALESCE(v_row.siswa_nama, v_row.siswa_id::text),
        v_row.pembayaran_id::text, v_row.departemen_id,
        v_row.jumlah, v_row.jumlah, 'posted', v_pegawai_id
      )
      RETURNING id INTO v_jurnal_id;

      INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
      VALUES
        (v_jurnal_id, v_dimuka_akun_id,
         'Pengakuan Pend. Diterima di Muka - ' || v_row.jenis_nama, v_row.jumlah, 0, 1),
        (v_jurnal_id, v_row.akun_pendapatan_id,
         'Pendapatan ' || v_row.jenis_nama, 0, v_row.jumlah, 2);

      UPDATE pendapatan_dimuka
      SET status = 'diakui',
          jurnal_pengakuan_id = v_jurnal_id,
          tanggal_pengakuan = v_tanggal
      WHERE id = v_row.id AND status = 'pending' AND jurnal_pengakuan_id IS NULL;

      IF NOT FOUND THEN
        DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
        DELETE FROM jurnal WHERE id = v_jurnal_id;
        CONTINUE;
      END IF;

      v_diakui := v_diakui + 1;
      v_total := v_total + v_row.jumlah;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || ('Pendapatan dimuka ' || v_row.id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_diakui, v_total, v_errors;
END;
$function$;

COMMENT ON FUNCTION public.akui_pendapatan_dimuka_jatuh_tempo(date, uuid, integer) IS
  'Mengakui pendapatan atas pembayaran yang diterima sebelum jatuh tempo '
  '(D Pendapatan Diterima di Muka / K Pendapatan) begitu periodenya tiba. Idempoten.';

-- ── 3. Pembungkus: satu panggilan untuk kedua proses ────────────────────────
-- Dipanggil dari server function; satu RPC = satu subrequest, penting karena
-- runtime-nya Cloudflare Workers yang punya limit subrequest per invocation.
CREATE OR REPLACE FUNCTION public.jalankan_akrual_jatuh_tempo(
  p_sampai_tanggal date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_piutang record;
  v_dimuka record;
BEGIN
  SELECT * INTO v_piutang
  FROM posting_piutang_jatuh_tempo(p_sampai_tanggal, p_user_id, p_limit);

  SELECT * INTO v_dimuka
  FROM akui_pendapatan_dimuka_jatuh_tempo(p_sampai_tanggal, p_user_id, p_limit);

  RETURN jsonb_build_object(
    'sampai_tanggal',        COALESCE(p_sampai_tanggal, current_date),
    'piutang_diposting',     COALESCE(v_piutang.diposting, 0),
    'piutang_nominal',       COALESCE(v_piutang.total_nominal, 0),
    'pendapatan_diakui',     COALESCE(v_dimuka.diakui, 0),
    'pendapatan_nominal',    COALESCE(v_dimuka.total_nominal, 0),
    'errors',                to_jsonb(COALESCE(v_piutang.errors, '{}'::text[]) || COALESCE(v_dimuka.errors, '{}'::text[]))
  );
END;
$function$;

COMMENT ON FUNCTION public.jalankan_akrual_jatuh_tempo(date, uuid, integer) IS
  'Menjalankan seluruh proses akrual jatuh tempo (posting piutang + pengakuan '
  'pendapatan diterima di muka) dalam satu panggilan.';

REVOKE ALL ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.akui_pendapatan_dimuka_jatuh_tempo(date, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jalankan_akrual_jatuh_tempo(date, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.akui_pendapatan_dimuka_jatuh_tempo(date, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.jalankan_akrual_jatuh_tempo(date, uuid, integer) TO service_role;
