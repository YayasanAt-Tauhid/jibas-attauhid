-- Revisi desain: jenis pembayaran yang "cuma berlaku untuk beberapa tahun"
-- ternyata bukan soal ANGKATAN, tapi soal TAHUN MASUK siswa ke JENJANG
-- (departemen) yang ditempatinya SEKARANG.
--
-- Contoh nyata yang jadi acuan:
--   - Siswa pindahan yang langsung masuk kelas 5 SD tetap mengikuti tarif
--     "kelas 1" karena tahun masuknya ke SD, meski dia tidak pernah duduk
--     di kelas 1-4 di sekolah ini.
--   - Siswa yang naik dari kelas 6 SD ke kelas 7 SMP mengikuti TAHUN DIA
--     MASUK SMP (bukan tahun dia dulu masuk SD) -- "tahun masuk" berubah
--     tiap kali siswa pindah jenjang/departemen.
--
-- Karena itu TIDAK bisa berupa field statis di profil siswa (gampang lupa
-- di-update saat siswa naik jenjang) -- harus dihitung OTOMATIS dari
-- riwayat kelas_siswa: tahun ajaran PALING AWAL siswa tercatat di kelas
-- manapun yang termasuk departemen (jenjang) yang ditempatinya SEKARANG.
--
-- Migrasi ini menggantikan pendekatan "scoping per angkatan"
-- (jenis_pembayaran_angkatan, lihat 20260715070028) yang salah kaprah.

DROP TABLE IF EXISTS public.jenis_pembayaran_angkatan;

ALTER TABLE public.jenis_pembayaran
  ADD COLUMN IF NOT EXISTS tahun_masuk_dari integer,
  ADD COLUMN IF NOT EXISTS tahun_masuk_sampai integer;

-- Tahun (kalender/akademik) siswa pertama kali tercatat di kelas manapun
-- pada departemen yang ditempatinya SEKARANG (siswa.departemen_id). Kalau
-- tidak ada riwayat kelas_siswa yang cocok (data legacy bolong), return
-- NULL -- jenis pembayaran yang di-scope tahun masuk akan SKIP siswa
-- tersebut saat generate (aman: tidak asal generate dengan tarif yang belum
-- tentu benar, bukan salah generate).
CREATE OR REPLACE FUNCTION public.get_siswa_tahun_masuk(p_siswa_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT extract(year from ta.tanggal_mulai)::integer
  FROM kelas_siswa ks
  JOIN kelas k ON k.id = ks.kelas_id
  JOIN tahun_ajaran ta ON ta.id = ks.tahun_ajaran_id
  JOIN siswa s ON s.id = p_siswa_id
  WHERE ks.siswa_id = p_siswa_id
    AND k.departemen_id = s.departemen_id
    AND ta.tanggal_mulai IS NOT NULL
  ORDER BY ta.tanggal_mulai ASC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.generate_tagihan_batch(p_jenis_id uuid, p_tahun_ajaran_id uuid, p_bulan integer, p_departemen_id uuid, p_siswa_list jsonb, p_created_by uuid)
 RETURNS TABLE(generated integer, skipped integer, errors text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jenis record;
  v_piutang_akun_id uuid;
  v_tahun_sekarang integer := extract(year from now());
  v_tanggal date := current_date;
  v_row record;
  v_nominal numeric;
  v_jurnal_id uuid;
  v_nomor text;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_errors text[] := '{}';
  v_bulan_label text;
  v_dept_id uuid;
  v_angkatan_id uuid;
  v_tahun_masuk integer;
BEGIN
  SELECT id, nama, nominal, akun_pendapatan_id, tahun_masuk_dari, tahun_masuk_sampai
  INTO v_jenis
  FROM jenis_pembayaran WHERE id = p_jenis_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jenis pembayaran tidak ditemukan';
  END IF;

  IF v_jenis.akun_pendapatan_id IS NULL THEN
    RAISE EXCEPTION 'Akun pendapatan belum diset untuk jenis "%"', v_jenis.nama;
  END IF;

  SELECT akun_id INTO v_piutang_akun_id
  FROM pengaturan_akun WHERE kode_setting = 'piutang_siswa';

  IF v_piutang_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun piutang siswa belum dikonfigurasi di Pengaturan Akun';
  END IF;

  v_bulan_label := CASE WHEN p_bulan IS NOT NULL THEN '-B' || p_bulan ELSE '' END;

  FOR v_row IN SELECT * FROM jsonb_to_recordset(p_siswa_list) AS x(siswa_id uuid, kelas_id uuid)
  LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM tagihan
        WHERE siswa_id = v_row.siswa_id
          AND jenis_id = p_jenis_id
          AND tahun_ajaran_id = p_tahun_ajaran_id
          AND (bulan IS NOT DISTINCT FROM p_bulan)
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Dipakai untuk tier "angkatan" di get_tarif_siswa (override nominal
      -- per angkatan di tarif_tagihan) -- fix bug lama yang selalu kirim NULL.
      SELECT angkatan_id INTO v_angkatan_id FROM siswa WHERE id = v_row.siswa_id;

      -- Scoping tahun masuk: kalau jenis ini punya batas tahun_masuk_dari
      -- dan/atau tahun_masuk_sampai, siswa yang tahun masuknya di luar
      -- rentang (atau tidak bisa ditentukan sama sekali) di-skip.
      IF v_jenis.tahun_masuk_dari IS NOT NULL OR v_jenis.tahun_masuk_sampai IS NOT NULL THEN
        v_tahun_masuk := get_siswa_tahun_masuk(v_row.siswa_id);
        IF v_tahun_masuk IS NULL
           OR (v_jenis.tahun_masuk_dari IS NOT NULL AND v_tahun_masuk < v_jenis.tahun_masuk_dari)
           OR (v_jenis.tahun_masuk_sampai IS NOT NULL AND v_tahun_masuk > v_jenis.tahun_masuk_sampai)
        THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      END IF;

      v_nominal := COALESCE(
        get_tarif_siswa(p_jenis_id, v_row.siswa_id, v_row.kelas_id, p_tahun_ajaran_id, v_angkatan_id),
        v_jenis.nominal,
        0
      );

      IF v_nominal <= 0 THEN
        CONTINUE;
      END IF;

      -- Tentukan departemen per-siswa: parameter eksplisit > kelas siswa > data siswa
      v_dept_id := p_departemen_id;
      IF v_dept_id IS NULL AND v_row.kelas_id IS NOT NULL THEN
        SELECT departemen_id INTO v_dept_id FROM kelas WHERE id = v_row.kelas_id;
      END IF;
      IF v_dept_id IS NULL THEN
        SELECT departemen_id INTO v_dept_id FROM siswa WHERE id = v_row.siswa_id;
      END IF;

      v_nomor := generate_nomor_jurnal('JPI', v_tahun_sekarang);

      INSERT INTO jurnal (nomor, tanggal, keterangan, departemen_id, total_debit, total_kredit, status)
      VALUES (
        v_nomor, v_tanggal,
        'Piutang ' || v_jenis.nama || v_bulan_label || ' - siswa ' || v_row.siswa_id,
        v_dept_id, v_nominal, v_nominal, 'posted'
      )
      RETURNING id INTO v_jurnal_id;

      INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
      VALUES
        (v_jurnal_id, v_piutang_akun_id, 'Piutang ' || v_jenis.nama, v_nominal, 0, 1),
        (v_jurnal_id, v_jenis.akun_pendapatan_id, 'Pendapatan ' || v_jenis.nama, 0, v_nominal, 2);

      INSERT INTO tagihan (siswa_id, jenis_id, tahun_ajaran_id, kelas_id, bulan, nominal, status, jurnal_piutang_id, created_by)
      VALUES (v_row.siswa_id, p_jenis_id, p_tahun_ajaran_id, v_row.kelas_id, p_bulan, v_nominal, 'belum_bayar', v_jurnal_id, p_created_by)
      ON CONFLICT (siswa_id, jenis_id, tahun_ajaran_id, (COALESCE(bulan, 0))) DO NOTHING;

      IF FOUND THEN
        v_generated := v_generated + 1;
      ELSE
        DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
        DELETE FROM jurnal WHERE id = v_jurnal_id;
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || (('Siswa ' || v_row.siswa_id || ': ' || SQLERRM));
    END;
  END LOOP;

  RETURN QUERY SELECT v_generated, v_skipped, v_errors;
END;
$function$;
