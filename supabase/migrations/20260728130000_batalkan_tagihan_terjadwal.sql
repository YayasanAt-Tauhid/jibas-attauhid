-- Dukung pembatalan/koreksi untuk tagihan berstatus 'terjadwal' (belum jatuh
-- tempo, belum pernah berjurnal), tidak hanya 'belum_bayar'.
--
-- CATATAN: definisi kedua fungsi di bawah TIDAK PERNAH tercatat di file
-- migrasi mana pun sebelumnya (hanya pernah diterapkan via MCP apply_migration
-- dengan timestamp sendiri, lihat SESI_NOTES.md). Isinya di sini disalin
-- verbatim dari `pg_get_functiondef` atas definisi live di project V4
-- (oquzygbekjpbmafuqiot), dengan HANYA SATU perubahan: guard status di awal
-- batalkan_tagihan_atomik.
--
-- Kenapa aman: tagihan 'terjadwal' tidak pernah punya jurnal_piutang_id
-- (akrual belum dijalankan untuknya), jadi seluruh logic pembalikan jurnal di
-- bawah ini (yang selalu digerbang oleh `IF v_t.jurnal_piutang_id IS NOT NULL`
-- / `IF v_pembalik_id IS NOT NULL`) otomatis dilewati untuk baris terjadwal --
-- tanpa perlu cabang kode baru. Mode 'batal' hanya menandai status jadi
-- 'dibatalkan', mode 'koreksi_nominal' hanya memperbarui nominal, keduanya
-- tanpa jurnal apa pun -- konsisten dengan sifat tagihan terjadwal yang memang
-- belum pernah dibukukan.
CREATE OR REPLACE FUNCTION public.batalkan_tagihan_atomik(p_tagihan_id uuid, p_mode text, p_alasan text, p_tanggal date, p_user_id uuid, p_nominal_baru numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t              public.tagihan;
  v_dept_id        uuid;
  v_unit_dept      text := 'unit_pendidikan';
  v_kategori       text;
  v_tb             record;
  v_log_count      integer;
  v_jurnal_asal    public.jurnal;
  v_pembalik_id    uuid;
  v_nomor          text;
  v_tahun          integer;
  v_jenis_nama     text;
  v_akun_pendapatan uuid;
  v_akun_piutang    uuid;
  v_jurnal_baru_id  uuid;
BEGIN
  IF p_mode NOT IN ('batal', 'koreksi_nominal') THEN
    RAISE EXCEPTION 'Mode tidak dikenal: %', p_mode;
  END IF;
  IF p_alasan IS NULL OR btrim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi.';
  END IF;

  SELECT * INTO v_t FROM public.tagihan WHERE id = p_tagihan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan';
  END IF;
  IF v_t.status NOT IN ('belum_bayar', 'terjadwal') THEN
    RAISE EXCEPTION 'Hanya tagihan berstatus ''belum bayar'' atau ''terjadwal'' yang bisa dibatalkan/dikoreksi lewat menu ini. Tagihan yang sudah dibayar perlu proses refund.';
  END IF;

  SELECT jenis.nama, jenis.akun_pendapatan_id, siswa.departemen_id
    INTO v_jenis_nama, v_akun_pendapatan, v_dept_id
    FROM public.jenis_pembayaran jenis
    LEFT JOIN public.siswa siswa ON siswa.id = v_t.siswa_id
   WHERE jenis.id = v_t.jenis_id;

  IF p_mode = 'koreksi_nominal' THEN
    IF p_nominal_baru IS NULL OR p_nominal_baru <= 0 THEN
      RAISE EXCEPTION 'Nominal baru harus lebih dari 0.';
    END IF;
    IF p_nominal_baru = v_t.nominal THEN
      RAISE EXCEPTION 'Nominal baru sama dengan nominal lama.';
    END IF;
  END IF;

  SELECT tb.id, tb.nama INTO v_tb
    FROM public.tahun_buku tb
   WHERE tb.tanggal_mulai <= p_tanggal AND tb.tanggal_selesai >= p_tanggal
   LIMIT 1;

  IF FOUND THEN
    IF v_dept_id IS NOT NULL THEN
      SELECT kategori INTO v_kategori FROM public.departemen WHERE id = v_dept_id;
      IF v_kategori IN ('unit_usaha', 'unit_dana_terikat', 'unit_yayasan') THEN
        v_unit_dept := 'unit_usaha_dana';
      END IF;
    END IF;

    SELECT count(*) INTO v_log_count
      FROM public.log_tutup_buku
     WHERE tahun_ajaran_id = v_tb.id AND unit = v_unit_dept;

    IF v_log_count > 0 THEN
      RAISE EXCEPTION 'Transaksi ditolak: periode "%" untuk % sudah ditutup buku.',
        v_tb.nama, (CASE WHEN v_unit_dept = 'unit_pendidikan' THEN 'Unit Pendidikan' ELSE 'Unit Usaha & Dana' END);
    END IF;
  END IF;

  IF v_t.jurnal_piutang_id IS NOT NULL THEN
    SELECT * INTO v_jurnal_asal FROM public.jurnal WHERE id = v_t.jurnal_piutang_id;
    IF FOUND THEN
      IF v_jurnal_asal.status <> 'posted' THEN
        RAISE EXCEPTION 'Jurnal piutang asal belum diposting; tidak bisa dibalik otomatis.';
      END IF;

      v_tahun := EXTRACT(year FROM p_tanggal)::integer;
      SELECT public.generate_nomor_jurnal('JU', v_tahun) INTO v_nomor;

      INSERT INTO public.jurnal (
        nomor, tanggal, keterangan, referensi, departemen_id, program_dana_id,
        total_debit, total_kredit, status, tipe, jurnal_asal_id
      ) VALUES (
        v_nomor, p_tanggal,
        CASE WHEN p_mode = 'batal' THEN 'KOREKSI/BATAL: ' ELSE 'KOREKSI: ' END || v_jurnal_asal.keterangan,
        v_jurnal_asal.nomor, v_jurnal_asal.departemen_id, v_jurnal_asal.program_dana_id,
        v_jurnal_asal.total_debit, v_jurnal_asal.total_kredit, 'posted', 'pembalik', v_jurnal_asal.id
      ) RETURNING id INTO v_pembalik_id;

      INSERT INTO public.jurnal_detail (jurnal_id, akun_id, debit, kredit, keterangan, urutan)
      SELECT v_pembalik_id, akun_id, kredit, debit,
             COALESCE('[BALIK] ' || keterangan, '[BALIK]'), urutan
        FROM public.jurnal_detail WHERE jurnal_id = v_jurnal_asal.id;
    END IF;
  END IF;

  IF p_mode = 'batal' THEN
    UPDATE public.tagihan
       SET status = 'dibatalkan',
           dibatalkan_alasan = p_alasan,
           dibatalkan_at = now(),
           dibatalkan_oleh = p_user_id,
           jurnal_pembalik_id = v_pembalik_id
     WHERE id = p_tagihan_id;

    INSERT INTO public.audit_keuangan (
      tabel_sumber, record_id, aksi, data_lama, data_baru, keterangan, departemen_id, dibuat_oleh
    ) VALUES (
      'tagihan', p_tagihan_id::text, 'UPDATE',
      jsonb_build_object('status', v_t.status, 'nominal', v_t.nominal, 'jurnal_piutang_id', v_t.jurnal_piutang_id),
      jsonb_build_object('status', 'dibatalkan', 'alasan', p_alasan, 'jurnal_pembalik_id', v_pembalik_id),
      'Pembatalan tagihan ' || COALESCE(v_jenis_nama, '') || ' ' || v_t.nominal::text || ' — ' || p_alasan,
      v_dept_id, p_user_id
    );

    RETURN jsonb_build_object('mode', 'batal', 'tagihan_id', p_tagihan_id, 'jurnal_pembalik_id', v_pembalik_id);
  END IF;

  IF v_pembalik_id IS NOT NULL THEN
    SELECT akun_id INTO v_akun_piutang
      FROM public.pengaturan_akun WHERE kode_setting = 'piutang_siswa' LIMIT 1;

    IF v_akun_piutang IS NOT NULL AND v_akun_pendapatan IS NOT NULL THEN
      v_tahun := EXTRACT(year FROM p_tanggal)::integer;
      SELECT public.generate_nomor_jurnal('JPI', v_tahun) INTO v_nomor;

      INSERT INTO public.jurnal (
        nomor, tanggal, keterangan, departemen_id, total_debit, total_kredit, status
      ) VALUES (
        v_nomor, p_tanggal,
        'Piutang ' || COALESCE(v_jenis_nama, '') || ' (koreksi) - siswa ' || v_t.siswa_id::text,
        v_dept_id, p_nominal_baru, p_nominal_baru, 'posted'
      ) RETURNING id INTO v_jurnal_baru_id;

      INSERT INTO public.jurnal_detail (jurnal_id, akun_id, debit, kredit, keterangan, urutan) VALUES
        (v_jurnal_baru_id, v_akun_piutang,    p_nominal_baru, 0,              'Piutang (koreksi nominal)',    1),
        (v_jurnal_baru_id, v_akun_pendapatan, 0,              p_nominal_baru, 'Pendapatan (koreksi nominal)', 2);
    END IF;
  END IF;

  UPDATE public.tagihan
     SET nominal = p_nominal_baru,
         jurnal_piutang_id = v_jurnal_baru_id
   WHERE id = p_tagihan_id;

  INSERT INTO public.audit_keuangan (
    tabel_sumber, record_id, aksi, data_lama, data_baru, keterangan, departemen_id, dibuat_oleh
  ) VALUES (
    'tagihan', p_tagihan_id::text, 'UPDATE',
    jsonb_build_object('nominal', v_t.nominal, 'jurnal_piutang_id', v_t.jurnal_piutang_id),
    jsonb_build_object('nominal', p_nominal_baru, 'jurnal_piutang_id', v_jurnal_baru_id, 'alasan', p_alasan),
    'Koreksi nominal tagihan ' || COALESCE(v_jenis_nama, '') || ': ' || v_t.nominal::text || ' -> ' || p_nominal_baru::text || ' — ' || p_alasan,
    v_dept_id, p_user_id
  );

  RETURN jsonb_build_object(
    'mode', 'koreksi_nominal', 'tagihan_id', p_tagihan_id,
    'jurnal_pembalik_id', v_pembalik_id, 'jurnal_baru_id', v_jurnal_baru_id,
    'warn_no_jurnal', (v_pembalik_id IS NOT NULL AND v_jurnal_baru_id IS NULL)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- batalkan_tagihan_batch tidak berubah -- disalin verbatim supaya ikut
-- tercatat di migrasi (sebelumnya juga hanya ada via MCP, tidak di file
-- manapun). Otomatis mewarisi dukungan status 'terjadwal' di atas karena
-- memanggil batalkan_tagihan_atomik per baris.
CREATE OR REPLACE FUNCTION public.batalkan_tagihan_batch(p_tagihan_ids uuid[], p_alasan text, p_tanggal date, p_user_id uuid)
 RETURNS TABLE(tagihan_id uuid, berhasil boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_alasan IS NULL OR btrim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi.';
  END IF;

  FOREACH v_id IN ARRAY p_tagihan_ids
  LOOP
    BEGIN
      SELECT public.batalkan_tagihan_atomik(v_id, 'batal', p_alasan, p_tanggal, p_user_id, NULL)
        INTO v_result;
      tagihan_id := v_id;
      berhasil := true;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      tagihan_id := v_id;
      berhasil := false;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$function$;

-- Privilege (REVOKE/GRANT) TIDAK diulang di sini -- CREATE OR REPLACE FUNCTION
-- tidak mengubah privilege yang sudah ada, dan kedua fungsi ini sudah dikunci
-- ke service_role saja oleh migrasi 20260728110000_kunci_akses_security_definer.sql.
