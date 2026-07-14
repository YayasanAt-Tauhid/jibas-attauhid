# Catatan Sesi — terakhir diperbarui 14 Juli 2026

> File ini dibaca otomatis oleh Claude Code di awal sesi (lihat CLAUDE.md → Kontinuitas Antar Sesi).
> Update file ini di akhir setiap pengerjaan yang berarti: apa yang selesai, keputusan + alasannya, langkah berikutnya.
> Jangan catat yang sudah terekam di git history — cukup konteks yang tidak terlihat dari kode.

## Info Penting

### Infrastruktur
- **Supabase project aktif:** `Hijrah At-Tauhid v2` (ID: `leyfwwmroijwnkrcblxe`)
- **Repo:** `YayasanAt-Tauhid/jibas-attauhid` (GitHub)
- **MCP VPS2** terpasang — stack VPS di `/home/attauhid/` (script migrasi jurnal dari MariaDB lama)
- Deploy: Cloudflare Worker — `VITE_SUPABASE_URL`/`PUBLISHABLE_KEY` di-sync via CI ke Worker runtime secret

### Status Data
- Data jurnal VPS (MariaDB) ↔ Supabase **sudah sinkron** (dikonfirmasi 14 Juli 2026) — termasuk `replid 794` yang dulu tertinggal. Tidak ada migrasi data yang tertunda.

## Keputusan Desain Penting

- `tahun_ajaran` = milik **Akademik** — periode belajar (Juli–Juni): semester, jadwal, rapor, presensi
- `tahun_buku` = milik **Keuangan** — periode fiskal: tutup buku, tagihan, pembayaran, jurnal
- Keduanya bisa beda rentang tanggal dan beda siklus aktif; tabel terpisah di DB
- Kolom FK di 7 tabel keuangan **tetap bernama** `tahun_ajaran_id` (tidak di-rename — hanya FK constraint yang menunjuk ke `tahun_buku`; rename hanya di label UI). Alasan: rename massal berisiko silent bug tanpa manfaat runtime
- UUID `tahun_buku` disamakan dengan `tahun_ajaran` asal — data lama langsung valid tanpa UPDATE
- Pembatalan tagihan/pembayaran dan pembayaran Midtrans harus **atomik via RPC** (bukan loop per-baris dari client) — hindari silent-fail dan limit subrequest Worker

## Status Terkini (per 14 Juli 2026)

Fokus pekerjaan Juni–Juli: penguatan modul **Keuangan** dan **Portal ortu**.

- **Tagihan:** generate & batalkan massal kini atomik via RPC batch per-bulan; koreksi pembatalan; label status dibatalkan diperbaiki; tidak lagi tampil "sukses" saat generate gagal total
- **Pembayaran/Midtrans:** jurnal online payment atomik (dulu bisa silent-fail); backfill jurnal historis; biaya admin transaksi Midtrans; webhook menandai tagihan lunas; pembatalan pembayaran (termasuk hard delete + revoke anon)
- **Tutup buku:** per unit pendidikan; checklist pengingat sebelum tutup buku; RPC buku besar
- **Referensi Keuangan:** filter Lembaga/Kelas/Tahun Buku/Siswa di tabel Pengaturan Tarif & Daftar Tagihan; auto-isi Lembaga dari data siswa
- **Portal ortu:** urutan tagihan kronologis; tampilkan tahun ajaran di tagihan bulanan & sekali bayar; perbaikan checkout (bulan null, prioritas `tahun_ajaran_id` tagihan)
- **Akademik:** import data siswa dari Excel, dukung update via NIS
- **UI:** desain baru Keuangan At-Tauhid (tema hijau, dark mode)
- **Keamanan:** Supabase key pindah ke env var; edge functions lama dihapus
- **Migrasi & types `generate_tagihan_batch` (14 Juli):** definisi RPC + unique index `tagihan_unique` kini tercatat di `supabase/migrations/20260714120000_generate_tagihan_batch_rpc.sql` (disalin verbatim dari database via `pg_get_functiondef`, tervalidasi dengan menjalankannya di project Clone); `types.ts` dipatch dengan tipe fungsi tersebut — 6 error tsc lama di `server/tagihan.ts` hilang
- **Input tarif massal per-siswa (14 Juli):** dialog "Tambah Massal" di Tab Tarif Tagihan — pilih siswa via combobox atau import Excel (template: nis, nominal, keterangan; lookup NIS satu query), nominal bisa per-baris atau seragam, deteksi duplikat vs tarif yang sudah ada, insert satu batch atomik, generate tagihan sekali panggil via param baru `siswa_ids` di server function (RPC `generate_tagihan_batch` sudah mendukung daftar siswa — TANPA perubahan skema DB)
- **UX Tab Tarif Tagihan (14 Juli):** input nominal berformat Rupiah (komponen `RupiahInput`, tolak nilai ≤ 0), pesan validasi eksplisit (bukan tombol disabled bisu), urutan field mengikuti dependensi (Lembaga → Jenis → target), reset pilihan kini diberi notifikasi toast, pencarian siswa diganti `SiswaCombobox` (debounce, keyboard nav, loading/empty state — dipakai di 3 tempat), konfirmasi khusus untuk generate semua-siswa, mode edit jadi ringkasan read-only, deteksi tarif duplikat, filter Angkatan ikut Lembaga

## Pekerjaan Terbuka

- **Refactor form Tarif Tagihan ke react-hook-form + zod** — form masih pakai `useState` mentah, menyimpang dari konvensi proyek; ditunda agar perubahan UX tetap mudah direview
- **Error tsc `context is possibly undefined`** di semua file `src/server/*.ts` (typing authMiddleware) — pola lama, belum diperbaiki
- **Verifikasi migrasi `20260714120000_generate_tagihan_batch_rpc.sql` di produksi** — file migrasi dibuat dari definisi verbatim database (via project Clone `rumdeqkrtfjxckqgokoy`; project produksi `leyfwwmroijwnkrcblxe` tidak terjangkau dari MCP sesi ini). Isinya idempoten (IF NOT EXISTS + CREATE OR REPLACE), tapi tetap cocokkan sekali dengan produksi saat menjalankan `supabase db push` / apply berikutnya

---

## Arsip — Pisah `tahun_ajaran` & `tahun_buku` (✅ SELESAI, 10 Mei 2026)

Ringkasan (detail lengkap ada di versi lama file ini: `git log -p SESI_NOTES.md`):

- **Tahap 1 (DB):** tabel `tahun_buku` dibuat, data di-copy dengan UUID sama, FK 7 tabel keuangan dipindah (`tagihan`, `tarif_tagihan`, `pembayaran`, `pendapatan_dimuka`, `penyisihan_piutang`, `log_tutup_buku`, `transaksi_midtrans_item`), RPC (`proses_pembayaran_atomik`, `is_periode_ditutup`) & view `v_tagihan_belum_bayar` diupdate
- **Tahap 2 (Edge Functions):** `proses-pembayaran` query ke `tahun_buku`; sudah di-deploy
- **Tahap 3 (Frontend):** hook `useTahunBuku`/`useTahunBukuAktif` + CRUD di `useKeuangan.ts`; halaman keuangan pindah hook; halaman akademik tetap `useTahunAjaran`
- **Koreksi pasca:** `TabTahunAjaran` di Referensi Akademik dikembalikan ke full CRUD (dengan guard hapus cek `kelas_siswa`)
