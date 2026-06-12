-- Buku Besar dihitung di server: bebas batas 1000 baris PostgREST,
-- exclude jurnal penutup (kecuali diminta), filter per departemen/unit.

-- Mutasi buku besar satu akun, terurut tanggal — dipanggil dengan .range() untuk paginasi
CREATE OR REPLACE FUNCTION public.buku_besar_mutasi(
  p_akun_id uuid,
  p_tgl_awal date,
  p_tgl_akhir date,
  p_departemen_ids uuid[] DEFAULT NULL,
  p_include_penutup boolean DEFAULT false
) RETURNS TABLE(
  tanggal date,
  nomor text,
  lembaga text,
  keterangan text,
  debit numeric,
  kredit numeric,
  tipe text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ORDER BY j.tanggal, j.nomor, jd.urutan;
$$;

-- Saldo awal periode buku besar: saldo_awal_isak35 tahun berjalan
-- + mutasi 1 Jan s.d. sehari sebelum p_tgl_awal (exclude jurnal penutup),
-- bertanda sesuai saldo normal akun
CREATE OR REPLACE FUNCTION public.buku_besar_saldo_awal(
  p_akun_id uuid,
  p_tgl_awal date,
  p_departemen_ids uuid[] DEFAULT NULL
) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  )
  SELECT sa.v + CASE WHEN akun.saldo_normal = 'K' THEN mut.k - mut.d ELSE mut.d - mut.k END
  FROM akun, sa, mut;
$$;

REVOKE EXECUTE ON FUNCTION public.buku_besar_mutasi(uuid, date, date, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buku_besar_saldo_awal(uuid, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buku_besar_mutasi(uuid, date, date, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buku_besar_saldo_awal(uuid, date, uuid[]) TO authenticated, service_role;
