-- ============================================================
-- Migration: unit_aware_period_lock
-- Tujuan:
--   Menyediakan fungsi helper DB untuk cek tutup buku per unit.
--   Dipakai sebagai lapisan tambahan (defense in depth) selain
--   pengecekan di frontend (useKeuangan.ts / useJurnal.ts).
--
-- Logika:
--   - Jika departemen.kategori = 'unit_pendidikan'
--       → cek log_tutup_buku.unit = 'unit_pendidikan'
--   - Jika departemen.kategori IN ('unit_usaha','unit_dana_terikat','unit_yayasan')
--       → cek log_tutup_buku.unit = 'unit_usaha_dana'
--   - Return TRUE jika periode sudah ditutup buku untuk unit tersebut
-- ============================================================

-- 1. Fungsi: is_unit_locked_for_transaksi
--    Mengecek apakah unit dari sebuah departemen sudah tutup buku
--    untuk periode yang mencakup tanggal p_tanggal.
--
--    Parameter:
--      p_tanggal      date    — tanggal transaksi
--      p_departemen_id uuid   — departemen_id transaksi (boleh NULL → anggap unit_pendidikan)
--
--    Return: boolean (TRUE = terkunci, FALSE = bebas)
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
  v_ta_id   uuid;
  v_unit    text;
  v_kategori text;
  v_count   integer;
BEGIN
  -- Cari tahun_ajaran yang mencakup tanggal
  SELECT id INTO v_ta_id
  FROM tahun_ajaran
  WHERE tanggal_mulai <= p_tanggal
    AND tanggal_selesai >= p_tanggal
  LIMIT 1;

  IF v_ta_id IS NULL THEN
    RETURN FALSE;  -- tidak ada tahun ajaran → bebas
  END IF;

  -- Tentukan unit berdasarkan kategori departemen
  v_unit := 'unit_pendidikan'; -- default (lebih ketat)
  IF p_departemen_id IS NOT NULL THEN
    SELECT kategori INTO v_kategori
    FROM departemen
    WHERE id = p_departemen_id;

    IF v_kategori IN ('unit_usaha', 'unit_dana_terikat', 'unit_yayasan') THEN
      v_unit := 'unit_usaha_dana';
    END IF;
  END IF;

  -- Cek apakah log_tutup_buku untuk unit + tahun ini sudah ada
  SELECT COUNT(*) INTO v_count
  FROM log_tutup_buku
  WHERE tahun_ajaran_id = v_ta_id
    AND unit = v_unit;

  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_unit_locked_for_transaksi TO authenticated;

COMMENT ON FUNCTION public.is_unit_locked_for_transaksi IS
  'Cek apakah periode sudah ditutup buku untuk unit dari departemen tertentu. '
  'Return TRUE = terkunci, FALSE = bebas. Null departemen_id dianggap unit_pendidikan.';


-- 2. Helper view: v_status_tutup_buku
--    Memudahkan melihat status tutup buku per tahun ajaran per unit
--    tanpa query manual ke log_tutup_buku.
CREATE OR REPLACE VIEW public.v_status_tutup_buku AS
SELECT
  ta.id                     AS tahun_ajaran_id,
  ta.nama                   AS tahun_ajaran,
  ta.tanggal_mulai,
  ta.tanggal_selesai,
  ta.aktif,
  -- Unit Pendidikan
  CASE WHEN EXISTS (
    SELECT 1 FROM log_tutup_buku l
    WHERE l.tahun_ajaran_id = ta.id AND l.unit = 'unit_pendidikan'
  ) THEN TRUE ELSE FALSE END  AS ditutup_unit_pendidikan,
  -- Unit Usaha & Dana
  CASE WHEN EXISTS (
    SELECT 1 FROM log_tutup_buku l
    WHERE l.tahun_ajaran_id = ta.id AND l.unit = 'unit_usaha_dana'
  ) THEN TRUE ELSE FALSE END  AS ditutup_unit_usaha_dana,
  -- Timestamp tutup masing-masing unit
  (SELECT MAX(l.tanggal_proses) FROM log_tutup_buku l
   WHERE l.tahun_ajaran_id = ta.id AND l.unit = 'unit_pendidikan')
                              AS tgl_tutup_unit_pendidikan,
  (SELECT MAX(l.tanggal_proses) FROM log_tutup_buku l
   WHERE l.tahun_ajaran_id = ta.id AND l.unit = 'unit_usaha_dana')
                              AS tgl_tutup_unit_usaha_dana
FROM tahun_ajaran ta
ORDER BY ta.tanggal_mulai DESC;

GRANT SELECT ON public.v_status_tutup_buku TO authenticated;

COMMENT ON VIEW public.v_status_tutup_buku IS
  'View status tutup buku per tahun ajaran per unit. '
  'Gunakan ini untuk dashboard atau audit status periode.';
