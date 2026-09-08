-- Phase 1: close anonymous access to SECURITY DEFINER helpers while
-- preserving the authenticated paths used by RLS/client code.

-- users_profile policies should never target anonymous sessions.
ALTER POLICY "Admin can update profiles"
  ON public.users_profile TO authenticated;
ALTER POLICY "Admin can view all profiles"
  ON public.users_profile TO authenticated;
ALTER POLICY "Users can view own profile"
  ON public.users_profile TO authenticated;

-- Authenticated helper RPCs: remove inherited PUBLIC/anon access, then
-- explicitly preserve authenticated + service_role execution.
REVOKE ALL ON FUNCTION public.daftarkan_push_token(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daftarkan_push_token(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_nomor_jurnal(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_nomor_jurnal(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_pegawai_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pegawai_id(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_siswa_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_siswa_id(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tarif_siswa(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tarif_siswa(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guru_teaches_class(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guru_teaches_class(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guru_teaches_mapel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guru_teaches_mapel(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hitung_jatuh_tempo_tagihan(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitung_jatuh_tempo_tagihan(uuid, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin_or_kepala(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_kepala(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_ortu_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ortu_of(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_own_pegawai(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_pegawai(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_own_siswa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_siswa(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_penyetuju_diskon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_penyetuju_diskon(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_unit_locked_for_transaksi(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_unit_locked_for_transaksi(date, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_unit_pendidikan_ditutup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_unit_pendidikan_ditutup(uuid) TO authenticated, service_role;

-- This helper is intentionally internal-only according to the repository's
-- existing hardening migration. It is called from service-role tagihan flows.
REVOKE ALL ON FUNCTION public.get_siswa_tahun_masuk(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_siswa_tahun_masuk(uuid) TO service_role;

-- Fix mutable search_path warnings without changing function bodies.
ALTER FUNCTION public.hitung_mutasi_akun_incl_draft(integer, uuid[])
  SET search_path TO public;
ALTER FUNCTION public.hitung_mutasi_akun_range_incl_draft(date, date, uuid[])
  SET search_path TO public;
