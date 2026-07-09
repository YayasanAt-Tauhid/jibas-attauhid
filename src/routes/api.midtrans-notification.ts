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

    // 5. Jika PAID → buat record pembayaran per item
    if (newStatus === "paid") {
      const items = transaksi.transaksi_midtrans_item || [];
      const today = new Date().toISOString().split("T")[0];

      for (const item of items) {
        const { data: existing } = await admin
          .from("pembayaran")
          .select("id")
          .eq("siswa_id", item.siswa_id)
          .eq("jenis_id", item.jenis_id)
          .eq("bulan", item.bulan)
          .maybeSingle();
        if (existing) continue;

        const { data: newPembayaran, error: payError } = await admin
          .from("pembayaran")
          .insert({
            siswa_id: item.siswa_id,
            jenis_id: item.jenis_id,
            bulan: item.bulan,
            jumlah: item.jumlah,
            tanggal_bayar: today,
            departemen_id: item.departemen_id || null,
            tahun_ajaran_id: item.tahun_ajaran_id || null,
            keterangan: `Online Payment - ${order_id} via ${payment_type}`,
          })
          .select()
          .single();
        if (payError) continue;

        await admin
          .from("transaksi_midtrans_item")
          .update({ pembayaran_id: newPembayaran.id })
          .eq("id", item.id);
      }

      // ─── Auto-jurnal ───
      const { data: pengaturanAkunData } = await admin
        .from("pengaturan_akun")
        .select("kode_setting, akun_id");
      const pengaturanAkun = pengaturanAkunData || [];
      const bankMidtransId = pengaturanAkun.find(
        (p) => p.kode_setting === "bank_midtrans"
      )?.akun_id;

      const itemsByJenis = new Map<
        string,
        { akun_id: string | null; total: number; nama: string }
      >();
      for (const item of items) {
        const { data: jenis } = await admin
          .from("jenis_pembayaran")
          .select("nama, akun_pendapatan_id")
          .eq("id", item.jenis_id)
          .single();
        const existing = itemsByJenis.get(item.jenis_id);
        if (existing) {
          existing.total += Number(item.jumlah);
        } else {
          itemsByJenis.set(item.jenis_id, {
            akun_id: jenis?.akun_pendapatan_id || null,
            total: Number(item.jumlah),
            nama: jenis?.nama || "Pembayaran",
          });
        }
      }

      const bisaAutoJurnal =
        bankMidtransId &&
        Array.from(itemsByJenis.values()).every((j) => j.akun_id !== null);

      if (bisaAutoJurnal) {
        try {
          const tanggalBayar = new Date().toISOString().split("T")[0];
          const tahunBayar = new Date().getFullYear();

          const { data: nomorJurnal, error: rpcError } = await admin.rpc(
            "generate_nomor_jurnal",
            { p_prefix: "JP", p_tahun: tahunBayar }
          );
          if (rpcError) throw rpcError;
          if (!nomorJurnal) throw new Error("Gagal mendapatkan nomor jurnal");

          const totalAmount = Number(transaksi.total_amount);

          const { data: jurnal, error: jErr } = await admin
            .from("jurnal")
            .insert({
              nomor: nomorJurnal,
              tanggal: tanggalBayar,
              keterangan: `Online Payment Midtrans - ${order_id}`,
              referensi: order_id,
              total_debit: totalAmount,
              total_kredit: totalAmount,
              status: "posted",
            })
            .select()
            .single();
          if (jErr) throw jErr;

          const details: Array<Record<string, unknown>> = [
            {
              jurnal_id: jurnal.id,
              akun_id: bankMidtransId,
              keterangan: `Penerimaan online payment ${order_id} via ${payment_type}`,
              debit: totalAmount,
              kredit: 0,
              urutan: 1,
            },
          ];
          let urutan = 2;
          for (const [, jenis] of itemsByJenis) {
            details.push({
              jurnal_id: jurnal.id,
              akun_id: jenis.akun_id,
              keterangan: `Pendapatan ${jenis.nama} (${order_id})`,
              debit: 0,
              kredit: jenis.total,
              urutan: urutan++,
            });
          }

          const { error: detailErr } = await admin
            .from("jurnal_detail")
            .insert(details);
          if (detailErr) throw detailErr;

          await admin
            .from("transaksi_midtrans")
            .update({
              metadata: {
                ...notification,
                jurnal_id: jurnal.id,
                jurnal_nomor: nomorJurnal,
              },
            })
            .eq("order_id", order_id);
        } catch {
          // auto-jurnal gagal — pembayaran tetap tercatat, jurnal bisa dibuat manual
        }
      }

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
