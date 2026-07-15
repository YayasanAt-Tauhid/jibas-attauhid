-- Jenis pembayaran yang hanya berlaku untuk angkatan (tahun masuk) tertentu,
-- mis. "Uang Gedung Baru" cuma untuk angkatan 2024 & 2025. Sebelumnya scoping
-- jenis_pembayaran cuma bisa per lembaga (departemen_id) -- angkatan cuma
-- bisa dipakai untuk override NOMINAL di tarif_tagihan, bukan untuk
-- membatasi jenis pembayaran itu sendiri.
--
-- Tabel pivot (bukan kolom rentang) supaya angkatan yang dipilih tidak harus
-- berurutan/kontinu (mis. cuma 2024 & 2026, skip 2025). Tidak ada baris untuk
-- suatu jenis_id = jenis itu berlaku untuk SEMUA angkatan (default, sama
-- seperti departemen_id NULL = berlaku semua lembaga) -- backward compatible.
CREATE TABLE IF NOT EXISTS public.jenis_pembayaran_angkatan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_id uuid NOT NULL REFERENCES public.jenis_pembayaran(id) ON DELETE CASCADE,
  angkatan_id uuid NOT NULL REFERENCES public.angkatan(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (jenis_id, angkatan_id)
);

CREATE INDEX IF NOT EXISTS idx_jenis_pembayaran_angkatan_jenis ON public.jenis_pembayaran_angkatan(jenis_id);
CREATE INDEX IF NOT EXISTS idx_jenis_pembayaran_angkatan_angkatan ON public.jenis_pembayaran_angkatan(angkatan_id);

ALTER TABLE public.jenis_pembayaran_angkatan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read jenis_pembayaran_angkatan" ON public.jenis_pembayaran_angkatan
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin keuangan manage jenis_pembayaran_angkatan" ON public.jenis_pembayaran_angkatan
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'keuangan'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Perbaikan bug: generate_tagihan_batch selalu mengirim NULL untuk parameter
-- angkatan ke get_tarif_siswa, sehingga tarif override per-angkatan di
-- tarif_tagihan (kolom angkatan_id) TIDAK PERNAH benar-benar dipakai saat
-- generate tagihan lewat jalur normal. Sekalian tambahkan enforcement
-- scoping: kalau jenis_pembayaran_angkatan punya baris untuk jenis ini,
-- siswa yang angkatannya tidak termasuk di-skip (bukan error keras --
-- konsisten dengan penanganan "sudah ada tagihan" yang juga di-skip).
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_scoped_angkatan boolean;
BEGIN
  SELECT id, nama, nominal, akun_pendapatan_id
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

  -- Jenis ini scoped ke angkatan tertentu kalau ada minimal 1 baris di
  -- jenis_pembayaran_angkatan untuknya; kalau tidak ada baris sama sekali,
  -- berlaku untuk semua angkatan (backward compatible).
  SELECT EXISTS (
    SELECT 1 FROM jenis_pembayaran_angkatan WHERE jenis_id = p_jenis_id
  ) INTO v_scoped_angkatan;

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

      SELECT angkatan_id INTO v_angkatan_id FROM siswa WHERE id = v_row.siswa_id;

      IF v_scoped_angkatan AND NOT EXISTS (
        SELECT 1 FROM jenis_pembayaran_angkatan
        WHERE jenis_id = p_jenis_id AND angkatan_id IS NOT DISTINCT FROM v_angkatan_id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
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
