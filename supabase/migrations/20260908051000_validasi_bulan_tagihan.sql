-- Lindungi seluruh jalur pembuatan tagihan dari nilai bulan di luar 1..12.
-- NULL tetap valid untuk jenis pembayaran sekali.

ALTER TABLE public.tagihan
  DROP CONSTRAINT IF EXISTS tagihan_bulan_valid;

ALTER TABLE public.tagihan
  ADD CONSTRAINT tagihan_bulan_valid
  CHECK (bulan IS NULL OR bulan BETWEEN 1 AND 12);
