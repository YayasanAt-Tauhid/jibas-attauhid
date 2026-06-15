/**
 * Edge Function: batalkan-pembayaran
 *
 * Membatalkan pembayaran salah-input (admin/keuangan) secara atomik via RPC
 * `batalkan_pembayaran_atomik`:
 *   1. Cek pendapatan di muka (tolak bila sudah diakui, hapus bila pending)
 *   2. Buat jurnal pembalik (posted) dari jurnal pembayaran
 *   3. Kembalikan tagihan terkait → belum_bayar
 *   4. Hapus baris pembayaran (jejak di audit_keuangan + jurnal pembalik)
 *
 * Khusus koreksi salah-input — TIDAK menangani refund kas fisik.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
    "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BatalkanPembayaranRequest {
  pembayaran_id: string;
  alasan: string;
  tanggal?: string; // "yyyy-MM-dd", default hari ini
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized: missing auth header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized: invalid token");

    const admin = createClient(supabaseUrl, serviceKey);

    // Cek role — hanya admin/kepala/keuangan (BUKAN kasir)
    const { data: profile } = await admin
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "kepala_sekolah", "keuangan"].includes(profile.role)) {
      throw new Error("Forbidden: hanya admin/keuangan yang bisa membatalkan pembayaran");
    }

    const body: BatalkanPembayaranRequest = await req.json();
    const { pembayaran_id, alasan } = body;
    const tanggal = body.tanggal || new Date().toISOString().split("T")[0];

    if (!pembayaran_id) throw new Error("pembayaran_id wajib diisi");
    if (!alasan || !alasan.trim()) throw new Error("Alasan wajib diisi");

    // Cek periode tutup buku untuk tanggal pembalik
    const { data: periodeData } = await admin
      .from("tahun_buku")
      .select("nama, ditutup")
      .lte("tanggal_mulai", tanggal)
      .gte("tanggal_selesai", tanggal)
      .limit(1);
    const periodeLocked = (periodeData || []).find((p) => p.ditutup === true);
    if (periodeLocked) {
      throw new Error(`Transaksi ditolak: periode "${periodeLocked.nama}" sudah ditutup buku`);
    }

    const { data: result, error: rpcErr } = await admin.rpc("batalkan_pembayaran_atomik", {
      p_pembayaran_id: pembayaran_id,
      p_alasan:        alasan,
      p_tanggal:       tanggal,
      p_user_id:       user.id,
    });
    if (rpcErr) throw new Error("Gagal membatalkan pembayaran: " + rpcErr.message);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: err.message?.startsWith("Unauthorized") ? 401
            : err.message?.startsWith("Forbidden") ? 403 : 400,
    });
  }
});
