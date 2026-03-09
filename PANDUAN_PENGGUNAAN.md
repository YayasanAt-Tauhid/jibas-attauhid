# Panduan Penggunaan JIBAS — Dari PSB hingga Pembayaran

Dokumen ini menjelaskan alur penggunaan aplikasi JIBAS dari awal setup data referensi, pendaftaran siswa baru (PSB), hingga proses pembayaran.

---

## Daftar Isi

1. [Persiapan Awal (Setup Referensi)](#1-persiapan-awal-setup-referensi)
2. [Pendaftaran Siswa Baru (PSB)](#2-pendaftaran-siswa-baru-psb)
3. [Penerimaan & Aktivasi Siswa](#3-penerimaan--aktivasi-siswa)
4. [Penempatan Kelas](#4-penempatan-kelas)
5. [Setup Keuangan](#5-setup-keuangan)
6. [Pembayaran PSB (Calon Siswa)](#6-pembayaran-psb-calon-siswa)
7. [Pembayaran Rutin (Siswa Aktif)](#7-pembayaran-rutin-siswa-aktif)
8. [Portal Orang Tua](#8-portal-orang-tua)

---

## 1. Persiapan Awal (Setup Referensi)

Sebelum menggunakan aplikasi, data referensi harus diisi terlebih dahulu.

### a. Buat Akun Admin
- Daftarkan user pertama melalui halaman login
- Ubah role user menjadi `admin` di tabel `users_profile` melalui Supabase Dashboard

### b. Setup Departemen/Lembaga
**Menu:** `Pengaturan → Profil Yayasan`
- Tambahkan lembaga (contoh: SMP, SMA, MI, MTs)
- Isi kode dan nama lembaga

### c. Setup Tahun Ajaran
**Menu:** `Akademik → Referensi Akademik → tab Tahun Ajaran`
- Buat tahun ajaran aktif (contoh: "2025/2026")
- Pastikan status **Aktif**

### d. Setup Semester
**Menu:** `Akademik → Referensi Akademik → tab Semester`
- Buat semester (contoh: "Semester 1", "Semester 2")
- Pilih tahun ajaran terkait
- Isi urutan (1, 2)

### e. Setup Tingkat
**Menu:** `Akademik → Referensi Akademik → tab Tingkat`
- Buat tingkat per lembaga (contoh: Kelas VII, VIII, IX untuk SMP)
- Pilih lembaga terkait

### f. Setup Kelas
**Menu:** `Akademik → Referensi Akademik → tab Kelas`
- Buat kelas per tingkat (contoh: VII-A, VII-B)
- Pilih lembaga, tingkat, dan wali kelas

### g. Setup Angkatan
**Menu:** `Akademik → Referensi Akademik → tab Angkatan`
- Buat angkatan per lembaga (contoh: "2025/2026")

### h. Setup Mata Pelajaran
**Menu:** `Akademik → Referensi Akademik → tab Mata Pelajaran`
- Tambahkan mata pelajaran per lembaga & tingkat

---

## 2. Pendaftaran Siswa Baru (PSB)

**Menu:** `Akademik → Penerimaan Siswa Baru`

### Langkah:
1. Klik tombol **"Daftarkan Calon Siswa"**
2. Isi formulir:
   - Nama Lengkap (wajib)
   - Jenis Kelamin
   - Angkatan
   - Telepon
   - Alamat
3. Klik **"Daftarkan"**
4. Siswa akan masuk dengan status **"calon"**

### Catatan:
- Siswa berstatus "calon" belum masuk ke daftar siswa aktif
- Dashboard PSB menampilkan statistik: Total Pendaftar, Menunggu, Diterima

---

## 3. Penerimaan & Aktivasi Siswa

**Menu:** `Akademik → Penerimaan Siswa Baru`

### Alur status siswa:
```
calon → diterima → aktif
```

### Langkah:
1. Pada tabel PSB, klik tombol **"Terima"** untuk mengubah status calon → diterima
2. Setelah diterima, klik **"Aktifkan"** untuk mengubah status diterima → aktif
3. Siswa berstatus **aktif** akan muncul di menu `Akademik → Data Siswa`

---

## 4. Penempatan Kelas

**Menu:** `Akademik → Data Siswa → Detail Siswa`

### Langkah:
1. Buka detail siswa yang sudah aktif
2. Tempatkan siswa ke kelas yang sesuai
3. Data penempatan disimpan di tabel `kelas_siswa` dengan tahun ajaran terkait

> **Penting:** Penempatan kelas diperlukan agar siswa bisa mengikuti presensi, penilaian, dan laporan per kelas.

---

## 5. Setup Keuangan

Sebelum menerima pembayaran, setup referensi keuangan.

### a. Jenis Pembayaran
**Menu:** `Keuangan → Referensi Keuangan`
- Tambahkan jenis pembayaran (contoh: SPP, Uang Pangkal, Biaya Pendaftaran)
- Isi nominal default
- Pilih lembaga terkait
- Pilih akun pendapatan (COA) jika sudah di-setup

### b. Jenis Pengeluaran
**Menu:** `Keuangan → Referensi Keuangan`
- Tambahkan kategori pengeluaran

### c. Chart of Account (COA)
**Menu:** `Keuangan → Referensi Keuangan → tab Akun Rekening`
- Setup akun rekening untuk akuntansi (Kas, Bank, Pendapatan SPP, dll)

---

## 6. Pembayaran PSB (Calon Siswa)

**Menu:** `Keuangan → Pembayaran PSB`

Pembayaran ini khusus untuk siswa berstatus **"calon"** (belum aktif).

### Langkah:
1. Pilih **Lembaga**
2. Cari nama calon siswa (ketik minimal 2 huruf)
3. Pilih calon siswa dari hasil pencarian
4. Isi form pembayaran:
   - Jenis Pembayaran (contoh: Biaya Pendaftaran, Uang Pangkal)
   - Jumlah (otomatis terisi dari nominal default)
   - Tanggal Bayar
   - Keterangan
5. Klik **"Simpan Pembayaran"**
6. Riwayat pembayaran PSB ditampilkan di sebelah kanan

---

## 7. Pembayaran Rutin (Siswa Aktif)

**Menu:** `Keuangan → Input Pembayaran`

Untuk siswa berstatus **"aktif"** yang sudah ditempatkan di kelas.

### Langkah:
1. Pilih **Lembaga**
2. Cari siswa (nama atau NIS)
3. Pilih siswa dari hasil pencarian
4. Isi form pembayaran:
   - Jenis Pembayaran (contoh: SPP)
   - Bulan (1-12)
   - Jumlah
   - Tanggal Bayar
   - Keterangan
5. Klik **"Simpan Pembayaran"**
6. Sistem otomatis membuat **jurnal akuntansi** jika akun pendapatan sudah di-setup

### Laporan Terkait:
- **Laporan Per Siswa:** `Keuangan → Laporan Per Siswa`
- **Laporan Per Kelas:** `Keuangan → Laporan Per Kelas`
- **Tunggakan:** `Keuangan → Tunggakan`
- **Rekap Harian:** `Keuangan → Rekap Harian`

---

## 8. Portal Orang Tua

**URL:** `/portal`

Orang tua dapat mengakses portal untuk:
- Melihat tagihan dan riwayat pembayaran
- Melihat nilai dan presensi anak
- Melakukan pembayaran online (jika Midtrans dikonfigurasi)

### Setup Akun Orang Tua:
**Menu:** `Pengaturan → Manajemen Orang Tua`
1. Buat akun orang tua (email + password)
2. Hubungkan akun orang tua ke siswa melalui tabel `ortu_siswa`

---

## Ringkasan Alur Lengkap

```
┌─────────────────────────────────────────────────────────────┐
│  1. SETUP REFERENSI                                         │
│     Departemen → Tahun Ajaran → Semester → Tingkat →       │
│     Kelas → Angkatan → Mata Pelajaran                      │
├─────────────────────────────────────────────────────────────┤
│  2. SETUP KEUANGAN                                          │
│     Akun Rekening (COA) → Jenis Pembayaran →               │
│     Jenis Pengeluaran                                       │
├─────────────────────────────────────────────────────────────┤
│  3. PSB (Penerimaan Siswa Baru)                             │
│     Daftarkan Calon → Bayar PSB → Terima → Aktifkan        │
├─────────────────────────────────────────────────────────────┤
│  4. AKADEMIK                                                │
│     Tempatkan Kelas → Jadwal → Presensi → Penilaian        │
├─────────────────────────────────────────────────────────────┤
│  5. KEUANGAN RUTIN                                          │
│     Input Pembayaran SPP → Laporan → Tutup Buku            │
├─────────────────────────────────────────────────────────────┤
│  6. PORTAL ORANG TUA                                        │
│     Lihat Tagihan → Bayar Online → Lihat Nilai/Presensi    │
└─────────────────────────────────────────────────────────────┘
```

---

## FAQ

### Q: Apakah bisa bayar PSB sebelum siswa diterima?
**A:** Ya, menu Pembayaran PSB memungkinkan pembayaran untuk siswa berstatus "calon".

### Q: Apa beda Pembayaran PSB dan Input Pembayaran?
**A:** Pembayaran PSB khusus untuk calon siswa (pendaftaran, uang pangkal awal). Input Pembayaran untuk siswa aktif (SPP bulanan, dll).

### Q: Bagaimana jika siswa pindah atau keluar?
**A:** Gunakan menu `Akademik → Mutasi Siswa` untuk mengubah status siswa.

### Q: Siapa saja role yang tersedia?
**A:** `admin`, `kepala_sekolah`, `guru`, `keuangan`, `kasir`, `pustakawan`, `siswa`, `ortu`

### Q: Bagaimana cara backup data?
**A:** Menu `Pengaturan → Backup & Export Data` untuk mengexport seluruh tabel ke Excel.
