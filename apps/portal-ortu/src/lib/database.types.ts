// Tipe database Supabase dipakai bersama dengan aplikasi web — sumber
// kebenarannya satu: src/integrations/supabase/types.ts di root repo
// (hasil `supabase gen types`). Import type-only dihapus saat kompilasi,
// jadi Metro tidak perlu me-resolve path di luar root aplikasi ini.
export type { Database } from "../../../../src/integrations/supabase/types";
