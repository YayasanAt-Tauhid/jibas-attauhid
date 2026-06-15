-- Koreksi / Pembatalan tagihan salah input (belum dibayar)
-- 1. Kolom jejak pembatalan pada tagihan
-- 2. Izinkan status 'dibatalkan' pada trigger validasi

-- Kolom jejak (idempotent)
ALTER TABLE public.tagihan ADD COLUMN IF NOT EXISTS dibatalkan_alasan text;
ALTER TABLE public.tagihan ADD COLUMN IF NOT EXISTS dibatalkan_at timestamptz;
ALTER TABLE public.tagihan ADD COLUMN IF NOT EXISTS dibatalkan_oleh uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tagihan ADD COLUMN IF NOT EXISTS jurnal_pembalik_id uuid REFERENCES public.jurnal(id) ON DELETE SET NULL;

-- Perbarui trigger validasi status.
-- CATATAN: gabungkan seluruh status yang dipakai aplikasi — jangan hanya
-- belum_bayar/lunas seperti definisi migrasi awal (DB live sudah memakai
-- 'dihapusbuku' & 'sebagian'). Menambah 'dibatalkan' ke daftar yang ada.
CREATE OR REPLACE FUNCTION public.validate_tagihan_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('belum_bayar', 'sebagian', 'lunas', 'dihapusbuku', 'dibatalkan') THEN
    RAISE EXCEPTION 'status tagihan tidak valid: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;
