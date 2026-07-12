/**
 * Server route: POST /api/midtrans-notification
 * Migrasi dari supabase/functions/midtrans-notification.
 *
 * Webhook publik yang dipanggil server Midtrans (bukan frontend). Verifikasi
 * signature, update status transaksi, buat record pembayaran + auto-jurnal,
 * dan kirim notifikasi ke orang tua saat pembayaran lunas.
 *
 * PENTING: setelah migrasi, ubah "Notification URL" di dashboard Midtrans ke
 *   https://<domain-anda>/api/midtrans-notification
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient, readEnv } from "@/server/supabase";

async function sha512(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handleNotification(request: Request): Promise<Response> {
  const admin = createAdminClient();

  try {
    const notification = await request.json();

    const {
      order_id,
      transaction_id,
      gross_amount,
      transaction_status,
      payment_type,
      signature_key,
      status_code,
      fraud_status,
    } = notification;

    // 1. Verifikasi signature Midtrans
    const serverKey = readEnv("MIDTRANS_SERVER_KEY") || "";
    const expectedSignature = await sha512(
      `${order_id}${status_code}${gross_amount}${serverKey}`
    );
    if (signature_key !== expectedSignature) {
      return new Response("Invalid signature", { status: 403 });
    }

    // 2. Ambil transaksi
    const { data: transaksi, error: txFetchError } = await admin
      .from("transaksi_midtrans")
      .select("*, transaksi_midtrans_item(*)")
      .eq("order_id", order_id)
      .single();
    if (txFetchError || !transaksi) {
      return new Response("Order not found", { status: 404 });
    }

    // 3. Tentukan status baru
    let newStatus: string = transaksi.status;
    let paidAt: string | null = null;

    if (
      transaction_status === "capture" ||
      transaction_status === "settlement"
    ) {
      if (transaction_status === "capture" && fraud_status !== "accept") {
        newStatus = "failed";
      } else {
        newStatus = "paid";
        paidAt = new Date().toISOString();
      }
    } else if (
      transaction_status === "deny" ||
      transaction_status === "cancel" ||
      transaction_status === "failure"
    ) {
      newStatus = "failed";
    } else if (transaction_status === "expire") {
      newStatus = "expired";
    } else if (transaction_status === "pending") {
      newStatus = "pending";
    }

    // 4. Update transaksi
    const { error: updateError } = await admin
      .from("transaksi_midtrans")
      .update({
        status: newStatus,
        payment_type,
        midtrans_transaction_id: transaction_id,
        midtrans_payment_status: transaction_status,
        fraud_status: fraud_status || null,
        paid_at: paidAt,
        metadata: notification,
      })
      .eq("order_id", order_id);
    if (updateError) throw updateError;

    // 5. Jika PAID → proses pembayaran + jurnal SECARA ATOMIK per item
    //    via RPC proses_pembayaran_midtrans_atomik. Setiap item sukses/gagal
    //    independen (dicatat di hasilItems), tidak lagi ada silent-catch:
    //    kegagalan jurnal SELALU berarti pembayaran juga tidak tercatat untuk
    //    item itu (rollback RPC), dan errornya disimpan ke metadata transaksi.
    if (newStatus === "paid") {
      const items = transaksi.transaksi_midtrans_item || [];
      const today = new Date().toISOString().split("T")[0];

      // Ambil akun Bank Midtrans (debit) sekali di awal
      const { data: bankMidtransSetting } = await admin
        .from("pengaturan_akun")
        .select("akun_id")
        .eq("kode_setting", "bank_midtrans")
        .maybeSingle();
      const bankMidtransId = bankMidtransSetting?.akun_id ?? null;

      const hasilItems: Array<{
        item_id: string;
        success: boolean;
        pembayaran_id?: string;
        jurnal_id?: string;
        error?: string;
      }> = [];

      for (const item of items) {
        // Skip jika item ini sudah pernah diproses (idempotent terhadap retry webhook)
        if (item.pembayaran_id) {
          hasilItems.push({ item_id: item.id, success: true, pembayaran_id: item.pembayaran_id });
          continue;
        }

        const { data: jenis } = await admin
          .from("jenis_pembayaran")
          .select("nama, akun_pendapatan_id")
          .eq("id", item.jenis_id)
          .single();

        const { data: rpcResult, error: rpcErr } = await admin.rpc(
          "proses_pembayaran_midtrans_atomik",
          {
            p_transaksi_item_id: item.id,
            p_siswa_id: item.siswa_id,
            p_jenis_id: item.jenis_id,
            p_bulan: item.bulan,
            p_jumlah: item.jumlah,
            p_tanggal_bayar: today,
            p_departemen_id: item.departemen_id || null,
            p_tahun_ajaran_id: item.tahun_ajaran_id || null,
            p_order_id: order_id,
            p_payment_type: payment_type,
            p_kas_akun_id: bankMidtransId,
            p_kredit_akun_id: jenis?.akun_pendapatan_id ?? null,
            p_jenis_nama: jenis?.nama || "Pembayaran",
          }
        );

        if (rpcErr) {
          hasilItems.push({ item_id: item.id, success: false, error: rpcErr.message });
          continue;
        }

        const r = rpcResult as { pembayaran_id: string; jurnal_id: string };
        hasilItems.push({
          item_id: item.id,
          success: true,
          pembayaran_id: r.pembayaran_id,
          jurnal_id: r.jurnal_id,
        });
      }

      const adaGagal = hasilItems.some((h) => !h.success);

      // Simpan hasil pemrosesan ke metadata — SELALU tercatat, bukan silent.
      // Jika ada item gagal, admin bisa lihat dari sini akun mana yang perlu
      // dikonfigurasi lalu proses ulang manual (webhook Midtrans juga retry
      // otomatis untuk status non-2xx, tapi kita selalu balas 200 di bawah).
      await admin
        .from("transaksi_midtrans")
        .update({
          metadata: {
            ...notification,
            item_processing: hasilItems,
            ada_item_gagal_jurnal: adaGagal,
          },
        })
        .eq("order_id", order_id);

      // Notifikasi orang tua
      try {
        await admin.from("notifikasi_ortu").insert({
          user_id: transaksi.user_id,
          judul: "Pembayaran Berhasil",
          pesan: `Pembayaran ${items.length} tagihan senilai Rp ${Number(
            transaksi.total_amount
          ).toLocaleString("id-ID")} berhasil diproses via ${payment_type}. Order: ${order_id}`,
          tipe: "pembayaran",
          url: `/portal/pembayaran?order=${order_id}`,
          dibaca: false,
        });
      } catch {
        // best-effort
      }
    }

    return new Response(
      JSON.stringify({ message: "OK", order_id, status: newStatus }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    // Midtrans meng-retry pada non-2xx; balas 200 agar tidak retry badai,
    // error sudah tercatat di log server.
    return new Response(
      JSON.stringify({
        message: "Error logged",
        error: error instanceof Error ? error.message : "unknown",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const Route = createFileRoute("/api/midtrans-notification")({
  server: {
    handlers: {
      POST: ({ request }) => handleNotification(request),
    },
  },
});
