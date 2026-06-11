-- ============================================================
-- Akun pendapatan diterima dimuka per jenis pembayaran
-- (sudah diterapkan ke remote via MCP apply_migration
--  "akun_dimuka_per_jenis_pembayaran", 11 Jun 2026)
--
-- Realita sekolah punya beberapa akun dimuka (2106 uang pangkal,
-- 2107 SPP Juli, 2110 hibah). Satu setting global AKUN_PENDAPATAN_DIMUKA
-- mencampur semuanya, jadi tiap jenis pembayaran kini bisa menunjuk
-- akun dimuka sendiri; NULL = fallback ke setting global.
-- ============================================================

ALTER TABLE public.jenis_pembayaran
  ADD COLUMN IF NOT EXISTS akun_dimuka_id uuid REFERENCES public.akun_rekening(id);

COMMENT ON COLUMN public.jenis_pembayaran.akun_dimuka_id IS
  'Akun liabilitas yang dikredit saat pembayaran jenis ini diterima di muka; NULL = pakai setting global AKUN_PENDAPATAN_DIMUKA';

-- Seed sesuai COA: SPP -> 2107, Uang Pangkal -> 2106
UPDATE public.jenis_pembayaran
SET akun_dimuka_id = (SELECT id FROM public.akun_rekening WHERE kode = '2107')
WHERE nama ILIKE '%SPP%' AND akun_dimuka_id IS NULL;

UPDATE public.jenis_pembayaran
SET akun_dimuka_id = (SELECT id FROM public.akun_rekening WHERE kode = '2106')
WHERE nama ILIKE '%pangkal%' AND akun_dimuka_id IS NULL;
