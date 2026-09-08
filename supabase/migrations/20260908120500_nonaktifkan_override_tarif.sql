-- Ubah perilaku "hapus tarif" menjadi nonaktifkan override (soft delete).
-- Tujuan:
-- 1) histori aturan tarif tetap tersimpan,
-- 2) tagihan/jurnal yang sudah terbentuk tidak pernah ikut terhapus,
-- 3) alasan + pelaku + waktu tercatat,
-- 4) hard DELETE dari aplikasi diblok; service_role tetap dapat dipakai untuk maintenance terkontrol.

ALTER TABLE public.tarif_tagihan
  ADD COLUMN IF NOT EXISTS dinonaktifkan_at timestamptz,
  ADD COLUMN IF NOT EXISTS dinonaktifkan_oleh uuid,
  ADD COLUMN IF NOT EXISTS dinonaktifkan_alasan text;

COMMENT ON COLUMN public.tarif_tagihan.dinonaktifkan_at IS
  'Waktu override tarif dinonaktifkan (soft delete).';
COMMENT ON COLUMN public.tarif_tagihan.dinonaktifkan_oleh IS
  'auth.uid() pengguna yang menonaktifkan override tarif.';
COMMENT ON COLUMN public.tarif_tagihan.dinonaktifkan_alasan IS
  'Alasan operasional penonaktifan override tarif.';

-- Trigger ini memastikan setiap transisi aktif=true -> false mempunyai metadata
-- dan otomatis masuk Audit Trail. Tahun Buku yang sudah ditutup tetap diblok oleh
-- trigger guard_tarif_tagihan_tahun_buku_locked yang sudah ada.
CREATE OR REPLACE FUNCTION public.prepare_nonaktif_override_tarif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nama_pengguna text;
  v_departemen_id uuid;
BEGIN
  IF OLD.aktif IS DISTINCT FROM false AND NEW.aktif = false THEN
    IF length(trim(COALESCE(NEW.dinonaktifkan_alasan, ''))) < 3 THEN
      RAISE EXCEPTION 'Alasan menonaktifkan override tarif wajib diisi (minimal 3 karakter)';
    END IF;

    NEW.dinonaktifkan_at := COALESCE(NEW.dinonaktifkan_at, now());
    NEW.dinonaktifkan_oleh := COALESCE(v_uid, NEW.dinonaktifkan_oleh);

    SELECT COALESCE(p.nama, up.email)
      INTO v_nama_pengguna
    FROM public.users_profile up
    LEFT JOIN public.pegawai p ON p.id = up.pegawai_id
    WHERE up.id = v_uid
    LIMIT 1;

    SELECT COALESCE(s.departemen_id, k.departemen_id, a.departemen_id, j.departemen_id)
      INTO v_departemen_id
    FROM public.jenis_pembayaran j
    LEFT JOIN public.siswa s ON s.id = NEW.siswa_id
    LEFT JOIN public.kelas k ON k.id = NEW.kelas_id
    LEFT JOIN public.angkatan a ON a.id = NEW.angkatan_id
    WHERE j.id = NEW.jenis_id
    LIMIT 1;

    INSERT INTO public.audit_keuangan (
      tabel_sumber,
      record_id,
      aksi,
      data_lama,
      data_baru,
      keterangan,
      departemen_id,
      dibuat_oleh,
      nama_pengguna
    ) VALUES (
      'tarif_tagihan',
      NEW.id::text,
      'UPDATE',
      jsonb_build_object(
        'aktif', OLD.aktif,
        'nominal', OLD.nominal,
        'keterangan', OLD.keterangan,
        'jenis_id', OLD.jenis_id,
        'siswa_id', OLD.siswa_id,
        'kelas_id', OLD.kelas_id,
        'angkatan_id', OLD.angkatan_id,
        'tahun_ajaran_id', OLD.tahun_ajaran_id
      ),
      jsonb_build_object(
        'aktif', false,
        'dinonaktifkan_at', NEW.dinonaktifkan_at,
        'dinonaktifkan_oleh', NEW.dinonaktifkan_oleh,
        'dinonaktifkan_alasan', trim(NEW.dinonaktifkan_alasan)
      ),
      'Nonaktifkan override tarif: ' || trim(NEW.dinonaktifkan_alasan),
      v_departemen_id,
      v_uid,
      v_nama_pengguna
    );
  ELSIF OLD.aktif = false AND NEW.aktif = true THEN
    RAISE EXCEPTION 'Override tarif yang sudah dinonaktifkan tidak dapat diaktifkan ulang. Buat override baru agar histori tetap jelas.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prepare_nonaktif_override_tarif_trg ON public.tarif_tagihan;
CREATE TRIGGER prepare_nonaktif_override_tarif_trg
BEFORE UPDATE OF aktif ON public.tarif_tagihan
FOR EACH ROW
EXECUTE FUNCTION public.prepare_nonaktif_override_tarif();

-- RPC resmi yang dipanggil UI. Seluruh perubahan + audit berada dalam satu transaksi.
CREATE OR REPLACE FUNCTION public.nonaktifkan_override_tarif(
  p_tarif_id uuid,
  p_alasan text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tarif public.tarif_tagihan%ROWTYPE;
  v_tagihan_terkait integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak ditemukan';
  END IF;

  IF NOT (public.is_admin_or_kepala(v_uid) OR public.has_role(v_uid, 'keuangan')) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses untuk menonaktifkan override tarif';
  END IF;

  IF length(trim(COALESCE(p_alasan, ''))) < 3 THEN
    RAISE EXCEPTION 'Alasan menonaktifkan override tarif wajib diisi (minimal 3 karakter)';
  END IF;

  SELECT *
    INTO v_tarif
  FROM public.tarif_tagihan
  WHERE id = p_tarif_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Override tarif tidak ditemukan';
  END IF;

  IF v_tarif.aktif = false THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_inactive', true,
      'tagihan_terkait', 0
    );
  END IF;

  -- Untuk override per siswa / kelas, hitung tagihan yang sudah ada pada scope
  -- yang sama sebagai informasi bagi petugas. Ini BUKAN daftar tagihan yang
  -- akan diubah: tidak ada tagihan atau jurnal yang disentuh oleh RPC ini.
  IF v_tarif.siswa_id IS NOT NULL THEN
    SELECT count(*)::integer INTO v_tagihan_terkait
    FROM public.tagihan t
    WHERE t.jenis_id = v_tarif.jenis_id
      AND t.siswa_id = v_tarif.siswa_id
      AND (v_tarif.tahun_ajaran_id IS NULL OR t.tahun_ajaran_id = v_tarif.tahun_ajaran_id);
  ELSIF v_tarif.kelas_id IS NOT NULL THEN
    SELECT count(*)::integer INTO v_tagihan_terkait
    FROM public.tagihan t
    WHERE t.jenis_id = v_tarif.jenis_id
      AND t.kelas_id = v_tarif.kelas_id
      AND (v_tarif.tahun_ajaran_id IS NULL OR t.tahun_ajaran_id = v_tarif.tahun_ajaran_id);
  END IF;

  UPDATE public.tarif_tagihan
  SET aktif = false,
      dinonaktifkan_alasan = trim(p_alasan),
      updated_at = now()
  WHERE id = p_tarif_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_inactive', false,
    'tagihan_terkait', v_tagihan_terkait
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.nonaktifkan_override_tarif(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nonaktifkan_override_tarif(uuid, text) TO authenticated, service_role;

-- Aplikasi tidak lagi boleh melakukan hard delete / truncate pada tarif.
-- service_role sengaja tidak dicabut untuk kebutuhan maintenance terkontrol.
REVOKE DELETE, TRUNCATE ON TABLE public.tarif_tagihan FROM anon, authenticated;

-- Ganti policy ALL lama dengan policy eksplisit tanpa DELETE.
DROP POLICY IF EXISTS admin_keuangan_manage_tarif ON public.tarif_tagihan;
DROP POLICY IF EXISTS admin_keuangan_insert_tarif ON public.tarif_tagihan;
DROP POLICY IF EXISTS admin_keuangan_update_tarif ON public.tarif_tagihan;

CREATE POLICY admin_keuangan_insert_tarif
ON public.tarif_tagihan
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

CREATE POLICY admin_keuangan_update_tarif
ON public.tarif_tagihan
FOR UPDATE TO authenticated
USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));
