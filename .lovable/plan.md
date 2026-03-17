

## Analisis Neraca dan Pendapatan Diterima di Muka

### Jawaban: Apakah Pembayaran Beda Tahun Ajaran Bermasalah?

**Tidak bermasalah** dari sisi akuntansi, karena alur jurnal sudah benar:
- Saat bayar di muka: Debit Kas, Kredit "Pendapatan Diterima di Muka" (liabilitas) — neraca tetap seimbang
- Saat diakui (pengakuan pendapatan): Debit "Pendapatan Diterima di Muka", Kredit Pendapatan — liabilitas berkurang, pendapatan bertambah

Neraca memang seharusnya **tidak filter per tahun ajaran** — neraca menghitung saldo kumulatif semua jurnal sampai tanggal tertentu. Ini sudah benar.

### Masalah yang Perlu Diperbaiki

#### 1. Laba/Rugi Berjalan Tidak Muncul di Ekuitas (KRITIS)
Neraca saat ini hanya menampilkan akun berjenis `aset`, `liabilitas`, `ekuitas`. Tapi **laba/rugi berjalan** (selisih pendapatan - beban) **tidak ditambahkan ke ekuitas**. Akibatnya neraca hampir pasti **tidak seimbang** karena sisi Aset bertambah dari kas masuk tapi sisi Ekuitas tidak mencerminkan laba.

Perbaikan: Hitung total pendapatan - beban dari jurnal di periode berjalan, tampilkan sebagai baris "Laba (Rugi) Berjalan" di bawah Ekuitas.

#### 2. Batas 1000 Baris Query Supabase
Query `jurnal_detail` tanpa limit bisa terpotong di 1000 baris untuk sekolah dengan transaksi banyak, menyebabkan saldo tidak akurat.

Perbaikan: Tambahkan pagination atau gunakan `.limit(10000)` untuk memastikan semua data terbaca.

#### 3. Akun Saldo Nol Tetap Ditampilkan
Akun dengan saldo 0 tetap muncul, membuat laporan panjang.

Perbaikan: Filter akun dengan saldo = 0 agar tidak ditampilkan (opsional, bisa toggle).

### Rencana Implementasi

**File: `src/pages/keuangan/TabNeracaAkuntansi.tsx`**

1. Tambahkan perhitungan **Laba/Rugi Berjalan**: query akun pendapatan dan beban, hitung selisihnya, tampilkan sebagai baris tambahan di bagian Ekuitas sebelum "Total Ekuitas"
2. Tambahkan `.limit(5000)` pada query jurnal_detail untuk menghindari pemotongan data
3. Sembunyikan akun dengan saldo 0 (dengan opsi toggle "Tampilkan semua akun")
4. Perbarui total Ekuitas agar menyertakan Laba/Rugi Berjalan

