
CREATE TABLE public.sekolah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text, alamat text, kota text, telepon text, email text,
  logo_url text, kepala_sekolah text, npsn text, akreditasi text
);

CREATE TABLE public.tahun_ajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, tanggal_mulai date, tanggal_selesai date,
  aktif boolean DEFAULT false, keterangan text
);

CREATE TABLE public.semester (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  nama text, urutan int, aktif boolean DEFAULT false
);

CREATE TABLE public.departemen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, kode text, keterangan text, aktif boolean DEFAULT true
);

CREATE TABLE public.tingkat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, urutan int,
  departemen_id uuid REFERENCES public.departemen(id), aktif boolean DEFAULT true
);

CREATE TABLE public.kelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, tingkat_id uuid REFERENCES public.tingkat(id),
  departemen_id uuid REFERENCES public.departemen(id),
  wali_kelas_id uuid, kapasitas int DEFAULT 36, aktif boolean DEFAULT true
);

CREATE TABLE public.angkatan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, departemen_id uuid REFERENCES public.departemen(id),
  aktif boolean DEFAULT true, keterangan text
);

CREATE TABLE public.pegawai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nip text UNIQUE, nama text NOT NULL, jenis_kelamin text,
  tempat_lahir text, tanggal_lahir date, agama text, alamat text,
  telepon text, email text, foto_url text, jabatan text,
  status text DEFAULT 'aktif', created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_pegawai_jk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.jenis_kelamin IS NOT NULL AND NEW.jenis_kelamin NOT IN ('L', 'P') THEN
    RAISE EXCEPTION 'jenis_kelamin harus L atau P';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_pegawai_jk BEFORE INSERT OR UPDATE ON public.pegawai
FOR EACH ROW EXECUTE FUNCTION public.validate_pegawai_jk();

ALTER TABLE public.kelas ADD CONSTRAINT fk_wali_kelas FOREIGN KEY (wali_kelas_id) REFERENCES public.pegawai(id);

CREATE TABLE public.siswa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nis text UNIQUE, nama text NOT NULL, jenis_kelamin text,
  tempat_lahir text, tanggal_lahir date, agama text, alamat text,
  telepon text, email text, foto_url text, status text DEFAULT 'aktif',
  angkatan_id uuid REFERENCES public.angkatan(id), created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_siswa_jk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.jenis_kelamin IS NOT NULL AND NEW.jenis_kelamin NOT IN ('L', 'P') THEN
    RAISE EXCEPTION 'jenis_kelamin harus L atau P';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_siswa_jk BEFORE INSERT OR UPDATE ON public.siswa
FOR EACH ROW EXECUTE FUNCTION public.validate_siswa_jk();

CREATE TABLE public.siswa_detail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id) ON DELETE CASCADE,
  nama_ayah text, nama_ibu text, pekerjaan_ayah text, pekerjaan_ibu text,
  telepon_ortu text, alamat_ortu text
);

CREATE TABLE public.kelas_siswa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  kelas_id uuid REFERENCES public.kelas(id),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  aktif boolean DEFAULT true
);

CREATE TABLE public.mata_pelajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text, nama text NOT NULL,
  departemen_id uuid REFERENCES public.departemen(id),
  tingkat_id uuid REFERENCES public.tingkat(id),
  keterangan text, aktif boolean DEFAULT true
);

CREATE TABLE public.pegawai_mapel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  mapel_id uuid REFERENCES public.mata_pelajaran(id) ON DELETE CASCADE
);

CREATE TABLE public.jadwal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kelas_id uuid REFERENCES public.kelas(id),
  mapel_id uuid REFERENCES public.mata_pelajaran(id),
  pegawai_id uuid REFERENCES public.pegawai(id),
  hari text, jam_mulai time, jam_selesai time, ruangan text,
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id)
);

CREATE TABLE public.presensi_siswa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  kelas_id uuid REFERENCES public.kelas(id),
  tanggal date NOT NULL, status text, keterangan text,
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id),
  pegawai_id uuid REFERENCES public.pegawai(id)
);

CREATE OR REPLACE FUNCTION public.validate_presensi_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('H', 'I', 'S', 'A') THEN
    RAISE EXCEPTION 'status presensi harus H, I, S, atau A';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_presensi_status BEFORE INSERT OR UPDATE ON public.presensi_siswa
FOR EACH ROW EXECUTE FUNCTION public.validate_presensi_status();

CREATE TABLE public.penilaian (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  mapel_id uuid REFERENCES public.mata_pelajaran(id),
  kelas_id uuid REFERENCES public.kelas(id),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id),
  jenis_ujian text, nilai numeric(5,2), keterangan text
);

CREATE TABLE public.jenis_pembayaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, nominal numeric(15,2), keterangan text, aktif boolean DEFAULT true
);

CREATE TABLE public.pembayaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  jenis_id uuid REFERENCES public.jenis_pembayaran(id),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  bulan int, jumlah numeric(15,2), tanggal_bayar date,
  petugas_id uuid REFERENCES public.pegawai(id), keterangan text
);

CREATE TABLE public.users_profile (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, role text DEFAULT 'siswa',
  pegawai_id uuid REFERENCES public.pegawai(id),
  siswa_id uuid REFERENCES public.siswa(id),
  aktif boolean DEFAULT true, created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS NOT NULL AND NEW.role NOT IN ('admin', 'kepala_sekolah', 'guru', 'keuangan', 'siswa', 'pustakawan') THEN
    RAISE EXCEPTION 'role tidak valid';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_user_role BEFORE INSERT OR UPDATE ON public.users_profile
FOR EACH ROW EXECUTE FUNCTION public.validate_user_role();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users_profile (id, email, role) VALUES (NEW.id, NEW.email, 'siswa');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users_profile WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users_profile WHERE id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_kepala(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users_profile WHERE id = _user_id AND role IN ('admin', 'kepala_sekolah'))
$$;

ALTER TABLE public.sekolah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahun_ajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departemen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tingkat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angkatan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pegawai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siswa_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mata_pelajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pegawai_mapel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presensi_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penilaian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jenis_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users_profile FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON public.users_profile FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update profiles" ON public.users_profile FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auth read sekolah" ON public.sekolah FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage sekolah" ON public.sekolah FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read tahun_ajaran" ON public.tahun_ajaran FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage tahun_ajaran" ON public.tahun_ajaran FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read semester" ON public.semester FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage semester" ON public.semester FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read departemen" ON public.departemen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage departemen" ON public.departemen FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read tingkat" ON public.tingkat FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage tingkat" ON public.tingkat FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read kelas" ON public.kelas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kelas" ON public.kelas FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read angkatan" ON public.angkatan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage angkatan" ON public.angkatan FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read pegawai" ON public.pegawai FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage pegawai" ON public.pegawai FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read siswa" ON public.siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage siswa" ON public.siswa FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read siswa_detail" ON public.siswa_detail FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage siswa_detail" ON public.siswa_detail FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read kelas_siswa" ON public.kelas_siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kelas_siswa" ON public.kelas_siswa FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read mata_pelajaran" ON public.mata_pelajaran FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage mata_pelajaran" ON public.mata_pelajaran FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read pegawai_mapel" ON public.pegawai_mapel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage pegawai_mapel" ON public.pegawai_mapel FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read jadwal" ON public.jadwal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage jadwal" ON public.jadwal FOR ALL TO authenticated USING (public.is_admin_or_kepala(auth.uid())) WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read presensi" ON public.presensi_siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin guru manage presensi" ON public.presensi_siswa FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'));

CREATE POLICY "Auth read penilaian" ON public.penilaian FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin guru manage penilaian" ON public.penilaian FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'));

CREATE POLICY "Auth read jenis_pembayaran" ON public.jenis_pembayaran FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin keuangan manage jenis_pembayaran" ON public.jenis_pembayaran FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

CREATE POLICY "Auth read pembayaran" ON public.pembayaran FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin keuangan manage pembayaran" ON public.pembayaran FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));
