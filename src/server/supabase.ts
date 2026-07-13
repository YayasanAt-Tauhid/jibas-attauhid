/**
 * Server-side Supabase helpers untuk TanStack Start server functions.
 *
 * Menggantikan pola lama di Supabase Edge Functions:
 *   - client anon (verifikasi JWT user)
 *   - client service-role (akses penuh DB, bypass RLS)
 *
 * Semua nilai rahasia dibaca dari `process.env` — hanya tersedia di server
 * (Node/Nitro). Modul ini TIDAK PERNAH dieksekusi di browser: kode ini hanya
 * dipanggil di dalam `.handler()` server function. Referensi ke `process`
 * tetap dijaga (`typeof process !== "undefined"`) agar aman meski ter-bundle.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// URL & anon/publishable key WAJIB dari env — TIDAK ADA fallback hardcode.
// (Sebelumnya ada fallback ke anon key JWT lama; legacy JWT keys sudah
// dinonaktifkan di dashboard Supabase per 2026-07-13, jadi fallback itu
// dihapus supaya kesalahan konfigurasi langsung ketahuan, bukan diam-diam
// terus mencoba pakai key yang sudah mati.)

export function readEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function supabaseUrl(): string {
  const url = readEnv("SUPABASE_URL") ?? readEnv("VITE_SUPABASE_URL");
  if (!url) {
    throw new Error(
      "SUPABASE_URL belum dikonfigurasi di server. " +
        "Set environment variable ini pada host (VPS/Cloudflare) sebelum menjalankan aplikasi."
    );
  }
  return url;
}

function anonKey(): string {
  const key =
    readEnv("SUPABASE_ANON_KEY") ??
    readEnv("SUPABASE_PUBLISHABLE_KEY") ??
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!key) {
    throw new Error(
      "SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY belum dikonfigurasi di server. " +
        "Gunakan publishable key baru (sb_publishable_...) dari dashboard Supabase, " +
        "BUKAN anon key JWT lama — legacy key sudah dinonaktifkan."
    );
  }
  return key;
}

function serviceKey(): string {
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. " +
        "Set environment variable ini pada host (VPS/Cloudflare) sebelum menjalankan aplikasi."
    );
  }
  return key;
}

/**
 * Client service-role — akses penuh DB, bypass RLS.
 * HANYA boleh dipanggil di server (di dalam handler server function).
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl(), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verifikasi access token milik user, kembalikan auth user bila valid.
 * Setara dengan `supabaseAnon.auth.getUser()` di edge function lama.
 */
export async function getUserFromToken(token: string) {
  const anon = createClient<Database>(supabaseUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await anon.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
