-- Soft delete menyimpan baris lama (aktif=false) untuk histori. Karena itu
-- unique index tarif harus hanya berlaku untuk baris AKTIF; kalau tidak,
-- override baru dengan scope yang sama akan tertahan oleh baris histori lama.

DROP INDEX IF EXISTS public.uq_tarif_kombinasi;
DROP INDEX IF EXISTS public.uq_tarif_kombinasi_aktif;

CREATE UNIQUE INDEX uq_tarif_kombinasi_aktif
ON public.tarif_tagihan (
  jenis_id,
  COALESCE(siswa_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(kelas_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(tahun_ajaran_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE aktif = true;
