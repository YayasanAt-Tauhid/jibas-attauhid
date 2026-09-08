-- Izinkan alur massal menggunakan tarif efektif/default tanpa membuat override
-- per-siswa yang redundant. p_tarif_rows tetap wajib berupa array, tetapi boleh
-- kosong. Generate seluruh kelompok Tahun Buku/bulan tetap berjalan dalam satu
-- transaksi; bila satu bulan gagal, seluruh call rollback.

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

  IF p_tarif_rows IS NULL OR jsonb_typeof(p_tarif_rows) <> 'array' THEN
    RAISE EXCEPTION 'Format daftar tarif tidak valid';
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

  -- Pemilihan siswa eksplisit tetap divalidasi terhadap scope tahun masuk
  -- walaupun tidak ada override baru yang dibuat.
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

  -- Boleh kosong: untuk siswa yang memakai tarif efektif/default, tidak perlu
  -- membuat baris override per-siswa. Bila ada baris, trigger validasi tahun
  -- masuk dan lock Tahun Buku tetap berlaku seperti sebelumnya.
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
