-- Cegah duplikat jurnal migrasi dari jbsfina
ALTER TABLE jurnal ADD CONSTRAINT jurnal_referensi_unique UNIQUE (referensi);
