/**
 * Server functions: createPayment, getMidtransConfig
 * Migrasi dari supabase/functions/create-payment & get-midtrans-config.
 *
 * createPayment: buat transaksi Midtrans Snap untuk pembayaran online orang tua.
 * getMidtransConfig: kembalikan client key + mode (sandbox/produksi) untuk Snap.js.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth";
import { createAdminClient, readEnv } from "./supabase";

interface TagihanItem {
  siswa_id: string;
  nama_siswa: string;
  jenis_id: string;
  jenis_nama: string;
  bulan: number;
  jumlah: number;
  departemen_id?: string;
  tahun_ajaran_id?: string;
  departemen_nama?: string;
}

export interface CreatePaymentInput {
  items: TagihanItem[];
  customer: {
    user_id: string;
    email: string;
    nama: string;
    telepon?: string;
  };
}

export interface CreatePaymentResult {
  success: true;
  snap_token: string;
  order_id: string;
  transaksi_id: string;
  total_amount: number;
}

const NAMA_BULAN = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DEFAULT_ENABLED_PAYMENTS = [
  "credit_card",
  "bca_va", "bni_va", "bri_va", "permata_va", "other_va",
  "gopay", "shopeepay", "qris",
  "indomaret", "alfamart",
];

// MIDTRANS_ENABLED_PAYMENTS: daftar channel dipisah koma (mis. "credit_card,gopay,qris").
// Dipakai untuk menonaktifkan channel yang belum didukung Midtrans untuk fitur
// split fee, tanpa perlu redeploy. Kosongkan/hapus env var untuk pakai default.
function getEnabledPayments(): string[] {
  const raw = readEnv("MIDTRANS_ENABLED_PAYMENTS");
  if (!raw) return DEFAULT_ENABLED_PAYMENTS;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ENABLED_PAYMENTS;
}

export const createPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: CreatePaymentInput) => d)
  .handler(async ({ data, context }): Promise<CreatePaymentResult> => {
    const admin = createAdminClient();
    const userId = context.userId;

    const { items, customer } = data;
    if (!items || items.length === 0) {
      throw new Error("Tidak ada tagihan yang dipilih");
    }

    // Validasi: semua siswa_id memang anak dari user ini
    const siswaIds = [...new Set(items.map((i) => i.siswa_id))];
    const { data: ortuData, error: ortuError } = await admin
      .from("ortu_siswa")
      .select("siswa_id")
      .eq("user_id", userId)
      .in("siswa_id", siswaIds);
    if (ortuError) throw ortuError;
    if (!ortuData || ortuData.length !== siswaIds.length) {
      throw new Error("Akses ditolak: beberapa siswa bukan anak Anda");
    }

    // Anti double payment
    for (const item of items) {
      const { data: existingPayment } = await admin
        .from("pembayaran")
        .select("id")
        .eq("siswa_id", item.siswa_id)
        .eq("jenis_id", item.jenis_id)
        .eq("bulan", item.bulan)
        .maybeSingle();
      if (existingPayment) {
        throw new Error(
          `Tagihan ${item.jenis_nama} bulan ke-${item.bulan} untuk ${item.nama_siswa} sudah dibayar`
        );
      }
    }

    // Re-fetch nominal dari DB (JANGAN percaya frontend)
    const { data: kelasSiswaData } = await admin
      .from("kelas_siswa")
      .select("siswa_id, kelas_id, tahun_ajaran_id")
      .in("siswa_id", siswaIds)
      .eq("aktif", true);

    const kelasMap = new Map<
      string,
      { kelas_id: string | null; tahun_ajaran_id: string | null }
    >();
    (kelasSiswaData || []).forEach((ks) => {
      kelasMap.set(ks.siswa_id, {
        kelas_id: ks.kelas_id,
        tahun_ajaran_id: ks.tahun_ajaran_id,
      });
    });

    const validatedItems: TagihanItem[] = [];
    for (const item of items) {
      const kelasInfo = kelasMap.get(item.siswa_id);
      const { data: tarifNominal } = await admin.rpc("get_tarif_siswa", {
        p_jenis_id: item.jenis_id,
        p_siswa_id: item.siswa_id,
        p_kelas_id: kelasInfo?.kelas_id || null,
        p_tahun_ajaran_id:
          item.tahun_ajaran_id || kelasInfo?.tahun_ajaran_id || null,
      });

      const nominalDB = Number(tarifNominal) || 0;
      if (nominalDB <= 0) {
        throw new Error(
          `Tarif tidak ditemukan untuk ${item.jenis_nama} - ${item.nama_siswa}`
        );
      }

      validatedItems.push({
        ...item,
        jumlah: nominalDB,
        departemen_id: item.departemen_id || undefined,
        tahun_ajaran_id:
          kelasInfo?.tahun_ajaran_id || item.tahun_ajaran_id || undefined,
      });
    }

    const totalAmount = validatedItems.reduce((sum, i) => sum + i.jumlah, 0);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `JIBAS-${dateStr}-${random}`;

    const { data: transaksi, error: txError } = await admin
      .from("transaksi_midtrans")
      .insert({
        order_id: orderId,
        user_id: userId,
        total_amount: totalAmount,
        status: "pending",
        expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (txError) throw txError;

    const itemsToInsert = validatedItems.map((item) => ({
      transaksi_id: transaksi.id,
      siswa_id: item.siswa_id,
      jenis_id: item.jenis_id,
      bulan: item.bulan,
      jumlah: item.jumlah,
      nama_item: `${item.jenis_nama} - ${item.nama_siswa} - ${NAMA_BULAN[item.bulan]}`,
      departemen_id: item.departemen_id || null,
      tahun_ajaran_id: item.tahun_ajaran_id || null,
    }));

    const { error: itemError } = await admin
      .from("transaksi_midtrans_item")
      .insert(itemsToInsert);
    if (itemError) throw itemError;

    // Panggil Midtrans Snap
    const serverKey = readEnv("MIDTRANS_SERVER_KEY");
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi");
    const baseUrl = serverKey.startsWith("SB-")
      ? "https://app.sandbox.midtrans.com"
      : "https://app.midtrans.com";
    const authString = btoa(`${serverKey}:`);

    // Origin untuk callback URL (browser mengirim header ini)
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const origin =
      getRequestHeader("origin") ||
      getRequestHeader("referer")?.replace(/\/$/, "") ||
      "http://localhost:8080";

    const midtransPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(totalAmount),
      },
      customer_details: {
        first_name: customer.nama,
        email: customer.email,
        phone: customer.telepon || "",
      },
      item_details: validatedItems.map((item, idx) => ({
        id: `ITEM-${idx + 1}-${item.bulan}`,
        price: Math.round(item.jumlah),
        quantity: 1,
        name: `${item.jenis_nama} ${NAMA_BULAN[item.bulan]} - ${item.nama_siswa}`.substring(
          0,
          50
        ),
      })),
      callbacks: {
        finish: `${origin}/portal/pembayaran?order=${orderId}`,
        unfinish: `${origin}/portal/tagihan`,
        error: `${origin}/portal/tagihan`,
      },
      expiry: { unit: "hours", duration: 24 },
      enabled_payments: getEnabledPayments(),
    };

    const midtransRes = await fetch(`${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(midtransPayload),
    });
    const midtransData = await midtransRes.json();

    if (!midtransRes.ok || !midtransData.token) {
      await admin.from("transaksi_midtrans").delete().eq("id", transaksi.id);
      throw new Error(
        midtransData.error_messages?.[0] || "Gagal membuat transaksi Midtrans"
      );
    }

    await admin
      .from("transaksi_midtrans")
      .update({ snap_token: midtransData.token })
      .eq("id", transaksi.id);

    return {
      success: true,
      snap_token: midtransData.token,
      order_id: orderId,
      transaksi_id: transaksi.id,
      total_amount: totalAmount,
    };
  });

export interface MidtransConfig {
  client_key: string;
  is_sandbox: boolean;
  snap_url: string;
}

// Publik — tidak butuh auth (setara get-midtrans-config lama).
export const getMidtransConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<MidtransConfig> => {
    const clientKey = readEnv("MIDTRANS_CLIENT_KEY") || "";
    const serverKey = readEnv("MIDTRANS_SERVER_KEY") || "";
    const isSandbox =
      clientKey.startsWith("SB-") || serverKey.startsWith("SB-");
    return {
      client_key: clientKey,
      is_sandbox: isSandbox,
      snap_url: isSandbox
        ? "https://app.sandbox.midtrans.com/snap/snap.js"
        : "https://app.midtrans.com/snap/snap.js",
    };
  }
);
