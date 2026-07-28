-- ─────────────────────────────────────────────────────────────────────────────
-- Kolom diskon pada tagihan
--
-- Makna kolom `nominal` TIDAK berubah: tetap jumlah yang harus dibayar (netto).
-- Itu penting karena seluruh jalur pembayaran (proses_pembayaran_atomik,
-- webhook Midtrans, rekap tunggakan, portal ortu) membaca kolom ini; mengubah
-- maknanya jadi bruto akan membuat orang tua ditagih lebih besar dari
-- seharusnya di semua tempat sekaligus.
--
-- Yang ditambah hanya jejak bruto & potongannya, untuk jurnal metode bruto dan
-- laporan "berapa total keringanan yang diberikan":
--     nominal_bruto  = tarif penuh sebelum potongan
--     nominal_diskon = besar potongan
--     nominal        = nominal_bruto - nominal_diskon   (invarian)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tagihan
  ADD COLUMN IF NOT EXISTS nominal_bruto   numeric(15,2),
  ADD COLUMN IF NOT EXISTS nominal_diskon  numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS siswa_diskon_id uuid REFERENCES public.siswa_diskon(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tagihan.nominal_bruto IS
  'Tarif penuh sebelum potongan. NULL pada baris lama = tidak pernah ada '
  'potongan, pakai COALESCE(nominal_bruto, nominal).';
COMMENT ON COLUMN public.tagihan.nominal_diskon IS
  'Besar potongan/keringanan. 0 = tidak ada potongan (jurnal tetap 2 baris).';
COMMENT ON COLUMN public.tagihan.siswa_diskon_id IS
  'Baris siswa_diskon yang dipakai saat menghitung potongan ini -- jejak audit '
  '"kenapa tagihan ini lebih murah".';

-- Backfill: seluruh tagihan lama belum mengenal diskon, jadi bruto = netto.
-- Hanya mengisi kolom baru; tidak menyentuh nominal, status, atau jurnal
-- mana pun.
UPDATE public.tagihan
SET nominal_bruto = nominal
WHERE nominal_bruto IS NULL;

-- Invarian netto = bruto - diskon, ditegakkan di DB supaya tidak ada jalur
-- (RPC baru, patch manual, import) yang bisa menyimpan kombinasi yang tidak
-- konsisten dengan jurnalnya. NOT VALID: baris lama tidak dipindai ulang --
-- backfill di atas sudah membuat semuanya konsisten, dan VALIDATE pada tabel
-- besar mengunci tabel lebih lama dari yang perlu.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tagihan_diskon_konsisten'
      AND conrelid = 'public.tagihan'::regclass
  ) THEN
    ALTER TABLE public.tagihan
      ADD CONSTRAINT tagihan_diskon_konsisten
      CHECK (
        nominal_diskon >= 0
        AND (nominal_bruto IS NULL OR nominal_bruto >= nominal_diskon)
        AND (nominal_bruto IS NULL OR nominal = nominal_bruto - nominal_diskon)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tagihan_siswa_diskon
  ON public.tagihan (siswa_diskon_id) WHERE siswa_diskon_id IS NOT NULL;
