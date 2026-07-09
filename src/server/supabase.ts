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

// URL & anon key bersifat publik (sudah ada di src/integrations/supabase/client.ts).
// Dipakai sebagai fallback bila env belum diset. Service-role key TIDAK punya
// fallback — wajib dari env dan tidak boleh di-commit.
const FALLBACK_URL = "https://rumdeqkrtfjxckqgokoy.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1bWRlcWtydGZqeGNrcWdva295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDE5ODYsImV4cCI6MjA5OTExNzk4Nn0.M2vV1Qd_NoYT0hKa88tsAPPlnfSzMmQaLWg8cXbUTSs";

export function readEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function supabaseUrl(): string {
  return readEnv("SUPABASE_URL") ?? FALLBACK_URL;
}

function anonKey(): string {
  return (
    readEnv("SUPABASE_ANON_KEY") ??
    readEnv("SUPABASE_PUBLISHABLE_KEY") ??
    FALLBACK_ANON_KEY
  );
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
