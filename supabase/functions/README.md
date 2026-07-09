# Supabase Edge Functions — SUDAH DIMIGRASI ke TanStack Start

Seluruh logika di folder ini telah dipindahkan ke **TanStack Start server
functions** di `src/server/*` dan satu **server route** untuk webhook. Frontend
tidak lagi memanggil `supabase.functions.invoke(...)`.

## Peta migrasi

| Edge Function (lama)     | Pengganti (baru)                                   | Auth        |
| ------------------------ | -------------------------------------------------- | ----------- |
| `generate-nis`           | `src/server/nis.ts` → `generateNis`                | admin/kepala|
| `generate-tagihan`       | `src/server/tagihan.ts` → `generateTagihan`        | admin/kepala/keuangan |
| `admin-create-user`      | `src/server/users.ts` → `adminCreateUser`          | admin       |
| `proses-pembayaran`      | `src/server/pembayaran.ts` → `prosesPembayaran`    | admin/kepala/keuangan/kasir |
| `batalkan-pembayaran`    | `src/server/pembayaran.ts` → `batalkanPembayaran`  | admin/kepala/keuangan |
| `create-payment`         | `src/server/payment.ts` → `createPayment`          | user login  |
| `get-midtrans-config`    | `src/server/payment.ts` → `getMidtransConfig`      | publik      |
| `midtrans-notification`  | `src/routes/api.midtrans-notification.ts` (POST)   | webhook (signature) |
| `hitung-nilai-akhir`     | `src/server/akademik.ts` → `hitungNilaiAkhir`      | staff/ortu/siswa |
| `rekap-tunggakan`        | `src/server/tunggakan.ts` → `rekapTunggakan`       | staff/ortu/siswa |
| `send-telegram`          | `src/server/notifikasi.ts` → `sendTelegram`        | admin/kepala|
| `send-whatsapp`          | `src/server/notifikasi.ts` → `sendWhatsapp`        | admin/kepala|
| `psb-daftar` (GET/POST)  | `src/server/psb.ts` → `psbOptions` / `psbDaftar`   | publik      |

## Model keamanan (tetap sama)

- Token JWT user dikirim otomatis oleh `authMiddleware` (`src/server/auth.ts`)
  sebagai header `Authorization`, lalu diverifikasi di server.
- Query DB memakai **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) via
  `createAdminClient()` — sama seperti edge function lama, bypass RLS.
- Cek peran dilakukan dengan `requireRole(...)` di dalam handler.

## Langkah cutover (WAJIB sebelum menghapus folder ini)

1. **Set environment variables di host aplikasi** (VPS/Cloudflare) — lihat
   `.env.example`: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
   `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `TELEGRAM_BOT_TOKEN`,
   `WA_GATEWAY_URL`, `WA_GATEWAY_TOKEN`.
2. **Ubah Notification URL di dashboard Midtrans** dari
   `https://<ref>.supabase.co/functions/v1/midtrans-notification`
   menjadi `https://<domain-aplikasi>/api/midtrans-notification`.
3. Deploy aplikasi & verifikasi tiap alur (generate NIS, pembayaran, PSB, notifikasi).
4. Baru setelah semua terverifikasi: hapus edge functions dari Supabase
   (`supabase functions delete <nama>`) dan hapus folder ini.

Folder ini sengaja **belum dihapus** agar fungsi lama tetap hidup selama masa
transisi (khususnya webhook Midtrans yang URL-nya diatur di pihak eksternal).
