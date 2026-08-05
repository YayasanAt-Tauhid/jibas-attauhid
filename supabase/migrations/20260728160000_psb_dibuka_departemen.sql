-- Tambah kolom psb_dibuka pada departemen agar admin bisa mengatur lembaga
-- mana saja yang membuka pendaftaran siswa baru (PSB) secara independen
-- dari flag aktif (yang dipakai luas oleh modul akademik lain).
ALTER TABLE public.departemen
  ADD COLUMN IF NOT EXISTS psb_dibuka boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.departemen.psb_dibuka IS
  'Menentukan apakah lembaga ini tampil sebagai opsi di form pendaftaran PSB publik (/psb)';
