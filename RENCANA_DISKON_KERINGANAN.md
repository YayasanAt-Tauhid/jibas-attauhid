# Rencana: Diskon/Keringanan SPP (Beasiswa, Kakak-Adik, Bantuan, Kurang Mampu)

> Status: **rencana, belum diimplementasi**. Ditulis 15 Juli 2026 untuk diteruskan ke sesi berikutnya.
> Rekomendasi: kerjakan dengan `claude-opus-4-8` (schema migration + logika jurnal akuntansi — kategori "tugas berat" di CLAUDE.md).
> Sebelum mulai coding, lihat "Keputusan yang Masih Perlu Diambil" di bagian akhir file ini.

## 1. Latar Belakang & Prinsip Akuntansi

Idealnya diskon/keringanan biaya pendidikan dicatat dengan **metode bruto + akun kontra-pendapatan**, bukan langsung menagih nominal netto (metode netto yang dipakai sekarang). Alasannya: transparansi pelaporan ke pengurus yayasan/donor (berapa total beasiswa diberikan, ke siapa, skema apa) dan audit trail — hilang kalau diskon cuma jadi "harga lebih murah" tanpa jejak.

Jurnal per tagihan yang kena diskon (3 baris, tetap balance):
```
Dr Piutang SPP                  = nominal netto (yang harus dibayar)
Dr Potongan/Keringanan SPP      = nominal diskon   (akun kontra-pendapatan)
   Cr Pendapatan SPP            = nominal bruto (tarif penuh)
```
Kalau tidak ada diskon, tetap 2 baris seperti sekarang (backward compatible).

### Kondisi Saat Ini (sebelum rencana ini)
- Tabel `tagihan` + `tarif_tagihan` (tarif fleksibel per siswa/kelas/tahun, fungsi `get_tarif_siswa()`) sudah solid, generate massal via RPC atomik `generate_tagihan_batch`.
- COA (`akun_rekening`) dan jurnal double-entry (`jurnal` + `jurnal_detail`) sudah ada, atomik via RPC.
- **Diskon/keringanan belum jadi entitas terstruktur** — saat ini hanya override nominal tagihan lebih rendah di `TabTarifTagihan.tsx` dengan kolom `keterangan` bebas teks (placeholder: "Misal: Beasiswa prestasi, potongan 50%"). Tidak ada kategori, persentase vs nominal tetap, masa berlaku, approval, atau laporan total diskon.
- Tidak ada NIK/No. KK tersimpan di mana pun — tidak ada identitas keluarga yang solid untuk deteksi kakak-adik otomatis.
- Tidak ada trigger/constraint DB yang mencegah UPDATE/DELETE pada jurnal berstatus `posted` — proteksi baru berupa konvensi kode (fungsi `is_unit_locked_for_transaksi` + pola aplikasi yang selalu insert jurnal pembalik/koreksi, tidak pernah edit jurnal lama). Ini gap lama, tidak disebabkan rencana ini, tapi relevan untuk hardening (lihat §6, opsional).

## 2. Skema Database Baru (semua additive — lihat §5 untuk jaminan keamanan data lama)

### `keluarga`
Identitas keluarga untuk deteksi kakak-adik yang reliable (dipilih karena tidak ada NIK/KK di sistem).
```sql
id uuid pk
nama text            -- "Keluarga Bpk. Ahmad"
created_at timestamptz
```

### `siswa.keluarga_id` (kolom baru, nullable FK → keluarga)
Diisi manual/via review saran otomatis (lihat §3), bukan auto-apply diam-diam.

### `skema_diskon`
Master jenis potongan.
```sql
id uuid pk
nama text              -- "Beasiswa Prestasi", "Potongan Anak ke-2", "Keringanan Kurang Mampu"
kategori text           -- beasiswa | keringanan | kakak_adik | bantuan | lainnya
tipe text                -- persen | nominal
nilai_default numeric
perlu_approval boolean default true
aktif boolean default true
keterangan text
```

### `siswa_diskon`
Assignment diskon ke siswa tertentu — ini basis data untuk halaman "Siswa Penerima Diskon" (§4).
```sql
id uuid pk
siswa_id fk siswa
skema_diskon_id fk skema_diskon
jenis_id fk jenis_pembayaran (nullable = berlaku semua jenis pembayaran)
tahun_ajaran_id fk tahun_ajaran
nilai numeric (override nilai_default, nullable)
tanggal_mulai / tanggal_selesai (nullable)
status text default 'disetujui'   -- diajukan | disetujui | ditolak
disetujui_oleh fk users_profile
dokumen_url text (nullable)        -- bukti pendukung, mis. SKTM untuk kurang mampu
catatan text
unique (siswa_id, skema_diskon_id, tahun_ajaran_id, jenis_id)
```

### Akun COA baru
Tambah di `akun_rekening`: kode baru (mis. `4102`) — **"Potongan/Keringanan SPP"**, jenis `pendapatan`, berfungsi kontra (saldo_normal `debit`).

### Kolom baru di `tagihan` (nullable)
```sql
nominal_bruto numeric   -- tarif penuh sebelum diskon
nominal_diskon numeric default 0
```
Kolom `nominal` (lama) tetap dipertahankan maknanya = jumlah yang harus dibayar (netto) — kode pembayaran existing tidak perlu berubah.

## 3. Deteksi Kakak-Adik/Saudara (semi-otomatis)

Tidak ada NIK/KK → deteksi 100% otomatis tidak reliable. Pendekatan: **sistem menyarankan, admin konfirmasi sekali, tersimpan permanen** di `siswa.keluarga_id` (tidak dihitung ulang tiap kali).

Sinyal pencocokan yang dikombinasikan:
1. `ortu_siswa.user_id` sama antar siswa (satu akun ortu daftarkan beberapa anak) — sinyal terkuat.
2. Kecocokan teks `nama_ayah` + `nama_ibu` di `siswa_detail` (dinormalisasi: lowercase, trim).
3. Opsional: `alamat_ortu`/`telepon_ortu` sebagai sinyal tambahan, bukan penentu tunggal.

Alur:
1. Fungsi `saran_kelompok_keluarga()` (dipicu manual dari halaman admin) → hasilkan daftar kandidat grup keluarga + skor kecocokan, untuk **direview**, bukan langsung diterapkan.
2. Admin klik "Konfirmasi sebagai satu keluarga" → insert `keluarga`, isi `siswa.keluarga_id` untuk siswa-siswa terkait. Saran salah → admin abaikan/edit manual.
3. Setelah `keluarga_id` terisi: tombol "Terapkan Potongan Kakak-Adik" per keluarga → urutkan siswa by tanggal lahir, saran nilai diskon berjenjang (anak ke-2, ke-3, dst sesuai `nilai_default` skema), admin konfirmasi → insert baris `siswa_diskon`.

Kategori "bantuan" dan "kurang mampu" **tidak butuh deteksi khusus** — cukup `skema_diskon` biasa yang diinput manual via halaman di §4, dengan `dokumen_url` sebagai jejak verifikasi.

## 4. Perubahan RPC `generate_tagihan_batch`

Untuk tagihan **baru** (dibuat setelah migrasi aktif):
1. Hitung `nominal_bruto` via `get_tarif_siswa()` (tidak berubah).
2. Cari `siswa_diskon` aktif & disetujui untuk siswa+jenis+tahun ajaran → jumlahkan diskon berlaku.
3. `nominal` (netto) = `nominal_bruto - nominal_diskon`, floor di 0.
4. Jurnal 3-baris jika ada diskon, 2-baris seperti sekarang jika tidak (lihat §1).

Tagihan lama **tidak diproses ulang** oleh perubahan ini.

## 5. Halaman UI Baru

### a. Skema Diskon & Beasiswa (Referensi Keuangan)
CRUD `skema_diskon` — nama, kategori, tipe, nilai default, perlu approval atau tidak.

### b. Siswa Penerima Diskon/Keringanan — `/keuangan/diskon-siswa`
Ini yang diminta eksplisit: halaman untuk melihat & menambah diskon siswa ke depannya.
- **Tabel daftar**: siswa, skema diskon, nilai, tahun ajaran, status, masa berlaku.
- **Filter**: kategori, kelas, tahun ajaran, status.
- **Tombol "Tambah Diskon"**: pilih siswa → pilih skema → nilai (override opsional) → tanggal berlaku → catatan/dokumen.
- **Riwayat per siswa**: supaya tahun ajaran berikutnya tinggal lihat histori, tidak input dari nol.
- Tombol "Saran Kakak-Adik" (lihat §3) terintegrasi di halaman ini.

### c. Laporan
Total diskon diberikan per skema/periode — dari `tagihan.nominal_diskon` atau saldo akun "Potongan/Keringanan SPP" di buku besar.

## 6. Hardening Opsional — Immutability Jurnal Posted

Tidak berkaitan langsung dengan fitur diskon, tapi ditemukan saat riset: tidak ada trigger DB yang mencegah UPDATE/DELETE pada `jurnal`/`jurnal_detail` berstatus `posted`. Kalau mau ditegakkan di level DB (bukan cuma konvensi kode), tambahkan:
```sql
-- BEFORE UPDATE OR DELETE ON jurnal / jurnal_detail
-- Tolak jika OLD.status = 'posted' (jurnal header)
```
Ini aman terhadap pola existing (yang selalu insert jurnal pembalik/koreksi baru, tidak pernah edit jurnal posted).

## 7. Keamanan Data Lama

Rencana ini **murni additive**:
- `CREATE TABLE` (`keluarga`, `skema_diskon`, `siswa_diskon`) — tabel baru, tidak menyentuh data existing.
- `ADD COLUMN ... NULLABLE` di `siswa` dan `tagihan` — tidak mengubah baris lama.
- Backfill kolom baru di `tagihan`: `UPDATE tagihan SET nominal_bruto = nominal, nominal_diskon = 0 WHERE nominal_bruto IS NULL` — hanya isi kolom baru, **tidak menyentuh jurnal manapun**.
- RPC `generate_tagihan_batch` yang dimodifikasi hanya berlaku untuk tagihan **baru**, tidak memproses ulang tagihan/jurnal lama.
- Tidak ada `UPDATE`/`DELETE` terhadap `jurnal`/`jurnal_detail` lama di rencana manapun di sini. Kalau nanti ingin "merapikan" tagihan lama yang dulu didiskon manual, itu lewat **jurnal koreksi baru** (insert, bukan edit) — sesuai pola existing (`pembatalan_pembayaran_hard_delete.sql`, `backfill_jurnal_pembayaran_midtrans_historis.sql`).

## 8. Urutan File Migrasi (usulan)

1. `..._add_akun_potongan_spp.sql` — akun kontra-pendapatan di `akun_rekening`
2. `..._add_keluarga_siswa.sql` — tabel `keluarga` + kolom `siswa.keluarga_id`
3. `..._add_skema_diskon.sql` — tabel `skema_diskon`, `siswa_diskon` (+ RLS)
4. `..._add_kolom_diskon_tagihan.sql` — `nominal_bruto`, `nominal_diskon` di `tagihan` + backfill data lama
5. `..._update_generate_tagihan_batch_diskon.sql` — RPC `generate_tagihan_batch` versi baru (hitung diskon, jurnal 3-baris)
6. (opsional) `..._hardening_jurnal_immutability.sql` — trigger proteksi jurnal posted (§6)

## Keputusan yang Masih Perlu Diambil (sebelum mulai coding)

- **Kombinasi diskon**: kalau satu siswa kena beberapa skema sekaligus (mis. kakak-adik + kurang mampu), apakah dijumlah semua, ambil yang terbesar saja, atau ada cap maksimum persentase total?
- **Approval workflow**: siapa yang berhak approve `siswa_diskon` berstatus `diajukan` → `disetujui`? Role apa (kepala sekolah/keuangan/yayasan)?
- Konfirmasi nilai default berjenjang untuk kakak-adik (mis. anak ke-2 berapa %, anak ke-3+ berapa %) — beda kebijakan tiap yayasan.
