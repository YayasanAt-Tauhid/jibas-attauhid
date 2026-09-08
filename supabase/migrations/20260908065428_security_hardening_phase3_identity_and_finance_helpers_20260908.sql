-- Phase 3: prevent authenticated users from probing another user's identity/role
-- through SECURITY DEFINER RLS helper functions. Service-role/database calls
-- (auth.uid() IS NULL) remain supported.

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT role
  FROM public.users_profile
  WHERE id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_my_pegawai_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT pegawai_id
  FROM public.users_profile
  WHERE id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_my_siswa_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT siswa_id
  FROM public.users_profile
  WHERE id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.users_profile
       WHERE id = _user_id AND role = _role
     )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_kepala(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.users_profile
       WHERE id = _user_id AND role IN ('admin', 'kepala_sekolah')
     )
$$;

CREATE OR REPLACE FUNCTION public.is_penyetuju_diskon(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.users_profile
       WHERE id = _user_id AND role IN ('admin', 'sekretaris_yayasan')
     )
$$;

CREATE OR REPLACE FUNCTION public.is_own_pegawai(_user_id uuid, _pegawai_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.users_profile
       WHERE id = _user_id AND pegawai_id = _pegawai_id
     )
$$;

CREATE OR REPLACE FUNCTION public.is_own_siswa(_user_id uuid, _siswa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.users_profile
       WHERE id = _user_id AND siswa_id = _siswa_id
     )
$$;

CREATE OR REPLACE FUNCTION public.is_ortu_of(p_user_id uuid, p_siswa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR p_user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.ortu_siswa
       WHERE user_id = p_user_id AND siswa_id = p_siswa_id
     )
$$;

CREATE OR REPLACE FUNCTION public.guru_teaches_class(_user_id uuid, _kelas_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.jadwal j
       JOIN public.users_profile up ON up.pegawai_id = j.pegawai_id
       WHERE up.id = _user_id AND j.kelas_id = _kelas_id
     )
$$;

CREATE OR REPLACE FUNCTION public.guru_teaches_mapel(_user_id uuid, _mapel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.pegawai_mapel pm
       JOIN public.users_profile up ON up.pegawai_id = pm.pegawai_id
       WHERE up.id = _user_id AND pm.mapel_id = _mapel_id
     )
$$;

-- Finance helpers that bypass RLS because of SECURITY DEFINER must not be
-- usable by arbitrary signed-in roles. Browser finance flows use these from
-- admin/kepala_sekolah/keuangan/kasir; service_role has auth.uid() NULL.
CREATE OR REPLACE FUNCTION public.get_tarif_siswa(
  p_jenis_id uuid,
  p_siswa_id uuid,
  p_kelas_id uuid DEFAULT NULL::uuid,
  p_tahun_ajaran_id uuid DEFAULT NULL::uuid,
  p_angkatan_id uuid DEFAULT NULL::uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR public.is_admin_or_kepala(auth.uid())
      OR public.has_role(auth.uid(), 'keuangan')
      OR public.has_role(auth.uid(), 'kasir')
    THEN COALESCE(
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id IS NULL AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id IS NULL AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id = p_angkatan_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id = p_angkatan_id AND tahun_ajaran_id IS NULL AND aktif = true LIMIT 1),
      (SELECT nominal FROM public.tarif_tagihan
       WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true LIMIT 1)
    )
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.generate_nomor_jurnal(p_prefix text, p_tahun integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_prefix text := p_prefix || '-' || p_tahun || '-';
  v_last text;
  v_num int := 1;
  v_parts text[];
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_admin_or_kepala(auth.uid())
       OR public.has_role(auth.uid(), 'keuangan')
       OR public.has_role(auth.uid(), 'kasir')
     ) THEN
    RAISE EXCEPTION 'Tidak diizinkan membuat nomor jurnal';
  END IF;

  SELECT nomor INTO v_last
  FROM public.jurnal
  WHERE nomor LIKE v_prefix || '%'
  ORDER BY CAST(SPLIT_PART(nomor, '-', 3) AS int) DESC
  LIMIT 1;

  IF v_last IS NOT NULL THEN
    v_parts := string_to_array(v_last, '-');
    v_num := CAST(v_parts[array_length(v_parts, 1)] AS int) + 1;
  END IF;

  RETURN v_prefix || LPAD(v_num::text, 4, '0');
END;
$$;
