-- 1. Riwayat Golongan/Pangkat
CREATE TABLE public.riwayat_golongan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  golongan text NOT NULL,
  pangkat text,
  tmt date,
  sampai date,
  sk_nomor text,
  sk_tanggal date,
  keterangan text
);
ALTER TABLE public.riwayat_golongan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage riwayat_golongan" ON public.riwayat_golongan FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid())) WITH CHECK (is_admin_or_kepala(auth.uid()));
CREATE POLICY "Auth read riwayat_golongan" ON public.riwayat_golongan FOR SELECT TO authenticated USING (true);

-- 2. Riwayat Gaji
CREATE TABLE public.riwayat_gaji (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  gaji_pokok numeric NOT NULL DEFAULT 0,
  tunjangan numeric DEFAULT 0,
  potongan numeric DEFAULT 0,
  total numeric GENERATED ALWAYS AS (gaji_pokok + tunjangan - potongan) STORED,
  berlaku_mulai date,
  berlaku_sampai date,
  sk_nomor text,
  keterangan text
);
ALTER TABLE public.riwayat_gaji ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage riwayat_gaji" ON public.riwayat_gaji FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid())) WITH CHECK (is_admin_or_kepala(auth.uid()));
CREATE POLICY "Pegawai own gaji" ON public.riwayat_gaji FOR SELECT TO authenticated USING (is_own_pegawai(auth.uid(), pegawai_id));

-- 3. Sertifikasi Guru
CREATE TABLE public.sertifikasi_guru (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  jenis text NOT NULL,
  nomor_sertifikat text,
  tanggal_terbit date,
  tanggal_berlaku date,
  penerbit text,
  keterangan text,
  aktif boolean DEFAULT true
);
ALTER TABLE public.sertifikasi_guru ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage sertifikasi" ON public.sertifikasi_guru FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid())) WITH CHECK (is_admin_or_kepala(auth.uid()));
CREATE POLICY "Auth read sertifikasi" ON public.sertifikasi_guru FOR SELECT TO authenticated USING (true);

-- 4. Keluarga Pegawai
CREATE TABLE public.keluarga_pegawai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  nama text NOT NULL,
  hubungan text NOT NULL,
  jenis_kelamin text,
  tanggal_lahir date,
  pekerjaan text,
  keterangan text
);
ALTER TABLE public.keluarga_pegawai ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage keluarga" ON public.keluarga_pegawai FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid())) WITH CHECK (is_admin_or_kepala(auth.uid()));
CREATE POLICY "Auth read keluarga" ON public.keluarga_pegawai FOR SELECT TO authenticated USING (true);

-- 5. Add pensiun-related columns to pegawai
ALTER TABLE public.pegawai ADD COLUMN IF NOT EXISTS tanggal_masuk date;
ALTER TABLE public.pegawai ADD COLUMN IF NOT EXISTS tanggal_pensiun date;
ALTER TABLE public.pegawai ADD COLUMN IF NOT EXISTS golongan_terakhir text;