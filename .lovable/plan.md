

## Masalah: Laporan Penerimaan Mencampur Pembayaran Beda Tahun Ajaran

### Analisis

Di `TabPenerimaan` (LaporanKeuangan.tsx line 84-158), query pembayaran hanya filter berdasarkan `tanggal_bayar` — tidak memisahkan pembayaran berdasarkan `tahun_ajaran_id`. Akibatnya:

- Pembayaran SPP untuk TA 2025/2026 dan TA 2026/2027 tampil bersama di satu laporan
- Pembayaran di muka (yang harusnya masuk sebagai **Pendapatan Diterima di Muka / Unearned Revenue**) terlihat sama seperti pembayaran biasa
- Ini menyesatkan laporan keuangan karena secara akuntansi, pembayaran di muka belum boleh diakui sebagai pendapatan

Sistem `PengakuanPendapatan.tsx` sudah benar mencatat ke tabel `pendapatan_dimuka` dan membuat jurnal penyesuaian saat diakui. Tapi laporan penerimaan belum memanfaatkan data ini.

### Rencana Perbaikan

**File: `src/pages/keuangan/LaporanKeuangan.tsx` — TabPenerimaan**

1. **Tambah filter Tahun Ajaran** di TabPenerimaan agar user bisa filter pembayaran per TA
2. **Tambah kolom "Tahun Ajaran"** di tabel penerimaan (join ke `tahun_ajaran:tahun_ajaran_id(nama)`)
3. **Tambah kolom/badge "Di Muka"** — cek apakah keterangan mengandung `[DIMUKA]` atau ada record di `pendapatan_dimuka` untuk pembayaran tersebut, dan tampilkan badge visual
4. **Pisahkan subtotal**: tampilkan total pendapatan biasa vs total pembayaran di muka di bagian bawah

**File: `src/pages/keuangan/LaporanKeuangan.tsx` — TabNeraca**

5. **Pisahkan penerimaan biasa vs di muka** di neraca bulanan, agar pembayaran di muka masuk ke kategori terpisah (Kewajiban/Liability) bukan Penerimaan

### Detail Perubahan

- Query `pembayaran` di TabPenerimaan: tambah join `tahun_ajaran:tahun_ajaran_id(nama)` dan optional filter `.eq("tahun_ajaran_id", filterTA)`
- Tambah state `filterTahunAjaran` dan dropdown Select di toolbar
- Tambah kolom tabel: "TA" dan "Status" (badge Di Muka / Reguler)
- Cross-reference dengan tabel `pendapatan_dimuka` untuk menandai pembayaran di muka
- Di summary bawah, pisahkan: "Total Penerimaan Reguler" dan "Total Pembayaran Di Muka (Belum Diakui)"

