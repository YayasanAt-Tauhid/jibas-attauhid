/**
 * Server route: POST /api/portal/checkout
 *
 * Endpoint checkout Midtrans untuk APP MOBILE Portal Ortu (apps/portal-ortu).
 * Portal web tetap memakai server function `createPayment` — endpoint ini ada
 * karena server function TanStack Start tidak bisa dipanggil lintas aplikasi.
 *
 * Auth: header `Authorization: Bearer <access_token Supabase>` milik akun ortu.
 * Body: { items: TagihanItem[] }
 * Respons: CreatePaymentResult (snap_token, order_id, redirect_url, dst.)
 *
 * Callback Snap diarahkan ke deep link `portalortu://riwayat?order=<order_id>`
 * (scheme app di apps/portal-ortu/app.json) sehingga sesi browser in-app
 * tertutup otomatis dan pengguna kembali ke layar Riwayat Pembayaran.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getUserFromToken } from "@/server/supabase";
import {
  buatTransaksiSnap,
  type CreatePaymentInput,
} from "@/server/payment";

// Scheme deep link app mobile — samakan dengan "scheme" di apps/portal-ortu/app.json.
const APP_SCHEME = "portalortu";

// Bearer token dipakai sebagai auth (bukan cookie), jadi CORS permisif aman —
// berguna bila app dijalankan sebagai Expo web saat development.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleCheckout(request: Request): Promise<Response> {
  const raw = request.headers.get("authorization");
  const token = raw?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "Unauthorized: token tidak ada" }, 401);
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return jsonResponse(
      { error: "Unauthorized: sesi tidak valid, silakan login ulang" },
      401
    );
  }

  let body: {
    items?: CreatePaymentInput["items"];
    // Klien versi lama boleh masih mengirim payment_category; field tambahan
    // diabaikan karena pilihan metode dan fee sekarang ditangani Midtrans.
    payment_category?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Body JSON tidak valid" }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return jsonResponse({ error: "Tidak ada tagihan yang dipilih" }, 400);
  }

  try {
    const result = await buatTransaksiSnap({
      userId: user.id,
      input: {
        items: body.items,
        // Identitas customer diambil dari token — tidak percaya input client.
        customer: {
          user_id: user.id,
          email: user.email || "",
          nama: user.email?.split("@")[0] || "Orang Tua",
        },
      },
      callbacks: (orderId) => ({
        finish: `${APP_SCHEME}://riwayat?order=${orderId}`,
        unfinish: `${APP_SCHEME}://riwayat?order=${orderId}`,
        error: `${APP_SCHEME}://riwayat?order=${orderId}`,
      }),
    });
    return jsonResponse(result, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal membuat transaksi";
    // Error validasi (kepemilikan siswa, double payment, tarif) → 400;
    // pesan errornya memang ditujukan untuk pengguna.
    return jsonResponse({ error: message }, 400);
  }
}

export const Route = createFileRoute("/api/portal/checkout")({
  server: {
    handlers: {
      POST: ({ request }) => handleCheckout(request),
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
