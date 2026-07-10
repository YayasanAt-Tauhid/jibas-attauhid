-- proses_pembayaran_atomik resolves petugas_id (pembayaran.petugas_id /
-- jurnal.dibuat_oleh, both FK -> public.pegawai(id)) from
-- users_profile.pegawai_id keyed by the logged-in auth user id.
--
-- Some users_profile rows carry a pegawai_id that no longer resolves to an
-- existing pegawai row (e.g. akun admin/kasir yang tidak terhubung ke data
-- pegawai, atau pegawai yang datanya dihapus/diganti). That stale id was
-- passed straight into the INSERT, tripping
-- "pembayaran_petugas_id_fkey". petugas_id is only used for audit/tracking
-- and is nullable, so fall back to NULL instead of failing the whole
-- transaction when the resolved pegawai_id doesn't actually exist.
CREATE OR REPLACE FUNCTION public.proses_pembayaran_atomik(
  p_siswa_id          uuid,
  p_jenis_id          uuid,
  p_bulan             int,           -- NULL untuk sekali bayar
  p_jumlah            numeric,
  p_tanggal_bayar     date,
  p_keterangan        text,
  p_departemen_id     uuid,
  p_tahun_ajaran_id   uuid,
  p_is_bayar_dimuka   boolean,
  p_tagihan_id        uuid,          -- NULL jika tidak ada piutang
  p_kas_akun_id       uuid,
  p_kredit_akun_id    uuid,
  p_kredit_label      text,
  p_prefix_jurnal     text,          -- 'JP' atau 'JD'
  p_petugas_id        uuid,          -- auth.users.id dari edge function
  p_jenis_nama        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pembayaran_id   uuid;
  v_jurnal_id       uuid;
  v_nomor_jurnal    text;
  v_tahun           int := EXTRACT(YEAR FROM p_tanggal_bayar)::int;
  v_pegawai_id      uuid;
BEGIN
  -- Resolve pegawai_id dari users_profile (boleh NULL jika user bukan pegawai)
  SELECT pegawai_id INTO v_pegawai_id
  FROM public.users_profile
  WHERE id = p_petugas_id;

  -- Pastikan pegawai_id yang di-resolve benar-benar ada, kalau tidak
  -- (data users_profile basi/menunjuk pegawai yang sudah tidak ada) → NULL
  -- saja, jangan sampai gagal insert karena FK.
  IF v_pegawai_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pegawai WHERE id = v_pegawai_id) THEN
    v_pegawai_id := NULL;
  END IF;

  -- ── 1. Insert pembayaran ──────────────────────────────────────────────────
  INSERT INTO public.pembayaran (
    siswa_id, jenis_id, tahun_ajaran_id, bulan,
    jumlah, tanggal_bayar, petugas_id, keterangan
  )
  VALUES (
    p_siswa_id, p_jenis_id, p_tahun_ajaran_id, p_bulan,
    p_jumlah, p_tanggal_bayar, v_pegawai_id, p_keterangan
  )
  RETURNING id INTO v_pembayaran_id;

  -- ── 2. Generate nomor jurnal (pakai function existing) ───────────────────
  v_nomor_jurnal := public.generate_nomor_jurnal(p_prefix_jurnal, v_tahun);

  -- ── 3. Insert jurnal header ───────────────────────────────────────────────
  INSERT INTO public.jurnal (
    nomor, tanggal, keterangan, referensi,
    total_debit, total_kredit, status,
    dibuat_oleh, departemen_id
  )
  VALUES (
    v_nomor_jurnal,
    p_tanggal_bayar,
    p_keterangan,
    v_pembayaran_id::text,   -- referensi ke pembayaran
    p_jumlah,
    p_jumlah,
    'posted',
    v_pegawai_id,
    p_departemen_id
  )
  RETURNING id INTO v_jurnal_id;

  -- ── 4. Insert jurnal detail: DEBIT Kas ────────────────────────────────────
  INSERT INTO public.jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
  VALUES (v_jurnal_id, p_kas_akun_id, 'Penerimaan ' || p_jenis_nama, p_jumlah, 0, 1);

  -- ── 5. Insert jurnal detail: KREDIT Pendapatan / Piutang / Dimuka ─────────
  INSERT INTO public.jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
  VALUES (v_jurnal_id, p_kredit_akun_id, p_kredit_label, 0, p_jumlah, 2);

  -- ── 6. Update pembayaran: set jurnal_id ──────────────────────────────────
  UPDATE public.pembayaran
  SET jurnal_id = v_jurnal_id
  WHERE id = v_pembayaran_id;

  -- ── 7. Update tagihan → lunas (jika ada tagihan piutang) ─────────────────
  IF p_tagihan_id IS NOT NULL THEN
    UPDATE public.tagihan
    SET status = 'lunas', pembayaran_id = v_pembayaran_id
    WHERE id = p_tagihan_id;
  ELSE
    -- Coba match tagihan via siswa+jenis+bulan+tahun jika tagihan_id tidak dikirim
    UPDATE public.tagihan
    SET status = 'lunas', pembayaran_id = v_pembayaran_id
    WHERE siswa_id        = p_siswa_id
      AND jenis_id        = p_jenis_id
      AND tahun_ajaran_id = p_tahun_ajaran_id
      AND (
        (p_bulan IS NULL AND bulan IS NULL) OR
        (bulan = p_bulan)
      )
      AND status = 'belum_bayar';
  END IF;

  -- ── 8. Insert pendapatan_dimuka (jika bayar di muka) ─────────────────────
  IF p_is_bayar_dimuka THEN
    INSERT INTO public.pendapatan_dimuka (
      siswa_id, jenis_id, tahun_ajaran_id,
      jumlah, tanggal, jurnal_id, status, keterangan
    )
    VALUES (
      p_siswa_id, p_jenis_id, p_tahun_ajaran_id,
      p_jumlah, p_tanggal_bayar, v_jurnal_id, 'pending', p_keterangan
    )
    ON CONFLICT DO NOTHING;   -- idempotent: jika sudah ada, skip
  END IF;

  -- ── Return hasil ──────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'pembayaran_id', v_pembayaran_id,
    'jurnal_id',     v_jurnal_id,
    'nomor_jurnal',  v_nomor_jurnal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.proses_pembayaran_atomik TO service_role;
