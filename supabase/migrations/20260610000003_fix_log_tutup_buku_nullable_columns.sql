-- Buat tahun_ajaran_id dan user_id nullable
-- tahun_ajaran_id tidak lagi dipakai (diganti tahun_buku_id)
-- user_id bisa null jika tutup buku dilakukan via script/admin
ALTER TABLE log_tutup_buku ALTER COLUMN tahun_ajaran_id DROP NOT NULL;
ALTER TABLE log_tutup_buku ALTER COLUMN user_id DROP NOT NULL;
