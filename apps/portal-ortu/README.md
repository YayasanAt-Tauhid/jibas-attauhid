# Portal Ortu At-Tauhid (Aplikasi Mobile)

Aplikasi mobile **Portal Orang Tua** Hijrah At-Tauhid — React Native + Expo
(Expo Router). Cermin dari portal web (`src/pages/portal/` di root repo)
untuk pemakaian di HP orang tua: cek tagihan, presensi, nilai, riwayat
pembayaran, dan profil. Backend-nya sama persis: Supabase (Auth + PostgREST),
dengan RLS yang sudah membatasi data per akun ortu.

## Menjalankan (Development)

```sh
cd apps/portal-ortu
npm install
cp .env.example .env   # lalu isi nilainya (lihat bawah)
npx expo start         # scan QR dengan Expo Go di Android/iOS
```

Isi `.env`:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — sama
  dengan `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` di web
  (gunakan key `sb_publishable_...`, bukan anon key JWT lama)
- `EXPO_PUBLIC_PORTAL_WEB_URL` — URL portal web ter-deploy, dipakai checkout
  in-app untuk memanggil API route `/api/portal/checkout` saat membuat
  transaksi Midtrans

Perintah lain: `npm run typecheck` (tsc), `npm run lint` (expo lint).

## Build APK / Rilis Android

Pakai [EAS Build](https://docs.expo.dev/build/setup/) (tidak butuh Android
Studio lokal):

```sh
npm install -g eas-cli
eas login                      # akun Expo (gratis)
eas build -p android --profile preview   # APK untuk uji internal
eas build -p android                     # AAB untuk Play Store
```

Identitas app: package `com.attauhid.portalortu` (lihat `app.json`).
Ikon & splash masih bawaan template — ganti file di `assets/images/`
sebelum rilis publik.

## Arsitektur & Keputusan

- **Satu backend, dua klien.** App ini memanggil Supabase langsung dengan
  query yang identik dengan portal web (queryKey pun sama) — tidak ada
  server/API khusus mobile. Auth pakai `@supabase/supabase-js` +
  AsyncStorage (sesi persisten, auto-refresh hanya saat foreground).
- **Tipe database di-share, runtime code tidak.** `src/lib/database.types.ts`
  re-export type-only dari `src/integrations/supabase/types.ts` root repo,
  jadi regenerate types cukup sekali. Util kecil (format Rupiah, urutan
  bulan akademik, label bulan TA) *disalin* ke `src/lib/format.ts` karena
  Metro tidak bisa mem-bundle modul web (Vite/`import.meta.env`) — kalau
  logika ini berubah di web, ubah juga di sini.
- **UI tanpa shadcn.** shadcn/ui berbasis DOM dan tidak jalan di React
  Native; penggantinya kit kecil di `src/components/ui.tsx` (Card, Button,
  Badge, dst.) dengan tema emerald yang sama, mendukung light/dark.
- **Login hanya role `ortu`** — akun role lain ditolak, sama seperti guard
  portal web.
- **Checkout Midtrans in-app (fase 2).** Tab Tagihan mengisi keranjang
  (`src/lib/keranjang.ts`), layar `/checkout` memanggil API route web
  `POST /api/portal/checkout` (auth: bearer access token Supabase) yang
  mengembalikan `snap_token` + `redirect_url`, lalu halaman Snap dibuka via
  `WebBrowser.openAuthSessionAsync`. Callback Midtrans diarahkan ke deep
  link `portalortu://riwayat?order=...` sehingga sesi browser tertutup
  otomatis dan pengguna mendarat di Riwayat Pembayaran; status akhir tetap
  ditentukan webhook Midtrans di server.
- **Push notification (fase 2).** Setelah login, app meminta izin notifikasi
  dan mendaftarkan Expo push token via RPC `daftarkan_push_token` (tabel
  `perangkat_push_ortu`; token dihapus saat logout). Server mengirim push
  lewat Expo Push API — saat ini dari webhook Midtrans ketika pembayaran
  lunas (`src/server/push.ts` di root repo). Tap notifikasi membuka layar
  yang disebut `data.url`. Catatan: butuh **EAS projectId** (`eas init`)
  agar `getExpoPushTokenAsync` jalan; tanpa itu registrasi dilewati. Remote
  push TIDAK bisa diuji di Expo Go (SDK 53+) — pakai development build/APK.

## Belum Dikerjakan

1. **Ikon & splash resmi** menggantikan aset template (butuh aset resmi
   dari yayasan).
2. **Rilis iOS** (butuh akun Apple Developer; build via EAS tanpa Mac).
3. **Pemicu push tambahan** — pengingat tagihan bulanan & pengumuman
   (helper `kirimPushKeOrtu` sudah siap dipakai dari kode server mana pun).
