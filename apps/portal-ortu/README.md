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
- `EXPO_PUBLIC_PORTAL_WEB_URL` — URL portal web ter-deploy, dipakai tombol
  "Bayar" untuk melanjutkan pembayaran Midtrans lewat browser (sementara,
  sampai checkout in-app fase 2 selesai)

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

## Belum Dikerjakan (Fase 2)

1. **Checkout Midtrans in-app.** Midtrans Snap adalah JS web dan pembuatan
   snap token terjadi di server function TanStack Start (`src/server/payment.ts`)
   yang tidak bisa dipanggil lintas app. Rencana: tambah API route di web
   app (mis. `src/routes/api.portal.checkout.ts`) yang memvalidasi JWT
   Supabase lalu mengembalikan `snap_token` + `redirect_url`, dan app
   membukanya via WebView/`expo-web-browser`. Sementara itu tombol "Bayar"
   mengarahkan ke portal web.
2. **Push notification** pengingat tagihan & pengumuman — `expo-notifications`
   + tabel token perangkat + trigger dari backend.
3. **Ikon & splash resmi** menggantikan aset template.
4. **Rilis iOS** (butuh akun Apple Developer; build via EAS tanpa Mac).
