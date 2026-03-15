

## Perbaikan Tab Pengaturan Akun Keuangan

### Masalah Saat Ini
1. Hanya ada 3 setting statis (kas_tunai, bank_midtrans, kas_pengeluaran)
2. Dropdown menampilkan semua akun aset — termasuk "Perlengkapan Kantor" dan "Peralatan Sekolah" yang tidak relevan untuk kas/bank
3. Tidak bisa menambah setting custom

### Rencana

**1. Database: Tambah akun liabilitas + 2 setting baru**
- Insert akun `2-1003 Titipan Tabungan Siswa` (liabilitas) ke `akun_rekening`
- Insert 2 row ke `pengaturan_akun`:
  - `piutang_siswa` — Akun Piutang Siswa (default: Piutang SPP 1-1003)
  - `tabungan_siswa` — Akun Tabungan/Titipan Siswa (default: akun baru 2-1003)

**2. Refactor TabPengaturanAkun di `ReferensiKeuangan.tsx`**
- Tiap setting punya konfigurasi `allowedJenis` untuk filter dropdown:
  - kas_tunai, bank_midtrans, kas_pengeluaran → hanya akun aset dengan kode `1-100x` (kas/bank)
  - piutang_siswa → akun aset (piutang)
  - tabungan_siswa → akun liabilitas
- Render setting dari database (bukan hardcoded array) sehingga setting baru otomatis muncul
- Tambah tombol "Tambah Setting Custom" — user bisa menambah kode_setting, label, keterangan, dan pilih akun dari semua jenis
- Tambah tombol hapus untuk setting custom (3 setting bawaan tidak bisa dihapus)
- Deskripsi lebih ramah non-akuntan, misalnya: "Akun tempat uang masuk saat siswa bayar di kasir"

**3. Hook baru di `useJurnal.ts`**
- `useCreatePengaturanAkun` — insert row baru ke pengaturan_akun
- `useDeletePengaturanAkun` — hapus setting custom

### Detail Teknis

**Filter dropdown per setting:**

```text
Setting              | Filter Akun
─────────────────────┼──────────────────────
kas_tunai            | aset, kode starts 1-100
bank_midtrans        | aset, kode starts 1-100
kas_pengeluaran      | aset, kode starts 1-100
piutang_siswa        | aset (piutang)
tabungan_siswa       | liabilitas
custom               | semua jenis
```

**File yang diubah:**
- `src/hooks/useJurnal.ts` — tambah useCreatePengaturanAkun, useDeletePengaturanAkun
- `src/pages/keuangan/ReferensiKeuangan.tsx` — refactor TabPengaturanAkun: render dari DB, filter dropdown per setting, form tambah custom, hapus custom
- Database: insert 1 akun + 2 pengaturan_akun

