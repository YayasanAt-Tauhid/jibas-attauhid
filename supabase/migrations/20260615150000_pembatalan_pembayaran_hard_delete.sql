-- Penyempurnaan pembatalan pembayaran: ganti soft-cancel → hapus baris pembayaran.
-- Alasan: banyak laporan membaca tabel `pembayaran` langsung; baris dibatalkan akan
-- terhitung sebagai penerimaan. Jejak audit tetap di audit_keuangan + jurnal pembalik.

-- 1. Kembalikan unique index ke bentuk semula (tanpa predikat status)
DROP INDEX IF EXISTS public.uq_pembayaran_siswa_jenis_bulan_ta;
CREATE UNIQUE INDEX uq_pembayaran_siswa_jenis_bulan_ta
  ON public.pembayaran (siswa_id, jenis_id, bulan, tahun_ajaran_id)
  WHERE (bulan IS NOT NULL);

-- 2. RPC hard-delete (signature tetap, grant dari migrasi sebelumnya ikut terpakai)
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
  SELECT * INTO v_pb FROM public.pembayaran WHERE id = p_pembayaran_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran tidak ditemukan'; END IF;

  -- Pembayaran di muka: tolak bila pendapatan sudah diakui, hapus bila masih pending
  SELECT * INTO v_dimuka FROM public.pendapatan_dimuka WHERE pembayaran_id = p_pembayaran_id LIMIT 1;
  IF FOUND THEN
    IF v_dimuka.status IS DISTINCT FROM 'pending' OR v_dimuka.jurnal_pengakuan_id IS NOT NULL THEN
      RAISE EXCEPTION 'Pembayaran di muka ini sudah ada pendapatan yang diakui — tidak bisa dibatalkan otomatis';
    END IF;
    DELETE FROM public.pendapatan_dimuka WHERE id = v_dimuka.id;
  END IF;

  -- Jurnal pembalik (posted) dari jurnal pembayaran asal
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

  -- Lepas link tagihan & kembalikan ke belum_bayar
  UPDATE public.tagihan
     SET status = 'belum_bayar', pembayaran_id = NULL
   WHERE pembayaran_id = p_pembayaran_id;

  -- Hapus baris pembayaran (jejak ada di audit_keuangan + jurnal pembalik)
  DELETE FROM public.pembayaran WHERE id = p_pembayaran_id;

  RETURN jsonb_build_object('pembayaran_id', p_pembayaran_id, 'jurnal_pembalik_id', v_pembalik_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- 3. Buang kolom soft-cancel yang tak lagi dipakai
ALTER TABLE public.pembayaran DROP COLUMN IF EXISTS status;
ALTER TABLE public.pembayaran DROP COLUMN IF EXISTS dibatalkan_alasan;
ALTER TABLE public.pembayaran DROP COLUMN IF EXISTS dibatalkan_at;
ALTER TABLE public.pembayaran DROP COLUMN IF EXISTS dibatalkan_oleh;
ALTER TABLE public.pembayaran DROP COLUMN IF EXISTS jurnal_pembalik_id;
