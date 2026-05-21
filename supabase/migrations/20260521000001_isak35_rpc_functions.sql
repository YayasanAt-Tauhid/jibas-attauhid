-- RPC: hitung_mutasi_akun
-- Agregasi debit/kredit per akun dari jurnal posted dalam satu tahun
-- Digunakan oleh hook useISAK35 untuk menghindari batas 1000 row Supabase client
CREATE OR REPLACE FUNCTION hitung_mutasi_akun(
  p_tahun int,
  p_departemen_id uuid DEFAULT NULL
)
RETURNS TABLE(akun_id uuid, total_debit numeric, total_kredit numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jd.akun_id,
    COALESCE(SUM(jd.debit),  0) AS total_debit,
    COALESCE(SUM(jd.kredit), 0) AS total_kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  WHERE j.status = 'posted'
    AND EXTRACT(YEAR FROM j.tanggal)::int = p_tahun
    AND (p_departemen_id IS NULL OR j.departemen_id = p_departemen_id)
  GROUP BY jd.akun_id;
$$;

GRANT EXECUTE ON FUNCTION hitung_mutasi_akun(int, uuid) TO authenticated;

-- RPC: get_detail_jurnal_kas
-- Mengambil seluruh baris jurnal_detail dari jurnal posted dalam satu tahun
-- yang memiliki setidaknya satu baris pada akun kas/bank (p_akun_kas_ids).
-- Hasilnya mencakup semua baris jurnal tersebut (sisi kas DAN sisi lawan)
-- agar metode langsung arus kas dapat memetakan lawan transaksi.
CREATE OR REPLACE FUNCTION get_detail_jurnal_kas(
  p_tahun        int,
  p_akun_kas_ids uuid[],
  p_departemen_id uuid DEFAULT NULL
)
RETURNS TABLE(jurnal_id uuid, akun_id uuid, debit numeric, kredit numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_detail_jurnal_kas(int, uuid[], uuid) TO authenticated;
