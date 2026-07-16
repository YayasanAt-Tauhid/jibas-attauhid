-- Push notification app mobile Portal Ortu (fase 2).
-- Tabel penyimpan Expo push token per perangkat + RPC registrasi.
--
-- Alur: app mobile mendaftarkan token via RPC daftarkan_push_token setelah
-- login; server (webhook Midtrans dkk.) membaca tabel ini dengan service role
-- lalu mengirim pesan ke Expo Push API. Token yang mati (DeviceNotRegistered)
-- dihapus server secara best-effort.

CREATE TABLE IF NOT EXISTS public.perangkat_push_ortu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform text,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perangkat_push_ortu_user
  ON public.perangkat_push_ortu(user_id);

CREATE TRIGGER trg_perangkat_push_ortu_updated
  BEFORE UPDATE ON public.perangkat_push_ortu
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.perangkat_push_ortu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User lihat token sendiri" ON public.perangkat_push_ortu
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Dipakai app saat logout: hapus token perangkat ini agar akun lama tidak
-- terus menerima notifikasi.
CREATE POLICY "User hapus token sendiri" ON public.perangkat_push_ortu
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Registrasi lewat RPC SECURITY DEFINER (bukan INSERT langsung) supaya token
-- yang berpindah akun (logout lalu login akun lain di perangkat yang sama)
-- bisa diambil alih secara atomik meski barisnya masih tercatat milik user
-- lama — INSERT ... ON CONFLICT langsung dari client akan tertolak RLS.
CREATE OR REPLACE FUNCTION public.daftarkan_push_token(
  p_token text,
  p_platform text DEFAULT NULL,
  p_device_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_token IS NULL OR p_token !~ '^(Expo|Exponent)PushToken\[' THEN
    RAISE EXCEPTION 'Token push tidak valid';
  END IF;

  INSERT INTO public.perangkat_push_ortu (user_id, expo_push_token, platform, device_name)
  VALUES (auth.uid(), p_token, p_platform, p_device_name)
  ON CONFLICT (expo_push_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.daftarkan_push_token(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.daftarkan_push_token(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.daftarkan_push_token(text, text, text) TO authenticated;
