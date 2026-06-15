-- Sempurnakan batalkan_pembayaran_atomik: tangani pembayaran di muka yang SUDAH DIAKUI.
-- Sebelumnya ditolak. Sekarang: balik juga jurnal pengakuan (titipan→pendapatan),
-- lalu balik jurnal pembayaran & rapikan data seperti biasa.
-- CATATAN: CREATE OR REPLACE dapat memunculkan kembali grant EXECUTE ke `anon`
-- (perilaku Supabase), jadi REVOKE diulang di akhir.

CREATE OR REPLACE FUNCTION public.batalkan_pembayaran_atomik(
  p_pembayaran_id uuid,
  p_alasan        text,
  p_tanggal       date,
  p_user_id       uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pb                    public.pembayaran;
  v_jurnal                public.jurnal;
  v_dimuka                public.pendapatan_dimuka;
  v_nomor                 text;
  v_tahun                 integer;
  v_pembalik_id           uuid;
  v_pembalik_pengakuan_id uuid;
BEGIN
  SELECT * INTO v_pb FROM public.pembayaran WHERE id = p_pembayaran_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran tidak ditemukan'; END IF;

  v_tahun := EXTRACT(year FROM p_tanggal)::integer;

  -- Pendapatan di muka
  SELECT * INTO v_dimuka FROM public.pendapatan_dimuka WHERE pembayaran_id = p_pembayaran_id LIMIT 1;
  IF FOUND THEN
    -- Jika sudah diakui, balik dulu jurnal pengakuan (Pendapatan Diterima di Muka → Pendapatan)
    IF v_dimuka.jurnal_pengakuan_id IS NOT NULL THEN
      SELECT * INTO v_jurnal FROM public.jurnal WHERE id = v_dimuka.jurnal_pengakuan_id;
      IF FOUND THEN
        SELECT public.generate_nomor_jurnal('JU', v_tahun) INTO v_nomor;
        INSERT INTO public.jurnal (
          nomor, tanggal, keterangan, referensi, departemen_id, program_dana_id,
          total_debit, total_kredit, status, tipe, jurnal_asal_id
        ) VALUES (
          v_nomor, p_tanggal, 'PEMBATALAN PENGAKUAN: ' || v_jurnal.keterangan, v_jurnal.nomor,
          v_jurnal.departemen_id, v_jurnal.program_dana_id,
          v_jurnal.total_debit, v_jurnal.total_kredit, 'posted', 'pembalik', v_jurnal.id
        ) RETURNING id INTO v_pembalik_pengakuan_id;

        INSERT INTO public.jurnal_detail (jurnal_id, akun_id, debit, kredit, keterangan, urutan)
        SELECT v_pembalik_pengakuan_id, akun_id, kredit, debit,
               COALESCE('[BALIK] ' || keterangan, '[BALIK]'), urutan
        FROM public.jurnal_detail WHERE jurnal_id = v_jurnal.id;
      END IF;
    END IF;
    DELETE FROM public.pendapatan_dimuka WHERE id = v_dimuka.id;
  END IF;

  -- Jurnal pembayaran asal (Kas masuk)
  IF v_pb.jurnal_id IS NOT NULL THEN
    SELECT * INTO v_jurnal FROM public.jurnal WHERE id = v_pb.jurnal_id;
    IF FOUND THEN
      SELECT public.generate_nomor_jurnal('JU', v_tahun) INTO v_nomor;
      INSERT INTO public.jurnal (
        nomor, tanggal, keterangan, referensi, departemen_id, program_dana_id,
        total_debit, total_kredit, status, tipe, jurnal_asal_id
      ) VALUES (
        v_nomor, p_tanggal, 'PEMBATALAN: ' || v_jurnal.keterangan, v_jurnal.nomor,
        v_jurnal.departemen_id, v_jurnal.program_dana_id,
        v_jurnal.total_debit, v_jurnal.total_kredit, 'posted', 'pembalik', v_jurnal.id
      ) RETURNING id INTO v_pembalik_id;

      INSERT INTO public.jurnal_detail (jurnal_id, akun_id, debit, kredit, keterangan, urutan)
      SELECT v_pembalik_id, akun_id, kredit, debit,
             COALESCE('[BALIK] ' || keterangan, '[BALIK]'), urutan
      FROM public.jurnal_detail WHERE jurnal_id = v_jurnal.id;
    END IF;
  END IF;

  UPDATE public.tagihan
     SET status = 'belum_bayar', pembayaran_id = NULL
   WHERE pembayaran_id = p_pembayaran_id;

  DELETE FROM public.pembayaran WHERE id = p_pembayaran_id;

  RETURN jsonb_build_object(
    'pembayaran_id', p_pembayaran_id,
    'jurnal_pembalik_id', v_pembalik_id,
    'jurnal_pembalik_pengakuan_id', v_pembalik_pengakuan_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) TO service_role;
