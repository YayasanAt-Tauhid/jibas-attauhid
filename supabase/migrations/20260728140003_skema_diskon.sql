-- ─────────────────────────────────────────────────────────────────────────────
-- Skema diskon & pemberian diskon per siswa
--
-- ATURAN BISNIS YANG DITEGAKKAN DI SINI (keputusan yayasan, 28 Juli 2026):
--
--   * Keringanan bersifat EKSKLUSIF: satu siswa hanya boleh punya SATU diskon
--     aktif untuk satu jenis pembayaran pada rentang waktu yang sama. Tidak
--     bisa menumpuk potongan kakak-adik dengan keringanan kurang mampu.
--     Ditegakkan lewat EXCLUDE constraint (bukan hanya validasi aplikasi):
--     validasi di layer TS bisa dilewati lewat jalur lain, constraint DB tidak.
--
--   * Diskon berlaku untuk RENTANG WAKTU yang dipilih, mis. Jul 2026-Jun 2027
--     (dua semester) atau Jul-Des 2026 (satu semester) atau bulan tertentu
--     saja. Bukan per baris tagihan yang dicentang satu per satu.
--
--   * Pengajuan disetujui oleh SEKRETARIS YAYASAN (lihat migrasi
--     20260728140000), bukan oleh staf yang meng-input.
--
-- CATATAN DESAIN: jenis_id sengaja NOT NULL (tidak ada opsi "berlaku semua
-- jenis pembayaran"). Alasannya bukan kesederhanaan, tapi keamanan constraint:
-- di EXCLUDE constraint, NULL tidak pernah dianggap konflik dengan nilai apa
-- pun, sehingga baris "semua jenis" TIDAK akan memblokir baris diskon spesifik
-- -- aturan eksklusivitas jadi bolong tanpa ada yang menyadarinya. Kalau satu
-- siswa perlu keringanan di beberapa jenis pembayaran, buat satu baris per
-- jenis; itu eksplisit dan tetap ter-cover constraint.
-- ─────────────────────────────────────────────────────────────────────────────

-- Dibutuhkan agar kolom uuid/integer bisa ikut dalam EXCLUDE ... USING gist
-- bersama daterange. Tanpa ini, `siswa_id WITH =` ditolak: gist tidak punya
-- operator class bawaan untuk uuid.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. Master skema diskon ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skema_diskon (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama           text NOT NULL,
  kategori       text NOT NULL,
  tipe           text NOT NULL,
  nilai_default  numeric(15,2) NOT NULL DEFAULT 0,
  perlu_approval boolean NOT NULL DEFAULT true,
  aktif          boolean NOT NULL DEFAULT true,
  keterangan     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skema_diskon_nama_key UNIQUE (nama),
  CONSTRAINT skema_diskon_kategori_check
    CHECK (kategori IN ('beasiswa', 'keringanan', 'kakak_adik', 'bantuan', 'lainnya')),
  CONSTRAINT skema_diskon_tipe_check
    CHECK (tipe IN ('persen', 'nominal')),
  CONSTRAINT skema_diskon_nilai_check
    CHECK (
      nilai_default >= 0
      AND (tipe <> 'persen' OR nilai_default <= 100)
    )
);

COMMENT ON TABLE public.skema_diskon IS
  'Master jenis potongan/keringanan. nilai_default bisa dioverride per siswa '
  'di siswa_diskon.nilai.';
COMMENT ON COLUMN public.skema_diskon.tipe IS
  'persen = % dari tarif bruto (maks 100); nominal = potongan rupiah tetap.';

-- ── 2. Pemberian diskon per siswa ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.siswa_diskon (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id          uuid NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
  skema_diskon_id   uuid NOT NULL REFERENCES public.skema_diskon(id) ON DELETE RESTRICT,
  jenis_id          uuid NOT NULL REFERENCES public.jenis_pembayaran(id) ON DELETE RESTRICT,
  periode_mulai     date NOT NULL,
  periode_selesai   date NOT NULL,
  nilai             numeric(15,2),
  status            text NOT NULL DEFAULT 'diajukan',
  catatan           text,
  dokumen_url       text,
  alasan_penolakan  text,
  diajukan_oleh     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  diajukan_at       timestamptz NOT NULL DEFAULT now(),
  diputuskan_oleh   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  diputuskan_at     timestamptz,
  diterapkan_at     timestamptz,
  CONSTRAINT siswa_diskon_status_check
    CHECK (status IN ('diajukan', 'disetujui', 'ditolak', 'dibatalkan')),
  CONSTRAINT siswa_diskon_periode_check
    CHECK (periode_selesai >= periode_mulai),
  CONSTRAINT siswa_diskon_nilai_check
    CHECK (nilai IS NULL OR nilai >= 0)
);

COMMENT ON TABLE public.siswa_diskon IS
  'Pemberian diskon ke siswa untuk satu jenis pembayaran pada satu rentang '
  'waktu. Eksklusif: rentang yang tumpang tindih untuk siswa+jenis yang sama '
  'ditolak EXCLUDE constraint selama statusnya masih diajukan/disetujui.';
COMMENT ON COLUMN public.siswa_diskon.nilai IS
  'Override skema_diskon.nilai_default. NULL = pakai nilai default skema.';
COMMENT ON COLUMN public.siswa_diskon.diterapkan_at IS
  'Kapan diskon ini diterapkan ke baris tagihan (lihat terapkan_diskon_siswa).';

-- Normalisasi rentang ke batas bulan penuh SEBELUM constraint dievaluasi.
-- Semantik diskon adalah "bulan-bulan yang tercakup", bukan tanggal presisi:
-- tagihan dicocokkan lewat bulan periodenya. Tanpa normalisasi, rentang
-- 2026-07-15..2026-12-20 akan tampak tidak tumpang tindih dengan
-- 2026-12-21..2027-06-30 padahal keduanya mencakup Desember 2026.
CREATE OR REPLACE FUNCTION public.normalisasi_periode_siswa_diskon()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.periode_mulai   := date_trunc('month', NEW.periode_mulai)::date;
  NEW.periode_selesai := (date_trunc('month', NEW.periode_selesai)
                           + interval '1 month' - interval '1 day')::date;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_normalisasi_periode_siswa_diskon ON public.siswa_diskon;
CREATE TRIGGER trg_normalisasi_periode_siswa_diskon
  BEFORE INSERT OR UPDATE OF periode_mulai, periode_selesai ON public.siswa_diskon
  FOR EACH ROW EXECUTE FUNCTION public.normalisasi_periode_siswa_diskon();

-- Aturan eksklusivitas. Hanya berlaku untuk baris yang masih hidup:
-- pengajuan yang ditolak/dibatalkan tidak boleh memblokir pengajuan baru.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siswa_diskon_no_overlap'
      AND conrelid = 'public.siswa_diskon'::regclass
  ) THEN
    ALTER TABLE public.siswa_diskon
      ADD CONSTRAINT siswa_diskon_no_overlap
      EXCLUDE USING gist (
        siswa_id WITH =,
        jenis_id WITH =,
        daterange(periode_mulai, periode_selesai, '[]') WITH &&
      )
      WHERE (status IN ('diajukan', 'disetujui'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_siswa_diskon_siswa   ON public.siswa_diskon (siswa_id, jenis_id);
CREATE INDEX IF NOT EXISTS idx_siswa_diskon_status  ON public.siswa_diskon (status);

-- Potongan kakak-adik hanya sah kalau siswanya memang punya saudara yang juga
-- bersekolah di sini: minimal 2 orang dalam satu kelompok keluarga. Ditegakkan
-- di DB karena ini syarat kelayakan finansial -- kalau hanya dicek di UI, satu
-- pengajuan lewat jalur lain (import, patch manual, RPC baru) bisa memberi
-- potongan "anak ke-2" kepada anak tunggal tanpa ada yang menyadarinya.
CREATE OR REPLACE FUNCTION public.validasi_diskon_kakak_adik()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_kategori    text;
  v_keluarga_id uuid;
  v_saudara     integer;
BEGIN
  SELECT kategori INTO v_kategori FROM skema_diskon WHERE id = NEW.skema_diskon_id;

  IF v_kategori IS DISTINCT FROM 'kakak_adik' THEN
    RETURN NEW;
  END IF;

  SELECT keluarga_id INTO v_keluarga_id FROM siswa WHERE id = NEW.siswa_id;

  IF v_keluarga_id IS NULL THEN
    RAISE EXCEPTION
      'Potongan kakak-adik butuh siswa yang sudah dikelompokkan ke sebuah keluarga';
  END IF;

  SELECT count(*) INTO v_saudara FROM siswa WHERE keluarga_id = v_keluarga_id;

  IF v_saudara < 2 THEN
    RAISE EXCEPTION
      'Potongan kakak-adik hanya berlaku bila minimal 2 bersaudara terdaftar (keluarga ini: % siswa)',
      v_saudara;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validasi_diskon_kakak_adik ON public.siswa_diskon;
CREATE TRIGGER trg_validasi_diskon_kakak_adik
  BEFORE INSERT OR UPDATE OF siswa_id, skema_diskon_id ON public.siswa_diskon
  FOR EACH ROW EXECUTE FUNCTION public.validasi_diskon_kakak_adik();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.skema_diskon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siswa_diskon ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_skema_diskon" ON public.skema_diskon;
CREATE POLICY "auth_read_skema_diskon" ON public.skema_diskon
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_keuangan_manage_skema_diskon" ON public.skema_diskon;
CREATE POLICY "admin_keuangan_manage_skema_diskon" ON public.skema_diskon
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

-- Staf keuangan/admin mengelola pengajuan; sekretaris yayasan perlu membaca
-- semuanya untuk menyetujui (keputusannya sendiri lewat RPC, bukan UPDATE
-- langsung -- lihat migrasi 20260728140005).
DROP POLICY IF EXISTS "admin_keuangan_manage_siswa_diskon" ON public.siswa_diskon;
CREATE POLICY "admin_keuangan_manage_siswa_diskon" ON public.siswa_diskon
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

DROP POLICY IF EXISTS "penyetuju_read_siswa_diskon" ON public.siswa_diskon;
CREATE POLICY "penyetuju_read_siswa_diskon" ON public.siswa_diskon
  FOR SELECT TO authenticated USING (public.is_penyetuju_diskon(auth.uid()));

-- Orang tua & siswa berhak tahu keringanan yang melekat pada dirinya.
DROP POLICY IF EXISTS "siswa_read_own_siswa_diskon" ON public.siswa_diskon;
CREATE POLICY "siswa_read_own_siswa_diskon" ON public.siswa_diskon
  FOR SELECT TO authenticated USING (public.is_own_siswa(auth.uid(), siswa_id));

DROP POLICY IF EXISTS "ortu_read_siswa_diskon" ON public.siswa_diskon;
CREATE POLICY "ortu_read_siswa_diskon" ON public.siswa_diskon
  FOR SELECT TO authenticated USING (public.is_ortu_of(auth.uid(), siswa_id));

-- ── 4. Skema bawaan ─────────────────────────────────────────────────────────
-- nilai_default 0 = "belum ditentukan": nominal potongan kakak-adik berbeda
-- tiap yayasan dan bisa berubah tiap tahun, jadi tidak di-hardcode di migrasi.
-- Diisi lewat halaman Skema Diskon.
INSERT INTO public.skema_diskon (nama, kategori, tipe, nilai_default, perlu_approval, keterangan)
VALUES
  ('Potongan Anak ke-2',         'kakak_adik', 'nominal', 0, true,
   'Potongan rupiah tetap untuk anak kedua dalam satu keluarga.'),
  ('Potongan Anak ke-3 dst',     'kakak_adik', 'nominal', 0, true,
   'Potongan rupiah tetap untuk anak ketiga dan seterusnya.'),
  ('Keringanan Kurang Mampu',    'keringanan', 'nominal', 0, true,
   'Keringanan berdasarkan kondisi ekonomi keluarga. Lampirkan SKTM di dokumen_url.'),
  ('Beasiswa Prestasi',          'beasiswa',   'persen',  0, true,
   'Beasiswa atas prestasi akademik/non-akademik.'),
  ('Bantuan Yayasan',            'bantuan',    'nominal', 0, true,
   'Bantuan insidental dari yayasan atau donatur.')
ON CONFLICT (nama) DO NOTHING;
