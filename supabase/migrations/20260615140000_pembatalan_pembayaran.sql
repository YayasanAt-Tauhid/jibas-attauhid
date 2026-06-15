-- Pembatalan pembayaran salah-input (admin/keuangan). Koreksi salah-input, tanpa refund kas.
-- 1. Kolom status & jejak pembatalan pada pembayaran
ALTER TABLE public.pembayaran ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aktif';
ALTER TABLE public.pembayaran ADD COLUMN IF NOT EXISTS dibatalkan_alasan text;
ALTER TABLE public.pembayaran ADD COLUMN IF NOT EXISTS dibatalkan_at timestamptz;
ALTER TABLE public.pembayaran ADD COLUMN IF NOT EXISTS dibatalkan_oleh uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.pembayaran ADD COLUMN IF NOT EXISTS jurnal_pembalik_id uuid REFERENCES public.jurnal(id) ON DELETE SET NULL;

-- 2. Unique index partial: hanya pembayaran AKTIF yang dijaga unik,
--    agar setelah dibatalkan kasir bisa input ulang yang benar.
DROP INDEX IF EXISTS public.uq_pembayaran_siswa_jenis_bulan_ta;
CREATE UNIQUE INDEX uq_pembayaran_siswa_jenis_bulan_ta
  ON public.pembayaran (siswa_id, jenis_id, bulan, tahun_ajaran_id)
  WHERE (bulan IS NOT NULL AND status = 'aktif');

-- 3. RPC atomik pembatalan pembayaran
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
  v_pb          public.pembayaran;
  v_jurnal      public.jurnal;
  v_dimuka      public.pendapatan_dimuka;
  v_nomor       text;
  v_tahun       integer;
  v_pembalik_id uuid;
BEGIN
  -- 1. Ambil pembayaran
  SELECT * INTO v_pb FROM public.pembayaran WHERE id = p_pembayaran_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran tidak ditemukan'; END IF;
  IF v_pb.status = 'dibatalkan' THEN RAISE EXCEPTION 'Pembayaran ini sudah dibatalkan'; END IF;

  -- 2. Pembayaran di muka: tolak bila pendapatan sudah diakui, hapus bila masih pending
  SELECT * INTO v_dimuka FROM public.pendapatan_dimuka WHERE pembayaran_id = p_pembayaran_id LIMIT 1;
  IF FOUND THEN
    IF v_dimuka.status IS DISTINCT FROM 'pending' OR v_dimuka.jurnal_pengakuan_id IS NOT NULL THEN
      RAISE EXCEPTION 'Pembayaran di muka ini sudah ada pendapatan yang diakui — tidak bisa dibatalkan otomatis';
    END IF;
    DELETE FROM public.pendapatan_dimuka WHERE id = v_dimuka.id;
  END IF;

  -- 3. Jurnal pembalik (posted) dari jurnal pembayaran asal
  IF v_pb.jurnal_id IS NOT NULL THEN
    SELECT * INTO v_jurnal FROM public.jurnal WHERE id = v_pb.jurnal_id;
    IF FOUND THEN
      v_tahun := EXTRACT(year FROM p_tanggal)::integer;
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

  -- 4. Kembalikan tagihan terkait ke belum_bayar
  UPDATE public.tagihan
     SET status = 'belum_bayar', pembayaran_id = NULL
   WHERE pembayaran_id = p_pembayaran_id;

  -- 5. Soft-cancel pembayaran + jejak
  UPDATE public.pembayaran
     SET status = 'dibatalkan',
         dibatalkan_alasan = p_alasan,
         dibatalkan_at = now(),
         dibatalkan_oleh = p_user_id,
         jurnal_pembalik_id = v_pembalik_id
   WHERE id = p_pembayaran_id;

  RETURN jsonb_build_object('pembayaran_id', p_pembayaran_id, 'jurnal_pembalik_id', v_pembalik_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- 4. Batasi eksekusi: hanya service_role (dipanggil lewat edge function setelah cek role)
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pembayaran_atomik(uuid, text, date, uuid) TO service_role;
