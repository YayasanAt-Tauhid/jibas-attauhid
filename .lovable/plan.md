

## Analisis Menu & Sub-Modul Keuangan

Setelah memeriksa kode sidebar, routing, dan semua halaman laporan keuangan, berikut temuan dan rencana perbaikan:

### Temuan Masalah

#### 1. TabLabaRugi: Tidak Mendukung Filter Lembaga & Limit 1000 Baris
- `TabLabaRugi` tidak menerima prop `departemenId`, sehingga filter lembaga global di Laporan Keuangan tidak berlaku untuk Laba Rugi
- Query `jurnal_detail` masih tanpa pagination (terkena limit default 1000 baris Supabase), sama seperti masalah Neraca yang sudah diperbaiki sebelumnya

#### 2. TabArusKas: Tidak Berbasis Jurnal
- Arus Kas mengambil data langsung dari tabel `pembayaran` dan `pengeluaran`, bukan dari `jurnal_detail`
- Ini inkonsisten dengan Neraca dan Laba Rugi yang berbasis jurnal (accrual basis)
- Akibatnya: angka Arus Kas bisa tidak cocok dengan laporan akuntansi lainnya

#### 3. Tab "Neraca Bulanan" Redundan
- Ada 2 tab neraca: "Neraca Bulanan" (cash-basis, dari tabel pembayaran/pengeluaran) dan "Neraca" (accrual-basis, dari jurnal)
- "Neraca Bulanan" sebenarnya bukan neraca akuntansi yang benar, lebih mirip ringkasan kas masuk/keluar per bulan
- Membingungkan user karena angkanya akan berbeda

#### 4. Terlalu Banyak Tab di Laporan Keuangan (8 Tab)
- Penerimaan, Pengeluaran, Rekap SPP, Neraca Bulanan, Laba Rugi, Neraca, Arus Kas, Konsolidasi Yayasan
- Sulit dinavigasi, terutama di layar kecil

### Rencana Perbaikan

#### A. Perbaiki TabLabaRugi
- Tambahkan prop `departemenId` dan filter query berdasarkan `jurnal.departemen_id`
- Implementasi pagination batch (sama seperti perbaikan Neraca sebelumnya) untuk mengatasi limit 1000 baris

#### B. Perbaiki TabArusKas agar Berbasis Jurnal
- Ubah sumber data dari tabel `pembayaran`/`pengeluaran` menjadi dari `jurnal_detail` dengan filter akun bertipe Kas/Bank
- Tetap tampilkan breakdown Kas Masuk (kredit ke akun Kas) dan Kas Keluar (debit dari akun Kas)
- Tambahkan pagination batch

#### C. Rename/Hapus Tab Redundan
- Rename tab "Neraca Bulanan" menjadi "Ringkasan Kas" agar tidak membingungkan dengan Neraca akuntansi yang sebenarnya
- Atau hapus jika dirasa tidak perlu (karena sudah ada Rekap Harian yang fungsinya serupa)

#### D. Reorganisasi Tab Menjadi 2 Kelompok
Pisahkan 8 tab menjadi sub-group yang lebih jelas:
- **Operasional**: Penerimaan, Pengeluaran, Rekap SPP, Konsolidasi Yayasan
- **Akuntansi**: Laba Rugi, Neraca, Arus Kas

### File yang Akan Diubah
1. `src/pages/keuangan/TabLabaRugi.tsx` — tambah filter lembaga + pagination
2. `src/pages/keuangan/TabArusKas.tsx` — ubah ke jurnal-based + pagination
3. `src/pages/keuangan/LaporanKeuangan.tsx` — reorganisasi tab, hapus/rename Neraca Bulanan, pass departemenId ke TabLabaRugi

