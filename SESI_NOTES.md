# Catatan Sesi — 10 Mei 2026

## Info Penting (Paste di Awal Sesi Baru)

### MCP & Infrastruktur
- **MCP VPS2** sudah terpasang — tinggal pakai
- **Supabase project aktif:** `Hijrah At-Tauhid v2` (ID: `leyfwwmroijwnkrcblxe`)
- **Aplikasi:** `D:\Today\08 Mei 2026\jibas-friend-finder-main` (React + TypeScript + Supabase + Tailwind)
- **Bridge script:** `C:\Users\Lenovo\mcp-bridge.py`
- **Stack VPS:** `/home/attauhid/` — script migrasi jurnal ada di sini

### Status Data Jurnal (per 10 Mei 2026)
- VPS (MariaDB): 2025-04-11 s/d 2026-05-09, total ~13.601+ jurnal
- Supabase: s/d 2026-05-08 — **ada 1 jurnal belum sync**: `replid 794`, tanggal 2026-05-09, keterangan "LOKAL KELAS TAHAP 3", dept 8
- Perlu dimigrasi saat ada waktu

### Keputusan Desain Penting
- `tahun_ajaran` = milik **Akademik** — periode belajar (Juli–Juni), punya semester, jadwal, rapor
- `tahun_buku` = milik **Keuangan** — periode fiskal, punya tutup buku, tagihan, pembayaran, jurnal
- Keduanya bisa beda rentang tanggal dan beda siklus aktif
- Tabel `tahun_ajaran` di DB **tidak di-rename** — dibuat tabel baru `tahun_buku` terpisah
- FK keuangan dipindah satu per satu dari `tahun_ajaran` → `tahun_buku`
- `angkatan_id` sudah ditambah ke `tarif_tagihan` dan RPC `get_tarif_siswa` (Batch 10, selesai)

---

## Rencana: Pisah Tahun Ajaran (Akademik) & Tahun Buku (Keuangan)

### Latar Belakang
Tabel `tahun_ajaran` saat ini dipakai oleh **20 FK** di 18 tabel, mencakup dua domain:
- **Akademik:** kelas_siswa, jadwal, kalender_akademik, semester, kkm, komentar_rapor,
  nilai_kd, penilaian, presensi_kbm, presensi_siswa, remedial, rpp
- **Keuangan:** tagihan, tarif_tagihan, pembayaran, pendapatan_dimuka,
  penyisihan_piutang, log_tutup_buku, transaksi_midtrans_item

Akademik dan keuangan kadang punya periode berbeda — pisah tabel agar masing-masing
bisa dikelola mandiri.

---

## Tahap 1 — DB: Buat Tabel `tahun_buku` & Pindah FK Keuangan

### 1a. Buat tabel `tahun_buku`
```sql
CREATE TABLE tahun_buku (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama             TEXT NOT NULL,
  tanggal_mulai    DATE NOT NULL,
  tanggal_selesai  DATE NOT NULL,
  aktif            BOOLEAN DEFAULT false,
  ditutup          BOOLEAN DEFAULT false,
  keterangan       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

### 1b. Copy data dari `tahun_ajaran` ke `tahun_buku`
```sql
INSERT INTO tahun_buku (id, nama, tanggal_mulai, tanggal_selesai, aktif, ditutup, keterangan)
SELECT id, nama, tanggal_mulai, tanggal_selesai, aktif, ditutup, keterangan
FROM tahun_ajaran;
```
> Pakai ID yang sama agar semua FK lama yang dipindah tidak perlu update data

### 1c. Pindahkan FK keuangan — satu per satu
Tabel yang FK-nya dipindah dari `tahun_ajaran` → `tahun_buku`:

| Tabel | Kolom |
|---|---|
| `tagihan` | `tahun_ajaran_id` |
| `tarif_tagihan` | `tahun_ajaran_id` |
| `pembayaran` | `tahun_ajaran_id` |
| `pendapatan_dimuka` | `tahun_ajaran_pembayaran_id`, `tahun_ajaran_target_id` |
| `penyisihan_piutang` | `tahun_ajaran_id` |
| `log_tutup_buku` | `tahun_ajaran_id` |
| `transaksi_midtrans_item` | `tahun_ajaran_id` |

Kolom **tidak di-rename** di DB (tetap `tahun_ajaran_id`) — rename hanya di label UI.
Hanya FK constraint yang diganti references-nya ke `tahun_buku`.

### 1d. Update RPC & View
- `proses_pembayaran_atomik` — SELECT dari `tahun_ajaran WHERE aktif=true` untuk
  `pendapatan_dimuka` → ganti ke `tahun_buku WHERE aktif=true`
- `is_periode_ditutup` — cek `tahun_ajaran.ditutup` → ganti ke `tahun_buku.ditutup`
- `is_unit_pendidikan_ditutup` — sudah pakai `log_tutup_buku.tahun_ajaran_id`,
  referensi ini nanti menunjuk ke `tahun_buku`
- `get_tarif_siswa` — param `p_tahun_ajaran_id` tetap, query ke `tarif_tagihan`
  yang FK-nya sudah ke `tahun_buku` → tidak perlu ubah body RPC
- View `v_tagihan_belum_bayar` — JOIN ke `tahun_ajaran ta ON ta.aktif=true`
  → ganti ke `tahun_buku`

### Status Tahap 1 ✅ SELESAI (10 Mei 2026)
- [x] Buat tabel `tahun_buku`
- [x] Copy data dari `tahun_ajaran` (2 baris, ID sama)
- [x] Pindah FK: `tagihan`
- [x] Pindah FK: `tarif_tagihan`
- [x] Pindah FK: `pembayaran`
- [x] Pindah FK: `pendapatan_dimuka` (2 kolom)
- [x] Pindah FK: `penyisihan_piutang`
- [x] Pindah FK: `log_tutup_buku`
- [x] Pindah FK: `transaksi_midtrans_item`
- [x] Update RPC `proses_pembayaran_atomik` (step 7: FROM tahun_buku)
- [x] Update RPC `is_periode_ditutup` (FROM tahun_buku)
- [x] Update view `v_tagihan_belum_bayar` (JOIN tahun_buku)
- Note: `is_unit_pendidikan_ditutup` tidak perlu diubah — sudah query log_tutup_buku.tahun_ajaran_id yang FK-nya sudah ke tahun_buku

---

## Tahap 2 — Edge Functions

### File yang perlu diubah:
- `supabase/functions/generate-tagihan/index.ts`
  - Query `tahun_ajaran` untuk validasi → ganti ke `tahun_buku`
- `supabase/functions/proses-pembayaran/index.ts`
  - Fetch `tahun_ajaran.nama` untuk keterangan jurnal → ganti ke `tahun_buku`
  - Parameter `tahun_ajaran_id` di body → tetap nama parameternya, tapi query ke `tahun_buku`

### Status Tahap 2 ✅ SELESAI (10 Mei 2026)
- [x] Update `proses-pembayaran/index.ts`
  - Baris cek periode ditutup: `from("tahun_ajaran")` → `from("tahun_buku")`
  - Baris fetch nama untuk keterangan jurnal: `from("tahun_ajaran")` → `from("tahun_buku")`
- [x] `generate-tagihan/index.ts` — tidak ada query langsung ke `tahun_ajaran`, tidak perlu diubah
- [x] Deploy `proses-pembayaran` ✓
- [x] Deploy `generate-tagihan` ✓

---

## Tahap 3 — Frontend: Pisah Hook & Update Halaman

### Hook baru yang perlu dibuat di `useKeuangan.ts`
```ts
// Baru — untuk keuangan
export function useTahunBuku() { ... }          // semua tahun buku
export function useTahunBukuAktif() { ... }     // tahun buku aktif saat ini
```

Hook lama tetap ada untuk akademik:
```ts
export function useTahunAjaran() { ... }        // tetap → akademik
export function useTahunAjaranAktif() { ... }   // tetap → akademik
```

### Halaman keuangan yang pakai `useTahunAjaran` → ganti ke `useTahunBuku`:

| File | Perubahan |
|---|---|
| `src/pages/keuangan/TabTarifTagihan.tsx` | `useTahunAjaran` → `useTahunBuku` |
| `src/pages/keuangan/InputPembayaran.tsx` | `useTahunAjaranAktif` + `useTahunAjaran` → `useTahunBukuAktif` + `useTahunBuku` |
| `src/pages/keuangan/TunggakanPembayaran.tsx` | cek & update |
| `src/pages/keuangan/ReferensiKeuangan.tsx` | `TabTahunBuku` sudah pakai nama benar, tinggal update query ke tabel `tahun_buku` |
| `src/pages/portal/PortalTagihan.tsx` | update hook |
| `src/pages/portal/PortalDashboard.tsx` | update hook |
| `src/pages/portal/PortalCheckout.tsx` | update hook |
| `src/hooks/useKeuangan.ts` | `checkPeriodeLocked` cek `tahun_ajaran.ditutup` → `tahun_buku.ditutup` |

### Halaman akademik — tidak perlu diubah:
kelas_siswa, jadwal, semester, penilaian, presensi, rapor, dll — semua tetap pakai
`useTahunAjaran` yang query ke tabel `tahun_ajaran`.

### Referensi UI:
- Halaman **Referensi Keuangan → Tab Tahun Buku** → query ke tabel `tahun_buku` (CRUD)
- Halaman **Referensi Akademik → Tab Tahun Ajaran** → read-only, query ke tabel `tahun_ajaran`
  (sudah dibuat read-only di sesi sebelumnya — tinggal pastikan tidak ikut kena dampak)

### Status Tahap 3 ✅ SELESAI (10 Mei 2026)
- [x] Tambah `useTahunBuku` + `useTahunBukuAktif` + CRUD (`useCreateTahunBuku`, `useUpdateTahunBuku`, `useDeleteTahunBuku`, `useAktifkanTahunBuku`) di `useKeuangan.ts`
- [x] Update `checkPeriodeLocked` → query `tahun_buku` (bukan `tahun_ajaran`)
- [x] Update `TabTarifTagihan.tsx` — import + hook call
- [x] Update `InputPembayaran.tsx` — import + hook call
- [x] Update `TunggakanPembayaran.tsx` — import + hook call
- [x] Update `ReferensiKeuangan.tsx` — import hook baru + `TabTahunBuku` pakai `useTahunBuku`
- [x] `PortalTagihan.tsx`, `PortalDashboard.tsx`, `PortalCheckout.tsx` — tidak ada `useTahunAjaran`, tidak perlu diubah

---

## Catatan Teknis Penting

### Kenapa kolom tidak di-rename di DB
Rename kolom `tahun_ajaran_id` → `tahun_buku_id` di 7 tabel keuangan berarti:
- Update semua query di frontend, edge functions, RPC sekaligus
- Risiko miss satu kolom → silent bug
- Tidak ada manfaat runtime — yang penting FK-nya sudah ke tabel benar

Cukup rename di **label UI saja** (dari "Tahun Ajaran" → "Tahun Buku") di halaman keuangan.

### Copy ID dari `tahun_ajaran` ke `tahun_buku`
Dengan menyamakan UUID, semua data yang sudah ada di `tagihan`, `pembayaran`, dll
langsung valid setelah FK dipindah — tidak perlu UPDATE data sama sekali.

### Urutan migrasi yang aman
1. Buat `tahun_buku` + copy data (read-only, tidak merusak apapun)
2. Pindah FK satu per satu (setiap step bisa di-rollback)
3. Update RPC & view (tidak ada downtime karena DB kosong)
4. Update edge functions + deploy
5. Update frontend hook per file

---

## Koreksi Pasca Tahap 3 (10 Mei 2026)
- `ReferensiAkademik.tsx` → `TabTahunAjaran` dikembalikan ke **full CRUD** ke tabel `tahun_ajaran`
  - Tambah, Edit, Hapus, Aktifkan — semua bisa dilakukan dari `/akademik/referensi`
  - Guard hapus: cek `kelas_siswa` dulu sebelum delete
  - Sebelumnya read-only dengan alert menyuruh ke Referensi Keuangan — ini salah desain

### ⚠️ Data — Perlu Dimigrasi
- [ ] Jurnal `replid 794` (2026-05-09, "LOKAL KELAS TAHAP 3") belum ada di Supabase.
  Jalankan script migrasi di VPS saat siap.

---

## Cara Mulai Sesi Berikutnya
> "Saya punya MCP VPS2 dan Supabase Hijrah At-Tauhid v2 (ID: leyfwwmroijwnkrcblxe).
> Aplikasi ada di D:\Today\08 Mei 2026\jibas-friend-finder-main.
> Lanjutkan dari SESI_NOTES.md — kerjakan rencana pisah tahun_ajaran & tahun_buku mulai Tahap 1."
