-- Perbaikan alur Tarif Tagihan:
-- 1) Tahun masuk siswa tetap bersifat PER JENJANG/departemen (bukan Angkatan global),
--    namun sediakan override eksplisit untuk data legacy yang riwayat kelasnya bolong.
-- 2) Tarif per-siswa divalidasi terhadap scope tahun masuk SEBELUM tersimpan.
-- 3) Sediakan RPC atomik untuk menyimpan tarif + generate tagihan dalam SATU transaksi.
--    Bila generate gagal, seluruh insert tarif/tagihan/jurnal di-call tersebut rollback.

CREATE TABLE IF NOT EXISTS public.siswa_tahun_masuk_departemen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
  departemen_id uuid NOT NULL REFERENCES public.departemen(id) ON DELETE CASCADE,
  tahun_masuk integer NOT NULL CHECK (tahun_masuk BETWEEN 1900 AND 2200),
  sumber text NOT NULL DEFAULT 'manual',
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siswa_id, departemen_id)
);

ALTER TABLE public.siswa_tahun_masuk_departemen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS siswa_tahun_masuk_departemen_read ON public.siswa_tahun_masuk_departemen;
CREATE POLICY siswa_tahun_masuk_departemen_read
ON public.siswa_tahun_masuk_departemen
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS siswa_tahun_masuk_departemen_manage ON public.siswa_tahun_masuk_departemen;
CREATE POLICY siswa_tahun_masuk_departemen_manage
ON public.siswa_tahun_masuk_departemen
FOR ALL TO authenticated
USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.siswa_tahun_masuk_departemen TO authenticated;

DROP TRIGGER IF EXISTS set_siswa_tahun_masuk_departemen_updated_at ON public.siswa_tahun_masuk_departemen;
CREATE TRIGGER set_siswa_tahun_masuk_departemen_updated_at
BEFORE UPDATE ON public.siswa_tahun_masuk_departemen
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tahun masuk yang benar adalah tahun masuk ke JENJANG/departemen siswa saat ini.
-- Sumber utama tetap riwayat kelas_siswa. Override hanya dipakai bila petugas
-- memang sudah memverifikasi data legacy yang riwayat kelasnya tidak lengkap.
CREATE OR REPLACE FUNCTION public.get_siswa_tahun_masuk(p_siswa_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_departemen_id uuid;
  v_tahun integer;
BEGIN
  SELECT departemen_id INTO v_departemen_id
  FROM public.siswa
  WHERE id = p_siswa_id;

  IF v_departemen_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.tahun_masuk INTO v_tahun
  FROM public.siswa_tahun_masuk_departemen o
  WHERE o.siswa_id = p_siswa_id
    AND o.departemen_id = v_departemen_id
  LIMIT 1;

  IF v_tahun IS NOT NULL THEN
    RETURN v_tahun;
  END IF;

  SELECT extract(year from ta.tanggal_mulai)::integer INTO v_tahun
  FROM public.kelas_siswa ks
  JOIN public.kelas k ON k.id = ks.kelas_id
  JOIN public.tahun_ajaran ta ON ta.id = ks.tahun_ajaran_id
  WHERE ks.siswa_id = p_siswa_id
    AND k.departemen_id = v_departemen_id
    AND ta.tanggal_mulai IS NOT NULL
  ORDER BY ta.tanggal_mulai ASC
  LIMIT 1;

  RETURN v_tahun;
END;
$function$;

-- Jangan biarkan tarif per-siswa tersimpan bila dari awal sudah pasti tidak
-- memenuhi scope Tahun Masuk pada jenis pembayaran. Ini mencegah kondisi
-- "tarif tersimpan tetapi generate tagihan di-skip" untuk kesalahan validasi.
CREATE OR REPLACE FUNCTION public.validasi_tarif_siswa_tahun_masuk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jenis record;
  v_siswa record;
  v_tahun_masuk integer;
BEGIN
  IF NEW.siswa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nama, tahun_masuk_dari, tahun_masuk_sampai
  INTO v_jenis
  FROM public.jenis_pembayaran
  WHERE id = NEW.jenis_id;

  IF v_jenis.tahun_masuk_dari IS NULL AND v_jenis.tahun_masuk_sampai IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nama, nis INTO v_siswa
  FROM public.siswa
  WHERE id = NEW.siswa_id;

  v_tahun_masuk := public.get_siswa_tahun_masuk(NEW.siswa_id);

  IF v_tahun_masuk IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Tarif tidak disimpan: tahun masuk %s (%s) ke jenjang saat ini belum dapat ditentukan. Lengkapi riwayat kelas atau override tahun masuk terlebih dahulu.',
        COALESCE(v_siswa.nama, NEW.siswa_id::text), COALESCE(v_siswa.nis, '-')
      );
  END IF;

  IF (v_jenis.tahun_masuk_dari IS NOT NULL AND v_tahun_masuk < v_jenis.tahun_masuk_dari)
     OR (v_jenis.tahun_masuk_sampai IS NOT NULL AND v_tahun_masuk > v_jenis.tahun_masuk_sampai)
  THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Tarif tidak disimpan: %s (%s) memiliki tahun masuk jenjang %s, sedangkan "%s" hanya berlaku untuk tahun masuk %s%s%s.',
        COALESCE(v_siswa.nama, NEW.siswa_id::text),
        COALESCE(v_siswa.nis, '-'),
        v_tahun_masuk,
        v_jenis.nama,
        COALESCE(v_jenis.tahun_masuk_dari::text, '...'),
        CASE WHEN v_jenis.tahun_masuk_dari IS NOT NULL AND v_jenis.tahun_masuk_sampai IS NOT NULL THEN '–' ELSE '' END,
        COALESCE(v_jenis.tahun_masuk_sampai::text, '...')
      );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validasi_tarif_siswa_tahun_masuk_trg ON public.tarif_tagihan;
CREATE TRIGGER validasi_tarif_siswa_tahun_masuk_trg
BEFORE INSERT OR UPDATE OF jenis_id, siswa_id ON public.tarif_tagihan
FOR EACH ROW EXECUTE FUNCTION public.validasi_tarif_siswa_tahun_masuk();

-- RPC satu transaksi: insert tarif + generate seluruh bulan yang dipilih.
-- p_tarif_rows berisi baris yang memang belum ada.
-- p_generate_groups contoh:
--   [{"tahun_buku_id":"...","bulan_list":[7,8,9,10,11,12]},
--    {"tahun_buku_id":"...","bulan_list":[1,2,3,4,5,6]}]
-- Untuk pembayaran sekali pakai bulan_list:[null].
CREATE OR REPLACE FUNCTION public.simpan_tarif_dan_generate_atomik(
  p_tarif_rows jsonb,
  p_tahun_akademik_id uuid,
  p_jenis_id uuid,
  p_generate_groups jsonb,
  p_departemen_id uuid DEFAULT NULL,
  p_siswa_ids uuid[] DEFAULT NULL,
  p_siswa_id uuid DEFAULT NULL,
  p_kelas_id uuid DEFAULT NULL,
  p_angkatan_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_jenis record;
  v_siswa_list jsonb := '[]'::jsonb;
  v_explicit_ids uuid[] := ARRAY[]::uuid[];
  v_s record;
  v_group record;
  v_month_json jsonb;
  v_bulan integer;
  v_result record;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_scheduled integer := 0;
  v_inserted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak ditemukan';
  END IF;

  IF NOT (public.is_admin_or_kepala(v_uid) OR public.has_role(v_uid, 'keuangan')) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses untuk membuat tarif/tagihan';
  END IF;

  IF p_tarif_rows IS NULL OR jsonb_typeof(p_tarif_rows) <> 'array' OR jsonb_array_length(p_tarif_rows) = 0 THEN
    RAISE EXCEPTION 'Tidak ada tarif baru yang akan disimpan';
  END IF;

  IF p_generate_groups IS NULL OR jsonb_typeof(p_generate_groups) <> 'array' OR jsonb_array_length(p_generate_groups) = 0 THEN
    RAISE EXCEPTION 'Periode/bulan generate tagihan belum dipilih';
  END IF;

  SELECT id, nama, tahun_masuk_dari, tahun_masuk_sampai
  INTO v_jenis
  FROM public.jenis_pembayaran
  WHERE id = p_jenis_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jenis pembayaran tidak ditemukan';
  END IF;

  -- Bangun daftar siswa + kelas pada Tahun Ajaran akademik yang dipilih.
  IF p_siswa_ids IS NOT NULL AND cardinality(p_siswa_ids) > 0 THEN
    v_explicit_ids := p_siswa_ids;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('siswa_id', q.siswa_id, 'kelas_id', q.kelas_id)), '[]'::jsonb)
    INTO v_siswa_list
    FROM (
      SELECT sid AS siswa_id,
             (
               SELECT ks.kelas_id
               FROM public.kelas_siswa ks
               WHERE ks.siswa_id = sid
                 AND ks.tahun_ajaran_id = p_tahun_akademik_id
                 AND ks.aktif = true
               LIMIT 1
             ) AS kelas_id
      FROM unnest(p_siswa_ids) sid
    ) q;
  ELSIF p_siswa_id IS NOT NULL THEN
    v_explicit_ids := ARRAY[p_siswa_id];
    SELECT jsonb_build_array(jsonb_build_object(
      'siswa_id', p_siswa_id,
      'kelas_id', COALESCE(
        p_kelas_id,
        (
          SELECT ks.kelas_id
          FROM public.kelas_siswa ks
          WHERE ks.siswa_id = p_siswa_id
            AND ks.tahun_ajaran_id = p_tahun_akademik_id
            AND ks.aktif = true
          LIMIT 1
        )
      )
    )) INTO v_siswa_list;
  ELSIF p_kelas_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('siswa_id', ks.siswa_id, 'kelas_id', ks.kelas_id)), '[]'::jsonb)
    INTO v_siswa_list
    FROM public.kelas_siswa ks
    WHERE ks.kelas_id = p_kelas_id
      AND ks.tahun_ajaran_id = p_tahun_akademik_id
      AND ks.aktif = true;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('siswa_id', q.siswa_id, 'kelas_id', q.kelas_id)), '[]'::jsonb)
    INTO v_siswa_list
    FROM (
      SELECT DISTINCT ON (ks.siswa_id) ks.siswa_id, ks.kelas_id
      FROM public.kelas_siswa ks
      JOIN public.kelas k ON k.id = ks.kelas_id
      JOIN public.siswa s ON s.id = ks.siswa_id
      WHERE ks.tahun_ajaran_id = p_tahun_akademik_id
        AND ks.aktif = true
        AND (p_departemen_id IS NULL OR k.departemen_id = p_departemen_id)
        AND (p_angkatan_id IS NULL OR s.angkatan_id = p_angkatan_id)
      ORDER BY ks.siswa_id
    ) q;
  END IF;

  IF jsonb_array_length(v_siswa_list) = 0 THEN
    RAISE EXCEPTION 'Tidak ada siswa yang cocok dengan kriteria generate';
  END IF;

  -- Untuk pemilihan siswa eksplisit, validasi scope sebelum satu pun tarif
  -- disimpan. Ini memberi error yang jelas, bukan silent skip.
  IF cardinality(v_explicit_ids) > 0
     AND (v_jenis.tahun_masuk_dari IS NOT NULL OR v_jenis.tahun_masuk_sampai IS NOT NULL)
  THEN
    FOR v_s IN
      SELECT s.id, s.nama, s.nis, public.get_siswa_tahun_masuk(s.id) AS tahun_masuk
      FROM public.siswa s
      WHERE s.id = ANY(v_explicit_ids)
    LOOP
      IF v_s.tahun_masuk IS NULL THEN
        RAISE EXCEPTION 'Generate dibatalkan: tahun masuk % (%) ke jenjang saat ini belum dapat ditentukan',
          v_s.nama, COALESCE(v_s.nis, '-');
      END IF;

      IF (v_jenis.tahun_masuk_dari IS NOT NULL AND v_s.tahun_masuk < v_jenis.tahun_masuk_dari)
         OR (v_jenis.tahun_masuk_sampai IS NOT NULL AND v_s.tahun_masuk > v_jenis.tahun_masuk_sampai)
      THEN
        RAISE EXCEPTION 'Generate dibatalkan: % (%) tahun masuk %, sedangkan "%" berlaku untuk % sampai %',
          v_s.nama,
          COALESCE(v_s.nis, '-'),
          v_s.tahun_masuk,
          v_jenis.nama,
          COALESCE(v_jenis.tahun_masuk_dari::text, '...'),
          COALESCE(v_jenis.tahun_masuk_sampai::text, '...');
      END IF;
    END LOOP;
  END IF;

  -- Insert tarif. Trigger validasi tahun masuk + trigger lock Tahun Buku tetap
  -- ikut berjalan di sini. Bila salah satu baris gagal, seluruh transaksi rollback.
  INSERT INTO public.tarif_tagihan (
    jenis_id, siswa_id, kelas_id, angkatan_id, tahun_ajaran_id,
    nominal, keterangan
  )
  SELECT
    x.jenis_id, x.siswa_id, x.kelas_id, x.angkatan_id, x.tahun_ajaran_id,
    x.nominal, NULLIF(x.keterangan, '')
  FROM jsonb_to_recordset(p_tarif_rows) AS x(
    jenis_id uuid,
    siswa_id uuid,
    kelas_id uuid,
    angkatan_id uuid,
    tahun_ajaran_id uuid,
    nominal numeric,
    keterangan text
  )
  WHERE x.jenis_id = p_jenis_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted <> jsonb_array_length(p_tarif_rows) THEN
    RAISE EXCEPTION 'Sebagian tarif memiliki jenis pembayaran yang tidak sesuai';
  END IF;

  -- Generate seluruh Tahun Buku/bulan dalam transaksi yang sama.
  FOR v_group IN
    SELECT * FROM jsonb_to_recordset(p_generate_groups) AS g(tahun_buku_id uuid, bulan_list jsonb)
  LOOP
    IF v_group.tahun_buku_id IS NULL OR v_group.bulan_list IS NULL
       OR jsonb_typeof(v_group.bulan_list) <> 'array'
       OR jsonb_array_length(v_group.bulan_list) = 0
    THEN
      RAISE EXCEPTION 'Konfigurasi periode generate tidak lengkap';
    END IF;

    FOR v_month_json IN SELECT value FROM jsonb_array_elements(v_group.bulan_list)
    LOOP
      v_bulan := CASE
        WHEN v_month_json = 'null'::jsonb THEN NULL
        ELSE (v_month_json #>> '{}')::integer
      END;

      SELECT r.generated, r.skipped, r.scheduled, r.errors
      INTO v_result
      FROM public.generate_tagihan_batch(
        p_jenis_id,
        v_group.tahun_buku_id,
        v_bulan,
        p_departemen_id,
        v_siswa_list,
        v_uid
      ) r;

      IF v_result.errors IS NOT NULL AND cardinality(v_result.errors) > 0 THEN
        RAISE EXCEPTION 'Generate tagihan gagal (bulan %): %', COALESCE(v_bulan::text, '-'), v_result.errors[1];
      END IF;

      v_generated := v_generated + COALESCE(v_result.generated, 0);
      v_skipped := v_skipped + COALESCE(v_result.skipped, 0);
      v_scheduled := v_scheduled + COALESCE(v_result.scheduled, 0);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'tarif_inserted', v_inserted,
    'generated', v_generated,
    'skipped', v_skipped,
    'scheduled', v_scheduled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.simpan_tarif_dan_generate_atomik(
  jsonb, uuid, uuid, jsonb, uuid, uuid[], uuid, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.simpan_tarif_dan_generate_atomik(
  jsonb, uuid, uuid, jsonb, uuid, uuid[], uuid, uuid, uuid
) TO authenticated, service_role;
