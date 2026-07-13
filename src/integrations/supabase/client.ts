import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// URL & publishable key dibaca dari environment variable (prefix VITE_ wajib
// agar Vite meng-inject nilainya ke bundle browser). Isi nilainya di .env:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
// Gunakan publishable key baru (sb_publishable_...), BUKAN anon key JWT lama —
// legacy JWT keys sudah dinonaktifkan di dashboard Supabase.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY belum diset. " +
      "Isi nilainya di file .env (lihat .env.example), lalu rebuild aplikasi."
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// SSR-safe: localStorage only exists in the browser. During server-side
// rendering fall back to Supabase's default in-memory storage.
const isBrowser = typeof window !== "undefined";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: isBrowser ? window.localStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
  }
});
