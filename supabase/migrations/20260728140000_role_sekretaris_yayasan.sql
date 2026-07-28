-- ─────────────────────────────────────────────────────────────────────────────
-- Role baru: sekretaris_yayasan
--
-- Dibutuhkan oleh alur persetujuan diskon/keringanan SPP: pengajuan diskon
-- (beasiswa, kakak-adik, keringanan kurang mampu) di-input staf keuangan, tapi
-- yang berhak MENYETUJUI adalah sekretaris yayasan -- pemisahan input vs
-- approval, supaya potongan pendapatan tidak bisa diberikan sepihak oleh satu
-- orang saja.
--
-- Daftar role di bawah adalah SELURUH role yang valid saat ini (hasil dump dari
-- DB live, bukan gabungan file migrasi -- beberapa role ditambahkan langsung
-- lewat MCP tanpa file migrasi). Jangan persempit daftarnya.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_user_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role IS NOT NULL AND NEW.role NOT IN (
    'admin','kepala_sekolah','guru','keuangan','kasir','pustakawan','siswa','ortu',
    'sekretaris_yayasan'
  ) THEN
    RAISE EXCEPTION 'role tidak valid: %', NEW.role;
  END IF;
  RETURN NEW;
END; $$;

-- Predikat bantu supaya policy & RPC tidak menyebar string role literal.
-- Sekretaris yayasan menyetujui; admin tetap bisa (super user aplikasi).
CREATE OR REPLACE FUNCTION public.is_penyetuju_diskon(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = _user_id AND role IN ('admin', 'sekretaris_yayasan')
  )
$$;

COMMENT ON FUNCTION public.is_penyetuju_diskon(uuid) IS
  'TRUE bila user berhak menyetujui/menolak pengajuan diskon siswa '
  '(sekretaris yayasan, atau admin sebagai super user aplikasi).';

-- Dipakai sebagai predikat RLS -> role yang mengevaluasi policy butuh EXECUTE.
-- Sama seperti has_role/is_admin_or_kepala yang sudah ada.
GRANT EXECUTE ON FUNCTION public.is_penyetuju_diskon(uuid) TO anon, authenticated, service_role;
