-- ─────────────────────────────────────────────────────────────────────────────
-- posting_piutang_jatuh_tempo: sadar diskon/keringanan
--
-- Tagihan 'terjadwal' menyimpan potongannya sejak dibuat (nominal_bruto /
-- nominal_diskon), tapi jurnal baru dibuat saat jatuh tempo tiba. Tanpa
-- perubahan ini, job akrual harian akan memposting
--     (D) Piutang netto   (K) Pendapatan netto
-- sehingga potongan yang sudah dijanjikan ke wali murid TIDAK PERNAH muncul di
-- akun kontra -- laporan "total keringanan yang diberikan" jadi nol terus,
-- padahal keringanannya benar-benar diberikan.
--
-- Sekarang jurnalnya mengikuti metode bruto yang sama dengan generate:
--     (D) Piutang Siswa        netto
--     (D) Potongan/Keringanan  diskon
--         (K) Pendapatan       bruto
--
-- Signature & tipe kembalian tidak berubah.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.posting_piutang_jatuh_tempo(
  p_sampai_tanggal date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE(diposting integer, total_nominal numeric, errors text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batas date := COALESCE(p_sampai_tanggal, current_date);
  v_tanggal date := current_date;
  v_tahun integer := extract(year from current_date)::integer;
  v_piutang_akun_id uuid;
  v_potongan_global_id uuid;
  v_potongan_akun_id uuid;
  v_pegawai_id uuid;
  v_row record;
  v_jurnal_id uuid;
  v_nomor text;
  v_dept_id uuid;
  v_bruto numeric;
  v_diskon numeric;
  v_netto numeric;
  v_urutan integer;
  v_diposting integer := 0;
  v_total numeric := 0;
  v_errors text[] := '{}';
BEGIN
  SELECT akun_id INTO v_piutang_akun_id
  FROM pengaturan_akun WHERE kode_setting = 'piutang_siswa';

  IF v_piutang_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun piutang siswa belum dikonfigurasi di Pengaturan Akun';
  END IF;

  SELECT akun_id INTO v_potongan_global_id
  FROM pengaturan_akun WHERE kode_setting = 'AKUN_POTONGAN_PENDAPATAN';

  IF p_user_id IS NOT NULL THEN
    SELECT pegawai_id INTO v_pegawai_id FROM users_profile WHERE id = p_user_id;
  END IF;

  FOR v_row IN
    SELECT t.id, t.siswa_id, t.kelas_id, t.nominal, t.nominal_bruto, t.nominal_diskon,
           t.bulan, t.jatuh_tempo,
           jp.nama AS jenis_nama, jp.akun_pendapatan_id, jp.akun_potongan_id
    FROM tagihan t
    JOIN jenis_pembayaran jp ON jp.id = t.jenis_id
    WHERE t.status = 'terjadwal'
      AND t.jurnal_piutang_id IS NULL
      AND t.jatuh_tempo IS NOT NULL
      AND t.jatuh_tempo <= v_batas
    ORDER BY t.jatuh_tempo, t.id
    LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
  LOOP
    BEGIN
      IF v_row.akun_pendapatan_id IS NULL THEN
        v_errors := v_errors ||
          ('Tagihan ' || v_row.id || ': akun pendapatan belum diset untuk jenis "' || v_row.jenis_nama || '"');
        CONTINUE;
      END IF;

      v_netto  := v_row.nominal;
      v_diskon := COALESCE(v_row.nominal_diskon, 0);
      v_bruto  := COALESCE(v_row.nominal_bruto, v_row.nominal + v_diskon);

      v_potongan_akun_id := COALESCE(v_row.akun_potongan_id, v_potongan_global_id);

      IF v_diskon > 0 AND v_potongan_akun_id IS NULL THEN
        v_errors := v_errors ||
          ('Tagihan ' || v_row.id || ': akun potongan/keringanan belum dikonfigurasi di Pengaturan Akun');
        CONTINUE;
      END IF;

      v_dept_id := NULL;
      IF v_row.kelas_id IS NOT NULL THEN
        SELECT departemen_id INTO v_dept_id FROM kelas WHERE id = v_row.kelas_id;
      END IF;
      IF v_dept_id IS NULL THEN
        SELECT departemen_id INTO v_dept_id FROM siswa WHERE id = v_row.siswa_id;
      END IF;

      v_nomor := generate_nomor_jurnal('JPI', v_tahun);

      INSERT INTO jurnal (nomor, tanggal, keterangan, referensi, departemen_id,
                          total_debit, total_kredit, status, dibuat_oleh)
      VALUES (
        v_nomor, v_tanggal,
        'Piutang ' || v_row.jenis_nama
          || CASE WHEN v_row.bulan IS NOT NULL THEN '-B' || v_row.bulan ELSE '' END
          || ' jatuh tempo ' || to_char(v_row.jatuh_tempo, 'YYYY-MM-DD')
          || ' - siswa ' || v_row.siswa_id,
        v_row.id::text, v_dept_id,
        v_bruto, v_bruto, 'posted', v_pegawai_id
      )
      RETURNING id INTO v_jurnal_id;

      v_urutan := 0;

      -- Beasiswa 100% -> netto 0: baris piutang nol tidak perlu dicatat.
      IF v_netto > 0 THEN
        v_urutan := v_urutan + 1;
        INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
        VALUES (v_jurnal_id, v_piutang_akun_id, 'Piutang ' || v_row.jenis_nama, v_netto, 0, v_urutan);
      END IF;

      IF v_diskon > 0 THEN
        v_urutan := v_urutan + 1;
        INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
        VALUES (v_jurnal_id, v_potongan_akun_id, 'Keringanan ' || v_row.jenis_nama, v_diskon, 0, v_urutan);
      END IF;

      v_urutan := v_urutan + 1;
      INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
      VALUES (v_jurnal_id, v_row.akun_pendapatan_id, 'Pendapatan ' || v_row.jenis_nama, 0, v_bruto, v_urutan);

      -- Guard balapan: hanya update kalau baris masih benar-benar 'terjadwal'
      -- (mis. orang tua melunasi lewat portal tepat saat job berjalan).
      UPDATE tagihan
      SET status = 'belum_bayar', jurnal_piutang_id = v_jurnal_id
      WHERE id = v_row.id AND status = 'terjadwal' AND jurnal_piutang_id IS NULL;

      IF NOT FOUND THEN
        DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
        DELETE FROM jurnal WHERE id = v_jurnal_id;
        CONTINUE;
      END IF;

      v_diposting := v_diposting + 1;
      v_total := v_total + v_netto;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || ('Tagihan ' || v_row.id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_diposting, v_total, v_errors;
END;
$function$;

COMMENT ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer) IS
  'Mengubah tagihan berstatus terjadwal yang sudah jatuh tempo menjadi piutang '
  '(D Piutang netto + D Potongan / K Pendapatan bruto) dan memindahkan statusnya '
  'ke belum_bayar. Idempoten.';

REVOKE ALL ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.posting_piutang_jatuh_tempo(date, uuid, integer) TO service_role;
