-- Menghapus overload lama get_tarif_siswa (4 parameter) yang bentrok dengan
-- versi 5 parameter (dengan p_angkatan_id) sehingga PostgREST/Postgres gagal
-- memilih fungsi yang tepat saat dipanggil hanya dengan 4 named arguments.
DROP FUNCTION IF EXISTS public.get_tarif_siswa(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_tarif_siswa(
  p_jenis_id uuid,
  p_siswa_id uuid,
  p_kelas_id uuid DEFAULT NULL::uuid,
  p_tahun_ajaran_id uuid DEFAULT NULL::uuid,
  p_angkatan_id uuid DEFAULT NULL::uuid
)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- siswa + kelas + tahun ajaran
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- siswa + tahun ajaran
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- siswa saja
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id IS NULL AND aktif = true
     LIMIT 1),
    -- kelas + tahun ajaran
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- kelas saja
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id IS NULL AND aktif = true
     LIMIT 1),
    -- angkatan + tahun ajaran
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id = p_angkatan_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- angkatan saja
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id = p_angkatan_id AND tahun_ajaran_id IS NULL AND aktif = true
     LIMIT 1),
    -- tahun ajaran saja (default umum)
    (SELECT nominal FROM tarif_tagihan
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND angkatan_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1)
  )
$function$;
