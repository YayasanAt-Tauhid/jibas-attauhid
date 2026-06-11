-- ============================================================
-- Hardening proses pembayaran (sudah diterapkan ke remote via
-- MCP apply_migration "hardening_proses_pembayaran", 11 Jun 2026)
-- ============================================================

-- 1. Tutup celah: RPC hanya boleh dipanggil service role (edge function).
--    Default Postgres memberi EXECUTE ke PUBLIC sehingga semua user login
--    bisa memanggil fungsi SECURITY DEFINER ini langsung via PostgREST.
REVOKE EXECUTE ON FUNCTION public.proses_pembayaran_atomik(uuid,uuid,int,numeric,date,text,uuid,uuid,boolean,uuid,uuid,uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;

-- 2. Anti-duplikat pembayaran bulanan (guard race condition;
--    cek duplikasi di edge function tidak atomik)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pembayaran_siswa_jenis_bulan_ta
  ON public.pembayaran (siswa_id, jenis_id, bulan, tahun_ajaran_id)
  WHERE bulan IS NOT NULL;

-- 3. Konfigurasi akun yang masih kosong:
--    kas_tunai -> 1100 KAS UMUM, pendapatan dimuka -> 2107 (SPP Juli).
--    Bisa diganti kapan pun lewat Pengaturan Akun.
UPDATE public.pengaturan_akun
SET akun_id = (SELECT id FROM public.akun_rekening WHERE kode = '1100')
WHERE kode_setting = 'kas_tunai' AND akun_id IS NULL;

UPDATE public.pengaturan_akun
SET akun_id = (SELECT id FROM public.akun_rekening WHERE kode = '2107')
WHERE kode_setting = 'AKUN_PENDAPATAN_DIMUKA' AND akun_id IS NULL;
