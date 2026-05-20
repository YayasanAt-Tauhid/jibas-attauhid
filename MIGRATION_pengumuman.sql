-- ============================================================
-- MIGRATION: Buat tabel pengumuman untuk notifikasi bell
-- Jalankan di: Supabase Dashboard → SQL Editor
-- Proyek: Hijrah At-Tauhid v2 (leyfwwmroijwnkrcblxe)
-- Tanggal: 08 Mei 2026
-- ============================================================

-- 1. Buat tabel
CREATE TABLE IF NOT EXISTS public.pengumuman (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  judul                text         NOT NULL,
  konten               text,
  aktif                boolean      NOT NULL DEFAULT true,
  tanggal_mulai        date,
  tanggal_kadaluarsa   date,
  dibuat_oleh          uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

-- 2. Index untuk query notifikasi (aktif + kadaluarsa)
CREATE INDEX IF NOT EXISTS idx_pengumuman_aktif
  ON public.pengumuman (aktif, tanggal_kadaluarsa DESC);

-- 3. Aktifkan RLS
ALTER TABLE public.pengumuman ENABLE ROW LEVEL SECURITY;

-- 4. Policy: semua user yang login bisa baca pengumuman aktif
CREATE POLICY "pengumuman_select_authenticated"
  ON public.pengumuman
  FOR SELECT
  TO authenticated
  USING (aktif = true);

-- 5. Policy: admin bisa kelola semua pengumuman
CREATE POLICY "pengumuman_all_admin"
  ON public.pengumuman
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE users_profile.id = auth.uid()
        AND users_profile.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE users_profile.id = auth.uid()
        AND users_profile.role = 'admin'
    )
  );

-- 6. Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pengumuman_updated_at
  BEFORE UPDATE ON public.pengumuman
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Seed: 1 pengumuman sambutan supaya bell langsung ada isinya
INSERT INTO public.pengumuman (judul, konten, aktif, tanggal_kadaluarsa)
VALUES (
  'Selamat datang di Sistem Informasi Sekolah',
  'Sistem telah diperbarui. Silakan hubungi admin jika ada pertanyaan atau kendala teknis.',
  true,
  (CURRENT_DATE + INTERVAL '30 days')::date
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SELESAI — cek hasil:
-- SELECT * FROM public.pengumuman;
-- ============================================================
