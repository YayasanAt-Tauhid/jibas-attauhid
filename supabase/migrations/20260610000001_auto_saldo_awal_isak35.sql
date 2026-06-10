-- RPC: isi_saldo_awal_isak35
-- Dipanggil setelah tutup buku untuk otomatis mengisi saldo_awal_isak35
-- tahun berikutnya berdasarkan saldo penutup tahun yang ditutup.
--
-- Parameter:
--   p_tahun_ditutup  : tahun yang baru ditutup (misal 2025)
--   p_tgl_mulai      : tanggal mulai tahun ajaran (misal 2025-04-17)
--   p_tgl_selesai    : tanggal selesai tahun ajaran (misal 2025-12-31)
--   p_kategori       : kategori departemen (misal ARRAY['unit_pendidikan'])
--
-- Logika:
--   1. Ambil semua akun balance sheet (aset, liabilitas, ekuitas) yang punya pos_isak35
--   2. Untuk setiap departemen di kategori tersebut, hitung saldo akhir
--   3. Upsert ke saldo_awal_isak35 untuk tahun p_tahun_ditutup + 1

CREATE OR REPLACE FUNCTION public.isi_saldo_awal_isak35(
  p_tahun_ditutup  int,
  p_tgl_mulai      date,
  p_tgl_selesai    date,
  p_kategori       text[]
)
RETURNS int   -- jumlah baris yang di-upsert
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tahun_baru   int := p_tahun_ditutup + 1;
  v_jumlah       int := 0;
BEGIN
  -- Hapus saldo_awal tahun baru yang mungkin sudah ada untuk unit ini
  -- (agar tidak double jika tutup buku dijalankan ulang)
  DELETE FROM saldo_awal_isak35 s
  WHERE s.tahun = v_tahun_baru
    AND s.departemen_id IN (
      SELECT id FROM departemen WHERE kategori = ANY(p_kategori)
    );

  -- Hitung saldo per akun per departemen lalu insert
  INSERT INTO saldo_awal_isak35 (departemen_id, tahun, akun_id, saldo)
  SELECT
    j.departemen_id,
    v_tahun_baru                                   AS tahun,
    jd.akun_id,
    CASE WHEN ar.saldo_normal = 'D'
      THEN COALESCE(SUM(jd.debit), 0) - COALESCE(SUM(jd.kredit), 0)
      ELSE COALESCE(SUM(jd.kredit), 0) - COALESCE(SUM(jd.debit), 0)
    END                                            AS saldo
  FROM jurnal_detail jd
  JOIN jurnal        j  ON j.id  = jd.jurnal_id
  JOIN departemen    d  ON d.id  = j.departemen_id
  JOIN akun_rekening ar ON ar.id = jd.akun_id
  WHERE j.tanggal  BETWEEN p_tgl_mulai AND p_tgl_selesai
    AND j.status   = 'posted'
    AND d.kategori = ANY(p_kategori)
    AND ar.jenis   IN ('aset', 'liabilitas', 'ekuitas')  -- hanya akun neraca
    AND ar.pos_isak35 IS NOT NULL
  GROUP BY j.departemen_id, jd.akun_id, ar.saldo_normal
  HAVING
    CASE WHEN ar.saldo_normal = 'D'
      THEN COALESCE(SUM(jd.debit), 0) - COALESCE(SUM(jd.kredit), 0)
      ELSE COALESCE(SUM(jd.kredit), 0) - COALESCE(SUM(jd.debit), 0)
    END <> 0;                                            -- skip saldo nol

  GET DIAGNOSTICS v_jumlah = ROW_COUNT;
  RETURN v_jumlah;
END;
$$;

GRANT EXECUTE ON FUNCTION public.isi_saldo_awal_isak35(int, date, date, text[]) TO authenticated;
