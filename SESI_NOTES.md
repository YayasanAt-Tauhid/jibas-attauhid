# Catatan Sesi — terakhir diperbarui 28 Juli 2026

> File ini dibaca otomatis oleh Claude Code di awal sesi (lihat CLAUDE.md → Kontinuitas Antar Sesi).
> Update file ini di akhir setiap pengerjaan yang berarti: apa yang selesai, keputusan + alasannya, langkah berikutnya.
> Jangan catat yang sudah terekam di git history — cukup konteks yang tidak terlihat dari kode.

## Info Penting

### Infrastruktur
- **Supabase project aktif (28 Juli 2026, dikonfirmasi user):** `Hijrah At-Tauhid V4` (ID: `oquzygbekjpbmafuqiot`, dibuat 23 Juli 2026) — menggantikan V2. Branch produksi juga sudah pindah dari `versi-2` ke `versi-4` (lihat commit "Update deploy workflow for versi-4 branch", 24 Juli). **Catatan lama soal `rumdeqkrtfjxckqgokoy` (V2) sudah usang** — jangan dipakai lagi sebagai target migrasi/query, meski `supabase/config.toml` & `.env.example` masih menunjuk ke sana (belum sempat di-update sesi ini; env var Supabase yang sebenarnya dipakai di produksi diatur lewat GitHub Environment secrets per branch, bukan file di repo)
- Project lama `leyfwwmroijwnkrcblxe` (V1) TIDAK dipakai lagi. `cnvkfvhvmhswhsrdynll` ("Hijrah At-Tauhid Clone V2") = clone lama untuk uji coba, kemungkinan juga sudah usang mengikuti pindahnya V2→V4
- **Perhatian `supabase db push`:** nomor versi di ledger migrasi remote berbeda dari nama file di `supabase/migrations/` (banyak migrasi diterapkan via MCP `apply_migration` dengan timestamp sendiri) — jangan jalankan `db push` buta; objek DB-nya sendiri sudah sesuai file migrasi terbaru (diverifikasi 16 Juli)
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

### Akrual tagihan (28 Juli 2026)

- **Piutang diakui saat JATUH TEMPO, bukan saat tagihan di-input.** Sekolah meng-input SPP jauh di muka (6 tahun untuk kelas 1 SD, 3 tahun untuk kelas 7/10). Sebelum ini `generate_tagihan_batch` langsung memposting D Piutang / K Pendapatan untuk setiap tagihan — artinya pendapatan 6 tahun ke depan diakui hari ini. Sekarang tagihan yang belum jatuh tempo berstatus `terjadwal`: **tersimpan sebagai jadwal tanpa jurnal sama sekali** (bukan pendapatan diterima di muka — belum ada transaksi apa pun yang perlu dibukukan)
- **Tunggakan bukan akun tersendiri.** Lewat jatuh tempo tanpa bayar tetap memakai akun Piutang Siswa yang sama; yang berubah hanya umur piutangnya (aging). Karena itu tidak ada jurnal tambahan saat tagihan menjadi tunggakan
- **Bayar sebelum jatuh tempo → liabilitas, bukan pendapatan.** Kas masuk tapi jasa belum diberikan, jadi K Pendapatan Diterima di Muka (akun 2107/2106), diakui jadi pendapatan saat periodenya tiba. Ini menyambungkan mesin `pendapatan_dimuka` yang sudah ada — dulu hanya terpicu oleh pembayaran untuk tahun ajaran lain, sekarang juga oleh pembayaran atas tagihan `terjadwal`
- **Hari jatuh tempo** diatur per jenis pembayaran (`jenis_pembayaran.hari_jatuh_tempo`, default 10)
- **Tahun kalender sebuah bulan diturunkan dari bulan awal periodenya**, bukan di-hardcode Juli–Juni. Alasannya sistem ini memakai dua konvensi sekaligus (tahun buku Jan–Des, tahun ajaran Jul–Jun) dan keduanya memakai kolom `tagihan.bulan` yang sama — rumus turunan itu benar untuk keduanya. Logika ini kembar di SQL (`hitung_jatuh_tempo_tagihan`) dan TS (`src/lib/jatuhTempo.ts`); **kalau salah satu diubah, ubah keduanya**
- **Tanggal jurnal akrual memakai `current_date`, bukan tanggal jatuh tempo** — supaya job yang telat jalan tidak menyisipkan jurnal bertanggal mundur ke bulan yang laporannya sudah terbit / bukunya sudah ditutup. Tanggal jatuh tempo yang presisi tetap tersimpan di `tagihan.jatuh_tempo` untuk laporan umur piutang

## Status Sebelumnya (per 14 Juli 2026)

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

- **App mobile Portal Ortu — fase 2 (16 Juli):** (1) **Checkout Midtrans in-app**: logika `createPayment` diekstrak jadi `buatTransaksiSnap()` (validasi & keamanan identik untuk kedua jalur), API route baru `POST /api/portal/checkout` (auth bearer JWT Supabase, identitas customer diambil dari token — bukan dari body), respons kini menyertakan `redirect_url` Snap; di app: keranjang module-level + layar `/checkout`, Snap dibuka via `openAuthSessionAsync` dengan callback deep link `portalortu://riwayat?order=...`. (2) **Push notification**: migrasi `20260716080000_perangkat_push_ortu.sql` (tabel token + RPC `daftarkan_push_token` SECURITY DEFINER agar token bisa pindah akun secara atomik; `types.ts` dipatch manual), helper server `kirimPushKeOrtu()` (Expo Push API, best-effort, hapus token DeviceNotRegistered) dipanggil dari webhook Midtrans saat lunas; app registrasi token setelah login (tabs layout), hapus token saat logout, tap notifikasi navigasi ke `data.url`. Endpoint di-smoke-test via vite dev (401 tanpa/dgn token invalid, OPTIONS 204+CORS); `tsc` app mobile bersih; build web sukses. Catatan: `expo lint` di apps/portal-ortu belum jalan (config eslint root tak menjangkau subfolder — kondisi bawaan fase 1)

- **Beres-beres Supabase (16 Juli):** user mengonfirmasi project aktif = `rumdeqkrtfjxckqgokoy` (catatan lama soal `leyfwwmroijwnkrcblxe` usang). Migrasi `20260716080000_perangkat_push_ortu` **sudah diterapkan** ke project aktif via MCP (tabel + RPC + 2 policy terverifikasi) — push notification tinggal menunggu EAS projectId. Migrasi `20260714120000_generate_tagihan_batch_rpc` terverifikasi ada di project aktif (fungsi + index `tagihan_unique`). Ditemukan & dibereskan: `buku_besar_mutasi`/`buku_besar_saldo_awal` punya overload ganda (versi lama tanpa `p_exclude_koreksi` tertinggal — pola bug `get_tarif_siswa`); overload lama di-drop via migrasi `20260716090000_drop_buku_besar_old_overloads.sql`. Referensi hardcoded `leyfwwmroijwnkrcblxe` diganti di `ManajemenPengguna.tsx` (link dashboard) & `scripts/migrasi_jurnal.py`/`migrasi_jbsfina.py` (default URL)

- **App mobile Portal Ortu — fase 1 (16 Juli):** aplikasi Expo baru di `apps/portal-ortu/` (React Native + Expo Router, SDK 57, branch `claude/react-native-expo-ssr-ssg-3qt5m1`). Login khusus role `ortu`, tab Beranda/Tagihan/Presensi/Nilai/Profil + layar Riwayat Pembayaran; query Supabase identik dengan portal web (queryKey sama). Keputusan: dipilih **app Expo khusus portal** (bukan migrasi seluruh proyek ke Expo, bukan Capacitor/PWA) — scope kecil (7 layar), memungkinkan push notification native, web admin + SSR tak tersentuh; SSR/SSG tidak relevan untuk app native. Tipe DB di-share type-only dari `src/integrations/supabase/types.ts`; util format (Rupiah, bulan akademik) disalin karena Metro tidak bisa bundle modul Vite — detail di `apps/portal-ortu/README.md`

## Status Terkini (per 28 Juli 2026)

- **Akrual piutang SPP berbasis jatuh tempo (28 Juli):** 4 migrasi (`20260728100000`–`20260728100003`) + RPC `jalankan_akrual_jatuh_tempo`, server function `src/server/akrual.ts`, tab **Akrual Jatuh Tempo** di Manajemen Piutang. Keputusan desainnya di bagian "Akrual tagihan" di atas
  - **Migrasi SUDAH diterapkan ke Supabase (28 Juli, sesi lanjutan)** — ke project aktif `oquzygbekjpbmafuqiot` (V4) via MCP `apply_migration`, satu per satu, dengan verifikasi skema live sebelum tiap langkah (kolom/fungsi/constraint yang dipakai migrasi dicek dulu ada semuanya — `tagihan_unique`, `jurnal_piutang_id`, `pendapatan_dimuka.pembayaran_id NOT NULL`, view `v_tagihan_belum_bayar` urutan kolom, dll — semua cocok). Setelah apply: `jalankan_akrual_jatuh_tempo()` dites jalan tanpa error (tabel `tagihan` di V4 masih kosong jadi hasilnya nol, tapi tidak ada error runtime). `get_advisors` dicek ulang — tidak ada lint baru yang muncul akibat migrasi ini (35 fungsi `SECURITY DEFINER` executable oleh anon/authenticated sudah ada sebelumnya di seluruh app, bukan regresi baru — lihat item "Pekerjaan Terbuka" di bawah)
  - Ledger migrasi Supabase (`list_migrations`) kosong sama sekali untuk project V4 ini — konsisten dengan pola lama (migrasi diterapkan via MCP dengan timestamp sendiri, bukan lewat `supabase db push`). **Jangan jalankan `db push` buta** ke project ini
  - Divalidasi (sebelum diterapkan) dengan menjalankan keempat migrasi di Postgres 16 lokal (throwaway) di atas harness skema minimal, lalu mengetes skenario nyata 6 tahun × 12 bulan: dari 72 tagihan hanya 13 yang jatuh temponya sudah lewat yang terjurnal (Rp 4,55 jt); 59 sisanya (Rp 20,65 jt) tersimpan `terjadwal` tanpa jurnal. Juga diuji: idempotensi (jalan 2×, jurnal tidak bertambah), bayar di muka → kredit 2107 + baris `pendapatan_dimuka`, pengakuan → D 2107 / K 4101, semua jurnal balance, dan pemotongan hari akhir bulan (31 Feb → 28/29). Harness-nya throwaway, tidak masuk repo — repo memang belum punya infrastruktur tes SQL
- **Dua bug lama yang ikut ketahuan & diperbaiki:**
  - `proses_pembayaran_atomik` langkah 8 meng-INSERT ke `pendapatan_dimuka` memakai nama kolom yang tidak ada (`tahun_ajaran_id`, `tanggal`, `jurnal_id`, `keterangan`). PL/pgSQL baru mem-parse statement saat dieksekusi, jadi ini tidak pernah terlihat saat fungsi dibuat — **setiap pembayaran dengan "bayar di muka" dicentang pasti gagal runtime**
  - `proses_pembayaran_midtrans_atomik` selalu mengkredit Pendapatan dan hanya menutup tagihan `belum_bayar`. Begitu tagihan `terjadwal` tampil di portal, tagihan yang dibayar online tidak akan tertutup lalu **tertagih dua kali** saat jatuh tempo
- **Drift skema yang ditemukan:** view `v_tagihan_belum_bayar` di DB live punya kolom `tahun_ajaran_mulai` (dipakai `PortalTagihan`) yang tidak ada di file migrasi mana pun. Sudah ikut ditulis ulang di migrasi baru. `CREATE OR REPLACE VIEW` tidak bisa menghapus/menyusun ulang kolom, jadi urutan kolom lama wajib dipertahankan persis — kolom baru hanya boleh ditambah di akhir

## Pekerjaan Terbuka

- **`supabase/config.toml` & `.env.example` sudah disinkronkan ke V4** (`oquzygbekjpbmafuqiot`, 28 Juli). Yang masih tertinggal: `scripts/.env` (masih menunjuk `leyfwwmroijwnkrcblxe`, V1) dan `src/pages/pengaturan/ManajemenPengguna.tsx`/`scripts/migrasi_jurnal.py`/`scripts/migrasi_jbsfina.py` (masih menunjuk `rumdeqkrtfjxckqgokoy`, V2) — belum diminta user, belum disentuh
- **35 fungsi `SECURITY DEFINER` di project V4 executable langsung oleh role `anon`/`authenticated`** (ditemukan lewat `get_advisors` setelah menerapkan migrasi akrual 28 Juli — termasuk 3 dari migrasi ini: `generate_tagihan_batch`, `hitung_jatuh_tempo_tagihan`, `proses_pembayaran_atomik`; tapi pola ini sudah ada sebelumnya di ~32 fungsi lain, bukan regresi baru). Kalau fungsi-fungsi keuangan ini memang dipanggil klien lewat anon key (bukan cuma dari `src/server/*.ts` dengan service role), siapa pun yang login bisa langsung memanggil RPC pembuatan tagihan/jurnal tanpa melalui pengecekan otorisasi di server function. Perlu ditinjau: fungsi mana yang benar-benar perlu dipanggil client-side, sisanya di-`REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` mengikuti pola yang sudah dipakai di RPC akrual baru
- **2 tabel backup lama (`_backup_jurnal_20260712`, `_backup_jurnal_detail_20260712`) sempat RLS-disabled (terbuka ke anon/authenticated) di V4 — sudah di-DROP (28 Juli, dikonfirmasi user) setelah dicek tidak ada di migrasi manapun**, jadi tidak perlu tindakan lanjutan untuk ini

- **Pembatalan tagihan berstatus `terjadwal` belum didukung** — menu Koreksi/Pembatalan hanya menyaring `belum_bayar`, jadi tagihan periode mendatang yang salah input belum bisa dibatalkan lewat UI (sudah diberi catatan di panduan tab tsb). Perbaikannya ada di `batalkan_tagihan_atomik`/`batalkan_tagihan_batch` — **definisi kedua RPC ini tidak ada di `supabase/migrations/`** (hanya pernah diterapkan via MCP), jadi harus di-dump dulu dari DB (`pg_get_functiondef`) ke file migrasi sebelum diubah; menulis ulang dari nol berisiko menghilangkan logika audit/jurnal pembalik/periode-lock-nya. Secara akuntansi pembatalannya sepele: tagihan `terjadwal` tidak punya jurnal, jadi tidak perlu jurnal pembalik
- **Belum ada penjadwal otomatis** untuk `jalankan_akrual_jatuh_tempo` — sekarang dijalankan manual dari tab Akrual Jatuh Tempo. Idealnya cron harian (pg_cron atau Cloudflare Cron Trigger memanggil server function). RPC-nya sudah idempoten & dibatasi `p_limit`, jadi aman dipanggil berkala
- **`TunggakanPembayaran.tsx` masih menghitung tunggakan sendiri** dari `pembayaran` + tarif (tanpa melihat `tagihan.jatuh_tempo`), dengan rentang bulan dipilih manual user. Yang sudah diperbaiki jadi sadar jatuh tempo adalah server function `rekapTunggakan` (`src/server/tunggakan.ts`) — tapi **fungsi itu belum dipakai UI mana pun**; menyatukan keduanya belum dikerjakan
- **Pembayaran tanpa `tagihan_id` bisa menggandakan pendapatan** — di `src/server/pembayaran.ts`, akun kredit dipilih Piutang hanya kalau `tagihan_id` dikirim eksplisit; kalau tidak, langsung kredit Pendapatan meski tagihannya ada dan piutangnya sudah dibukukan (pendapatan dobel, piutang tak pernah lunas). Sengaja TIDAK diubah di sesi ini agar tidak mengubah perilaku posting pembayaran di luar cakupan akrual

- **App mobile Portal Ortu — sisa fase 2 (butuh aset/akun dari user, tidak bisa dari sesi):** (1) ikon & splash resmi pengganti aset template; (2) rilis iOS (akun Apple Developer + build EAS); (3) `eas init` untuk mendapat EAS projectId — **prasyarat push notification jalan** (`getExpoPushTokenAsync` butuh projectId; tanpa itu registrasi token dilewati diam-diam); remote push tidak bisa diuji di Expo Go SDK 53+, harus development build/APK
- **Uji end-to-end checkout in-app dengan Midtrans sandbox** — smoke test baru sampai lapisan auth/CORS; perilaku deep link callback `portalortu://` di halaman Snap perlu diverifikasi di perangkat nyata (kalau bermasalah, fallback: arahkan finish ke halaman web yang menampilkan tombol "kembali ke aplikasi")

- **Rencana diskon/keringanan SPP (beasiswa, kakak-adik, bantuan, kurang mampu)** — belum diimplementasi, rencana lengkap (skema tabel, RPC, deteksi kakak-adik semi-otomatis, halaman UI, urutan migrasi) ada di `RENCANA_DISKON_KERINGANAN.md`. Rekomendasi kerjakan dengan `claude-opus-4-8`. Ada 3 keputusan desain yang perlu diambil dulu sebelum coding (lihat bagian akhir file tsb: kombinasi diskon ganda, approval workflow, nilai default berjenjang kakak-adik)
- **Refactor form Tarif Tagihan ke react-hook-form + zod** — form masih pakai `useState` mentah, menyimpang dari konvensi proyek; ditunda agar perubahan UX tetap mudah direview
- **Error tsc `context is possibly undefined`** di semua file `src/server/*.ts` (typing authMiddleware) — pola lama, belum diperbaiki

---

## Arsip — Pisah `tahun_ajaran` & `tahun_buku` (✅ SELESAI, 10 Mei 2026)

Ringkasan (detail lengkap ada di versi lama file ini: `git log -p SESI_NOTES.md`):

- **Tahap 1 (DB):** tabel `tahun_buku` dibuat, data di-copy dengan UUID sama, FK 7 tabel keuangan dipindah (`tagihan`, `tarif_tagihan`, `pembayaran`, `pendapatan_dimuka`, `penyisihan_piutang`, `log_tutup_buku`, `transaksi_midtrans_item`), RPC (`proses_pembayaran_atomik`, `is_periode_ditutup`) & view `v_tagihan_belum_bayar` diupdate
- **Tahap 2 (Edge Functions):** `proses-pembayaran` query ke `tahun_buku`; sudah di-deploy
- **Tahap 3 (Frontend):** hook `useTahunBuku`/`useTahunBukuAktif` + CRUD di `useKeuangan.ts`; halaman keuangan pindah hook; halaman akademik tetap `useTahunAjaran`
- **Koreksi pasca:** `TabTahunAjaran` di Referensi Akademik dikembalikan ke full CRUD (dengan guard hapus cek `kelas_siswa`)
