-- Migration: switch log_tutup_buku dari tahun_ajaran → tahun_buku
-- Alasan: tahun_buku adalah sumber kebenaran periode keuangan,
--         bukan tahun_ajaran yang lebih ke konteks akademik.

-- 1. Tambah kolom ditutup ke tahun_buku
ALTER TABLE tahun_buku ADD COLUMN IF NOT EXISTS ditutup boolean NOT NULL DEFAULT false;

-- 2. Tambah kolom tahun_buku_id ke log_tutup_buku (nullable untuk backward compat baris lama)
ALTER TABLE log_tutup_buku ADD COLUMN IF NOT EXISTS tahun_buku_id uuid REFERENCES tahun_buku(id);

-- 3. Backfill tahun_buku_id dari matching tanggal tahun_ajaran
UPDATE log_tutup_buku ltb
SET tahun_buku_id = tb.id
FROM tahun_ajaran ta
JOIN tahun_buku tb
  ON tb.tanggal_mulai = ta.tanggal_mulai
 AND tb.tanggal_selesai = ta.tanggal_selesai
WHERE ltb.tahun_ajaran_id = ta.id
  AND ltb.tahun_buku_id IS NULL;

-- 4. Backfill tahun_buku.ditutup dari tahun_ajaran.ditutup
UPDATE tahun_buku tb
SET ditutup = true
FROM tahun_ajaran ta
WHERE ta.tanggal_mulai = tb.tanggal_mulai
  AND ta.tanggal_selesai = tb.tanggal_selesai
  AND ta.ditutup = true;

-- 5. Update view v_status_tutup_buku → join ke tahun_buku
CREATE OR REPLACE VIEW public.v_status_tutup_buku AS
SELECT
  tb.id                     AS tahun_buku_id,
  tb.nama                   AS tahun_buku,
  tb.tanggal_mulai,
  tb.tanggal_selesai,
  tb.aktif,
  tb.ditutup,
  CASE WHEN EXISTS (
    SELECT 1 FROM log_tutup_buku l
    WHERE l.tahun_buku_id = tb.id AND l.unit = 'unit_pendidikan'
  ) THEN TRUE ELSE FALSE END  AS ditutup_unit_pendidikan,
  CASE WHEN EXISTS (
    SELECT 1 FROM log_tutup_buku l
    WHERE l.tahun_buku_id = tb.id AND l.unit = 'unit_usaha_dana'
  ) THEN TRUE ELSE FALSE END  AS ditutup_unit_usaha_dana,
  (SELECT MAX(l.tanggal_proses) FROM log_tutup_buku l
   WHERE l.tahun_buku_id = tb.id AND l.unit = 'unit_pendidikan')
                              AS tgl_tutup_unit_pendidikan,
  (SELECT MAX(l.tanggal_proses) FROM log_tutup_buku l
   WHERE l.tahun_buku_id = tb.id AND l.unit = 'unit_usaha_dana')
                              AS tgl_tutup_unit_usaha_dana
FROM tahun_buku tb
ORDER BY tb.tanggal_mulai DESC;

GRANT SELECT ON public.v_status_tutup_buku TO authenticated;

-- 6. Update is_unit_locked_for_transaksi → pakai tahun_buku
CREATE OR REPLACE FUNCTION public.is_unit_locked_for_transaksi(
  p_tanggal        date,
  p_departemen_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tb_id    uuid;
  v_unit     text;
  v_kategori text;
  v_count    integer;
BEGIN
  SELECT id INTO v_tb_id
  FROM tahun_buku
  WHERE tanggal_mulai <= p_tanggal
    AND tanggal_selesai >= p_tanggal
  LIMIT 1;

  IF v_tb_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_unit := 'unit_pendidikan';
  IF p_departemen_id IS NOT NULL THEN
    SELECT kategori INTO v_kategori
    FROM departemen
    WHERE id = p_departemen_id;

    IF v_kategori IN ('unit_usaha', 'unit_dana_terikat', 'unit_yayasan') THEN
      v_unit := 'unit_usaha_dana';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM log_tutup_buku
  WHERE tahun_buku_id = v_tb_id
    AND unit = v_unit;

  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_unit_locked_for_transaksi TO authenticated;
