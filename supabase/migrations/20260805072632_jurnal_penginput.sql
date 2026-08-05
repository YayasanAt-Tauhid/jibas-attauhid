-- Menampilkan siapa yang menginput jurnal umum:
-- 1. Izinkan role 'keuangan' membaca tabel pegawai (untuk join nama penginput),
--    sejalan dengan pola akses jurnal yang sudah memakai is_admin_or_kepala() OR has_role(keuangan).
-- 2. Backfill jurnal.dibuat_oleh (kosong sejak awal karena tidak pernah diisi saat insert)
--    dari log audit_keuangan yang sudah mencatat siapa membuat tiap jurnal.

CREATE POLICY "keuangan_pegawai_select" ON public.pegawai
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'keuangan'));

WITH pembuat AS (
  SELECT DISTINCT ON (ak.record_id)
    ak.record_id::uuid AS jurnal_id,
    up.pegawai_id
  FROM public.audit_keuangan ak
  JOIN public.users_profile up ON up.id = ak.dibuat_oleh
  WHERE ak.tabel_sumber = 'jurnal'
    AND ak.aksi = 'CREATE'
    AND up.pegawai_id IS NOT NULL
  ORDER BY ak.record_id, ak.created_at ASC
)
UPDATE public.jurnal j
SET dibuat_oleh = pembuat.pegawai_id
FROM pembuat
WHERE j.id = pembuat.jurnal_id
  AND j.dibuat_oleh IS NULL;
