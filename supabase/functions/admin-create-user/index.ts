/**
 * Edge Function: admin-create-user
 *
 * Membuat akun login baru (auth user) lalu mengatur profilnya. Hanya admin.
 *   1. Verifikasi token & pastikan pemanggil ber-role "admin"
 *   2. Buat auth user via service role (email langsung terkonfirmasi)
 *   3. Atur users_profile: role + lembaga (departemen) + pegawai + aktif
 *      (baris users_profile dibuat otomatis oleh trigger handle_new_user)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
    "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ROLES = [
  "admin", "kepala_sekolah", "guru", "keuangan", "kasir", "pustakawan", "siswa",
];

interface CreateUserRequest {
  email: string;
  password: string;
  role: string;
  departemen_id?: string | null;
  pegawai_id?: string | null;
  aktif?: boolean;
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

    // Hanya admin yang boleh membuat akun
    const { data: profile } = await admin
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "admin") {
      throw new Error("Forbidden: hanya admin yang bisa membuat akun");
    }

    const body: CreateUserRequest = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const role = body.role;

    if (!email) throw new Error("Email wajib diisi");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid");
    if (!password || password.length < 8) throw new Error("Password minimal 8 karakter");
    if (!role || !ALLOWED_ROLES.includes(role)) throw new Error("Role tidak valid");

    // Buat auth user (email langsung terkonfirmasi agar bisa login)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      throw new Error("Gagal membuat akun: " + (createErr?.message || "unknown"));
    }

    const newId = created.user.id;

    // Atur profil (baris dibuat oleh trigger handle_new_user dengan role default 'siswa')
    const { error: updErr } = await admin
      .from("users_profile")
      .update({
        role,
        departemen_id: body.departemen_id || null,
        pegawai_id:    body.pegawai_id || null,
        aktif:         body.aktif ?? true,
      })
      .eq("id", newId);

    if (updErr) {
      // Rollback: hapus auth user agar tidak ada akun setengah-jadi
      await admin.auth.admin.deleteUser(newId);
      throw new Error("Gagal mengatur profil: " + updErr.message);
    }

    return new Response(JSON.stringify({ success: true, id: newId, email }), {
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
