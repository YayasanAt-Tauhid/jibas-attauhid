-- Phase 2: remove anonymous RPC exposure from remaining application functions.
-- Client-facing functions remain available to authenticated users; RLS still
-- applies because these are SECURITY INVOKER functions.

REVOKE ALL ON FUNCTION public.fn_cari_kandidat_pasangan(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cari_kandidat_pasangan(uuid, text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_laba_rugi_komersial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitung_laba_rugi_komersial(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_laporan_dana(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitung_laporan_dana(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_mutasi_akun_incl_draft(integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitung_mutasi_akun_incl_draft(integer, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_mutasi_akun_range_incl_draft(date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitung_mutasi_akun_range_incl_draft(date, date, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_periode_ditutup(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_periode_ditutup(date) TO authenticated, service_role;

-- Trigger functions are invoked by PostgreSQL triggers, not via PostgREST RPC.
-- Direct EXECUTE is unnecessary for browser roles.
REVOKE ALL ON FUNCTION public.normalisasi_periode_siswa_diskon() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validasi_diskon_kakak_adik() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_departemen_kategori() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_pegawai_jk() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_pendapatan_dimuka_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_presensi_pegawai_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_presensi_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_program_dana_jenis() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_siswa_jk() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_tagihan_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_user_role() FROM PUBLIC, anon, authenticated;
