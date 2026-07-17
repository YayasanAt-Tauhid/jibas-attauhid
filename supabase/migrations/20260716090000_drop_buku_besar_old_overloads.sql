-- Hapus overload lama buku_besar_mutasi/buku_besar_saldo_awal (tanpa
-- p_exclude_koreksi) yang tertinggal setelah migrasi 20260715080000 —
-- CREATE OR REPLACE dengan daftar argumen berbeda membuat fungsi baru,
-- bukan mengganti. Dua overload dengan argumen default membuat panggilan
-- PostgREST yang tidak menyertakan p_exclude_koreksi ambigu (PGRST203),
-- pola bug yang sama dengan get_tarif_siswa dulu.

DROP FUNCTION IF EXISTS public.buku_besar_mutasi(uuid, date, date, uuid[], boolean);
DROP FUNCTION IF EXISTS public.buku_besar_saldo_awal(uuid, date, uuid[]);
