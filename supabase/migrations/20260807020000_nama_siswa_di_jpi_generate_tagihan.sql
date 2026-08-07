-- ─────────────────────────────────────────────────────────────────────────────
-- Cantumkan nama siswa (bukan UUID mentah) di keterangan jurnal piutang (JPI)
-- yang dibuat oleh generate_tagihan_batch untuk tagihan yang sudah jatuh tempo.
--
-- Bug: keterangan jurnal JPI berbunyi
--   "Piutang SPP TK-B7 - siswa d471ffbb-9b1d-4474-9a6d-dfdc661817cb"
-- karena baris ini langsung menempelkan v_row.siswa_id (uuid) alih-alih nama
-- siswanya. RPC sebelahnya, posting_piutang_jatuh_tempo (migrasi
-- 20260728100002), sudah benar meng-resolve ke nama siswa -- generate_tagihan_batch
-- (dipakai saat tagihan langsung jatuh tempo, bukan lewat penjadwal akrual)
-- yang terlewat.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_tagihan_batch(
  p_jenis_id uuid,
  p_tahun_ajaran_id uuid,
  p_bulan integer,
  p_departemen_id uuid,
  p_siswa_list jsonb,
  p_created_by uuid
)
 RETURNS TABLE(generated integer, skipped integer, scheduled integer, errors text[])
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
  v_scheduled integer := 0;
  v_errors text[] := '{}';
  v_bulan_label text;
  v_dept_id uuid;
  v_angkatan_id uuid;
  v_tahun_masuk integer;
  v_jatuh_tempo date;
  v_belum_jatuh_tempo boolean;
  v_status text;
  v_nama_siswa text;
BEGIN
  SELECT id, nama, nominal, akun_pendapatan_id, tahun_masuk_dari, tahun_masuk_sampai,
         hari_jatuh_tempo
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

  -- Jatuh tempo hanya bergantung pada periode + bulan + jenis, jadi cukup
  -- dihitung sekali untuk seluruh batch (satu panggilan = satu bulan).
  v_jatuh_tempo := hitung_jatuh_tempo_tagihan(
    p_tahun_ajaran_id, p_bulan, v_jenis.hari_jatuh_tempo
  );
  -- Periode tanpa tanggal_mulai -> jatuh tempo tak bisa dihitung. Jangan
  -- diperlakukan sebagai "belum jatuh tempo" (tagihan bisa menggantung selamanya
  -- tanpa pernah jadi piutang); pakai perilaku lama = langsung diakui.
  v_belum_jatuh_tempo := v_jatuh_tempo IS NOT NULL AND v_jatuh_tempo > v_tanggal;
  v_status := CASE WHEN v_belum_jatuh_tempo THEN 'terjadwal' ELSE 'belum_bayar' END;

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
      -- Nama siswa diambil sekaligus di sini untuk keterangan jurnal JPI.
      SELECT angkatan_id, nama INTO v_angkatan_id, v_nama_siswa FROM siswa WHERE id = v_row.siswa_id;

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

      -- Tagihan periode mendatang: jadwal saja, belum ada jurnal.
      IF v_belum_jatuh_tempo THEN
        v_jurnal_id := NULL;
      ELSE
        v_nomor := generate_nomor_jurnal('JPI', v_tahun_sekarang);

        INSERT INTO jurnal (nomor, tanggal, keterangan, departemen_id, total_debit, total_kredit, status)
        VALUES (
          v_nomor, v_tanggal,
          'Piutang ' || v_jenis.nama || v_bulan_label || ' - ' || COALESCE(v_nama_siswa, v_row.siswa_id::text),
          v_dept_id, v_nominal, v_nominal, 'posted'
        )
        RETURNING id INTO v_jurnal_id;

        INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
        VALUES
          (v_jurnal_id, v_piutang_akun_id, 'Piutang ' || v_jenis.nama, v_nominal, 0, 1),
          (v_jurnal_id, v_jenis.akun_pendapatan_id, 'Pendapatan ' || v_jenis.nama, 0, v_nominal, 2);
      END IF;

      INSERT INTO tagihan (siswa_id, jenis_id, tahun_ajaran_id, kelas_id, bulan, nominal, status, jatuh_tempo, jurnal_piutang_id, created_by)
      VALUES (v_row.siswa_id, p_jenis_id, p_tahun_ajaran_id, v_row.kelas_id, p_bulan, v_nominal, v_status, v_jatuh_tempo, v_jurnal_id, p_created_by)
      ON CONFLICT (siswa_id, jenis_id, tahun_ajaran_id, (COALESCE(bulan, 0))) DO NOTHING;

      IF FOUND THEN
        v_generated := v_generated + 1;
        IF v_belum_jatuh_tempo THEN
          v_scheduled := v_scheduled + 1;
        END IF;
      ELSE
        -- Baris tagihan kalah balapan dengan proses lain: buang jurnal yang
        -- terlanjur dibuat (kalau memang ada) supaya tidak jadi jurnal yatim.
        IF v_jurnal_id IS NOT NULL THEN
          DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
          DELETE FROM jurnal WHERE id = v_jurnal_id;
        END IF;
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || (('Siswa ' || v_row.siswa_id || ': ' || SQLERRM));
    END;
  END LOOP;

  RETURN QUERY SELECT v_generated, v_skipped, v_scheduled, v_errors;
END;
$function$;
