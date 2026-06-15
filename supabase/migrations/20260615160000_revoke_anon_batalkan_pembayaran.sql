-- Fix keamanan: Supabase otomatis grant EXECUTE ke role `anon` saat fungsi dibuat,
-- sehingga batalkan_pembayaran_atomik (SECURITY DEFINER) bisa dipanggil langsung via
-- /rest/v1/rpc — melewati cek role di edge function. Cabut akses anon/PUBLIC/authenticated;
-- hanya service_role (lewat edge function batalkan-pembayaran) yang boleh.
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) TO service_role;
