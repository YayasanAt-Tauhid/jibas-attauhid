
ALTER FUNCTION public.validate_pegawai_jk() SET search_path = public;
ALTER FUNCTION public.validate_siswa_jk() SET search_path = public;
ALTER FUNCTION public.validate_presensi_status() SET search_path = public;
ALTER FUNCTION public.validate_user_role() SET search_path = public;

CREATE OR REPLACE FUNCTION public.guru_teaches_class(_user_id uuid, _kelas_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM jadwal j JOIN users_profile up ON up.pegawai_id = j.pegawai_id WHERE up.id = _user_id AND j.kelas_id = _kelas_id)
$$;

CREATE OR REPLACE FUNCTION public.guru_teaches_mapel(_user_id uuid, _mapel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pegawai_mapel pm JOIN users_profile up ON up.pegawai_id = pm.pegawai_id WHERE up.id = _user_id AND pm.mapel_id = _mapel_id)
$$;

CREATE OR REPLACE FUNCTION public.is_own_siswa(_user_id uuid, _siswa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users_profile WHERE id = _user_id AND siswa_id = _siswa_id)
$$;

CREATE OR REPLACE FUNCTION public.is_own_pegawai(_user_id uuid, _pegawai_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users_profile WHERE id = _user_id AND pegawai_id = _pegawai_id)
$$;

CREATE OR REPLACE FUNCTION public.get_my_siswa_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT siswa_id FROM users_profile WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.get_my_pegawai_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pegawai_id FROM users_profile WHERE id = _user_id
$$;

DROP POLICY IF EXISTS "Admin manage siswa" ON siswa;
DROP POLICY IF EXISTS "Auth read siswa" ON siswa;
DROP POLICY IF EXISTS "Admin guru manage penilaian" ON penilaian;
DROP POLICY IF EXISTS "Auth read penilaian" ON penilaian;
DROP POLICY IF EXISTS "Admin keuangan manage pembayaran" ON pembayaran;
DROP POLICY IF EXISTS "Auth read pembayaran" ON pembayaran;
DROP POLICY IF EXISTS "Admin manage pegawai" ON pegawai;
DROP POLICY IF EXISTS "Auth read pegawai" ON pegawai;
DROP POLICY IF EXISTS "Admin guru manage presensi" ON presensi_siswa;
DROP POLICY IF EXISTS "Auth read presensi" ON presensi_siswa;

CREATE POLICY "admin_siswa_all" ON siswa FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_siswa_select" ON siswa FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "guru_siswa_select" ON siswa FOR SELECT TO authenticated USING (has_role(auth.uid(), 'guru') AND EXISTS (SELECT 1 FROM kelas_siswa ks JOIN jadwal j ON j.kelas_id = ks.kelas_id JOIN users_profile up ON up.pegawai_id = j.pegawai_id WHERE up.id = auth.uid() AND ks.siswa_id = siswa.id AND ks.aktif = true));
CREATE POLICY "siswa_own_select" ON siswa FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), id));

CREATE POLICY "admin_penilaian_all" ON penilaian FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_penilaian_select" ON penilaian FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "guru_penilaian_insert" ON penilaian FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'guru') AND guru_teaches_mapel(auth.uid(), mapel_id));
CREATE POLICY "guru_penilaian_update" ON penilaian FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'guru') AND guru_teaches_mapel(auth.uid(), mapel_id)) WITH CHECK (has_role(auth.uid(), 'guru') AND guru_teaches_mapel(auth.uid(), mapel_id));
CREATE POLICY "guru_penilaian_select" ON penilaian FOR SELECT TO authenticated USING (has_role(auth.uid(), 'guru') AND guru_teaches_mapel(auth.uid(), mapel_id));
CREATE POLICY "siswa_penilaian_select" ON penilaian FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));

CREATE POLICY "admin_pembayaran_all" ON pembayaran FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "keuangan_pembayaran_all" ON pembayaran FOR ALL TO authenticated USING (has_role(auth.uid(), 'keuangan')) WITH CHECK (has_role(auth.uid(), 'keuangan'));
CREATE POLICY "kepsek_pembayaran_select" ON pembayaran FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "siswa_pembayaran_select" ON pembayaran FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));

CREATE POLICY "admin_pegawai_all" ON pegawai FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_pegawai_select" ON pegawai FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "kepsek_pegawai_update_own" ON pegawai FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah') AND is_own_pegawai(auth.uid(), id)) WITH CHECK (has_role(auth.uid(), 'kepala_sekolah') AND is_own_pegawai(auth.uid(), id));
CREATE POLICY "guru_pegawai_select" ON pegawai FOR SELECT TO authenticated USING (has_role(auth.uid(), 'guru'));

CREATE POLICY "admin_presensi_all" ON presensi_siswa FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_presensi_select" ON presensi_siswa FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "guru_presensi_insert" ON presensi_siswa FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'guru') AND guru_teaches_class(auth.uid(), kelas_id));
CREATE POLICY "guru_presensi_update" ON presensi_siswa FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'guru') AND guru_teaches_class(auth.uid(), kelas_id)) WITH CHECK (has_role(auth.uid(), 'guru') AND guru_teaches_class(auth.uid(), kelas_id));
CREATE POLICY "guru_presensi_select" ON presensi_siswa FOR SELECT TO authenticated USING (has_role(auth.uid(), 'guru') AND guru_teaches_class(auth.uid(), kelas_id));
CREATE POLICY "siswa_presensi_select" ON presensi_siswa FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars-siswa', 'avatars-siswa', false),
  ('avatars-pegawai', 'avatars-pegawai', false),
  ('logos-sekolah', 'logos-sekolah', true),
  ('dokumen-buletin', 'dokumen-buletin', false),
  ('soal-cbe', 'soal-cbe', false),
  ('covers-buku', 'covers-buku', true),
  ('elearning', 'elearning', false);

CREATE POLICY "admin_avatars_siswa_all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'avatars-siswa' AND has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'avatars-siswa' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_avatars_siswa_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars-siswa');
CREATE POLICY "admin_avatars_pegawai_all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'avatars-pegawai' AND has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'avatars-pegawai' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_avatars_pegawai_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars-pegawai');
CREATE POLICY "public_logos_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'logos-sekolah');
CREATE POLICY "admin_logos_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'logos-sekolah' AND has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'logos-sekolah' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_buletin_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'dokumen-buletin' AND is_admin_or_kepala(auth.uid())) WITH CHECK (bucket_id = 'dokumen-buletin' AND is_admin_or_kepala(auth.uid()));
CREATE POLICY "auth_buletin_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'dokumen-buletin');
CREATE POLICY "admin_guru_soal_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'soal-cbe' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'guru'))) WITH CHECK (bucket_id = 'soal-cbe' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'guru')));
CREATE POLICY "auth_soal_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'soal-cbe');
CREATE POLICY "public_covers_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'covers-buku');
CREATE POLICY "admin_pustakawan_covers_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'covers-buku' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pustakawan'))) WITH CHECK (bucket_id = 'covers-buku' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pustakawan')));
CREATE POLICY "admin_guru_elearning_manage" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'elearning' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'guru'))) WITH CHECK (bucket_id = 'elearning' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'guru')));
CREATE POLICY "auth_elearning_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'elearning');

ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);
ALTER TABLE public.jenis_pembayaran ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);

CREATE TABLE public.presensi_kbm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  jadwal_id uuid REFERENCES public.jadwal(id),
  tanggal date NOT NULL,
  status text,
  keterangan text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_presensi_kbm_status() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('H', 'I', 'S', 'A') THEN RAISE EXCEPTION 'status presensi harus H, I, S, atau A'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_presensi_kbm_status BEFORE INSERT OR UPDATE ON public.presensi_kbm FOR EACH ROW EXECUTE FUNCTION public.validate_presensi_kbm_status();

ALTER TABLE public.presensi_kbm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_presensi_kbm_all" ON presensi_kbm FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_presensi_kbm_select" ON presensi_kbm FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "guru_presensi_kbm_manage" ON presensi_kbm FOR ALL TO authenticated USING (has_role(auth.uid(), 'guru')) WITH CHECK (has_role(auth.uid(), 'guru'));
CREATE POLICY "siswa_presensi_kbm_select" ON presensi_kbm FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));

CREATE TABLE public.presensi_pegawai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id),
  tanggal date NOT NULL,
  jam_masuk time, jam_keluar time,
  status text, keterangan text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.presensi_pegawai ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_presensi_pegawai_all" ON presensi_pegawai FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "kepsek_presensi_pegawai_select" ON presensi_pegawai FOR SELECT TO authenticated USING (has_role(auth.uid(), 'kepala_sekolah'));
CREATE POLICY "pegawai_presensi_own_select" ON presensi_pegawai FOR SELECT TO authenticated USING (is_own_pegawai(auth.uid(), pegawai_id));

ALTER TABLE public.siswa_detail ADD COLUMN IF NOT EXISTS asal_sekolah text;
ALTER TABLE public.siswa_detail ADD COLUMN IF NOT EXISTS kelas_terakhir text;
ALTER TABLE public.siswa_detail ADD COLUMN IF NOT EXISTS jenis_pendaftaran text;
ALTER TABLE public.siswa_detail ADD COLUMN IF NOT EXISTS alasan_pindah text;
