-- Biaya admin yang dibebankan ke customer saat checkout online (di luar total tagihan),
-- karena "Split Midtrans fee with customers" belum bisa diaktifkan di akun Midtrans.
-- Disimpan terpisah dari total_amount (yang tetap = jumlah tagihan) supaya jurnal
-- otomatis di midtrans-notification tidak berubah — biaya admin ini murni menutup
-- potongan fee Midtrans saat payout, bukan pendapatan sekolah.
alter table public.transaksi_midtrans
  add column if not exists biaya_admin numeric not null default 0;
