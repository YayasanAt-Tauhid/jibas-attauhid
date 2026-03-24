
CREATE TABLE public.jenis_pengeluaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL, keterangan text, aktif boolean DEFAULT true, created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pengeluaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_id uuid REFERENCES public.jenis_pengeluaran(id),
  jumlah numeric(15,2) NOT NULL, tanggal date NOT NULL, keterangan text,
  petugas_id uuid REFERENCES public.pegawai(id), created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tabungan_siswa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id) ON DELETE CASCADE UNIQUE,
  saldo numeric(15,2) DEFAULT 0, updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.transaksi_tabungan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id), jenis text NOT NULL,
  jumlah numeric(15,2) NOT NULL, saldo_sesudah numeric(15,2),
  tanggal date NOT NULL, keterangan text,
  petugas_id uuid REFERENCES public.pegawai(id), created_at timestamptz DEFAULT now()
);

ALTER TABLE public.jenis_pengeluaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengeluaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabungan_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_tabungan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_jenis_pengeluaran" ON public.jenis_pengeluaran FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_keuangan_manage_jenis_pengeluaran" ON public.jenis_pengeluaran FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "kepsek_read_pengeluaran" ON public.pengeluaran FOR SELECT TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_manage_pengeluaran" ON public.pengeluaran FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_manage_tabungan" ON public.tabungan_siswa FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "siswa_own_tabungan" ON public.tabungan_siswa FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));
CREATE POLICY "admin_keuangan_manage_transaksi" ON public.transaksi_tabungan FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "siswa_own_transaksi_tabungan" ON public.transaksi_tabungan FOR SELECT TO authenticated USING (is_own_siswa(auth.uid(), siswa_id));

CREATE TABLE public.akun_rekening (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text NOT NULL UNIQUE, nama text NOT NULL, jenis text NOT NULL,
  saldo_normal text NOT NULL, saldo_awal numeric(15,2) DEFAULT 0,
  keterangan text, aktif boolean DEFAULT true, created_at timestamptz DEFAULT now()
);

CREATE TABLE public.jurnal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor text UNIQUE, tanggal date NOT NULL, keterangan text NOT NULL,
  referensi text, total_debit numeric(15,2) DEFAULT 0, total_kredit numeric(15,2) DEFAULT 0,
  status text DEFAULT 'draft', dibuat_oleh uuid REFERENCES public.pegawai(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.jurnal_detail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurnal_id uuid REFERENCES public.jurnal(id) ON DELETE CASCADE,
  akun_id uuid REFERENCES public.akun_rekening(id),
  keterangan text, debit numeric(15,2) DEFAULT 0, kredit numeric(15,2) DEFAULT 0, urutan int DEFAULT 1
);

ALTER TABLE public.akun_rekening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurnal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurnal_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_akun" ON public.akun_rekening FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_keuangan_manage_akun" ON public.akun_rekening FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_read_jurnal" ON public.jurnal FOR SELECT TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_manage_jurnal" ON public.jurnal FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_read_jurnal_detail" ON public.jurnal_detail FOR SELECT TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));
CREATE POLICY "admin_keuangan_manage_jurnal_detail" ON public.jurnal_detail FOR ALL TO authenticated USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan')) WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

INSERT INTO public.akun_rekening (kode, nama, jenis, saldo_normal) VALUES
  ('1-1001', 'Kas Tunai', 'aset', 'debit'), ('1-1002', 'Kas Bank', 'aset', 'debit'),
  ('1-1003', 'Piutang SPP', 'aset', 'debit'), ('1-1004', 'Perlengkapan Kantor', 'aset', 'debit'),
  ('1-2001', 'Peralatan Sekolah', 'aset', 'debit'), ('2-1001', 'Utang Usaha', 'liabilitas', 'kredit'),
  ('2-1002', 'Utang Gaji', 'liabilitas', 'kredit'), ('3-1001', 'Modal Yayasan', 'ekuitas', 'kredit'),
  ('3-1002', 'Saldo Tahun Lalu', 'ekuitas', 'kredit'), ('4-1001', 'Pendapatan SPP', 'pendapatan', 'kredit'),
  ('4-1002', 'Pendapatan Uang Pangkal', 'pendapatan', 'kredit'), ('4-1003', 'Pendapatan Kegiatan', 'pendapatan', 'kredit'),
  ('4-1004', 'Pendapatan Lainnya', 'pendapatan', 'kredit'), ('5-1001', 'Beban Gaji Guru', 'beban', 'debit'),
  ('5-1002', 'Beban Gaji Staf', 'beban', 'debit'), ('5-1003', 'Beban Listrik & Air', 'beban', 'debit'),
  ('5-1004', 'Beban ATK', 'beban', 'debit'), ('5-1005', 'Beban Pemeliharaan', 'beban', 'debit'),
  ('5-1006', 'Beban Kegiatan Siswa', 'beban', 'debit'), ('5-1007', 'Beban Lainnya', 'beban', 'debit');

ALTER TABLE public.akun_rekening ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);
ALTER TABLE public.jurnal ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);
ALTER TABLE public.jenis_pengeluaran ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);
ALTER TABLE public.pengeluaran ADD COLUMN IF NOT EXISTS departemen_id uuid REFERENCES public.departemen(id);
