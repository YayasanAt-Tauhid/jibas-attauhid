-- ─────────────────────────────────────────────────────────────────────────────
-- Akun kontra-pendapatan untuk potongan/keringanan
--
-- Diskon dicatat dengan METODE BRUTO: tagihan yang kena potongan tetap mengakui
-- pendapatan sebesar tarif penuh, lalu potongannya didebit ke akun kontra
-- tersendiri.
--
--     (D) Piutang Siswa            = nominal netto (yang harus dibayar)
--     (D) Potongan/Keringanan      = nominal diskon
--         (K) Pendapatan <jenis>   = nominal bruto (tarif penuh)
--
-- Alasan memilih metode bruto ketimbang langsung menagih netto: pengurus
-- yayasan/donor perlu tahu BERAPA total keringanan yang diberikan tiap periode
-- dan lewat skema apa. Kalau diskon cuma jadi "harga lebih murah", angka itu
-- hilang sama sekali dari laporan dan tidak bisa diaudit.
--
-- CATATAN KODE AKUN: rencana awal (RENCANA_DISKON_KERINGANAN.md) mengusulkan
-- kode 4102, tapi kode itu SUDAH DIPAKAI "PENDAPATAN SPP ASRAMA" di DB live.
-- Grup 4600 masih kosong (4000/4100/4200/4300/4400/4500 sudah terpakai), jadi
-- potongan ditempatkan sebagai grup sendiri di 4600.
--
-- saldo_normal memakai 'D'/'K' -- konvensi yang benar-benar dipakai di DB live
-- (bukan 'debit'/'kredit' yang muncul di sebagian dropdown UI).
--
-- Akun ini ber-jenis 'pendapatan' tapi bersaldo normal DEBIT (kontra). Itu
-- sudah otomatis benar di laporan: hitung_laba_rugi_komersial menghitung
-- pendapatan sebagai SUM(kredit - debit) untuk seluruh akun ber-jenis
-- 'pendapatan', sehingga debit di akun potongan langsung MENGURANGI pendapatan
-- tanpa perlu mengubah RPC laporan mana pun.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Akun COA ─────────────────────────────────────────────────────────────
INSERT INTO public.akun_rekening (kode, nama, jenis, saldo_normal, keterangan, aktif)
VALUES
  ('4600', 'POTONGAN & KERINGANAN PENDAPATAN', 'pendapatan', 'D',
   'Akun induk potongan pendapatan (kontra-pendapatan).', true),
  ('4601', 'POTONGAN/KERINGANAN SPP', 'pendapatan', 'D',
   'Kontra-pendapatan: beasiswa, keringanan kurang mampu, potongan kakak-adik, bantuan.', true)
ON CONFLICT (kode) DO NOTHING;

-- ── 2. Setting global akun potongan ─────────────────────────────────────────
-- Mengikuti pola AKUN_PENDAPATAN_DIMUKA: satu akun default tingkat aplikasi,
-- bisa dioverride per jenis pembayaran (lihat langkah 3).
INSERT INTO public.pengaturan_akun (kode_setting, label, keterangan, akun_id)
VALUES (
  'AKUN_POTONGAN_PENDAPATAN',
  'Akun Potongan/Keringanan (Kontra-Pendapatan)',
  'Didebit sebesar nominal diskon saat tagihan yang kena keringanan diakui. '
  'Dipakai bila jenis pembayaran tidak punya akun potongan sendiri.',
  (SELECT id FROM public.akun_rekening WHERE kode = '4601')
)
ON CONFLICT (kode_setting) DO UPDATE
  SET akun_id = COALESCE(public.pengaturan_akun.akun_id, EXCLUDED.akun_id);

-- ── 3. Override per jenis pembayaran ────────────────────────────────────────
-- Mis. potongan SPP dan potongan uang pangkal ingin dipisah akunnya supaya
-- laporan per-lembaga bisa membedakan. NULL = pakai setting global di atas.
ALTER TABLE public.jenis_pembayaran
  ADD COLUMN IF NOT EXISTS akun_potongan_id uuid REFERENCES public.akun_rekening(id);

COMMENT ON COLUMN public.jenis_pembayaran.akun_potongan_id IS
  'Akun kontra-pendapatan yang didebit sebesar nominal diskon untuk jenis ini. '
  'NULL = fallback ke pengaturan_akun.AKUN_POTONGAN_PENDAPATAN.';
