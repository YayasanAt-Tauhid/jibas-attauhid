-- ─────────────────────────────────────────────────────────────────────────────
-- Cantumkan bulan & tahun ajaran di keterangan jurnal pembayaran Midtrans
--
-- Migrasi sebelumnya (20260802230000) menambahkan nama siswa, tapi kasir
-- manual (src/server/pembayaran.ts) juga mencantumkan bulan & tahun ajaran:
--   "SPP — Des (TA 2026/2027) — Ahmad Fauzan"
-- sedangkan Midtrans baru "SPP - Ahmad Fauzan (...)" -- tanpa info periode,
-- padahal itu penting untuk tagihan bulanan (SPP dst.) supaya langsung
-- kelihatan bulan apa yang dibayar tanpa buka detail transaksi.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.proses_pembayaran_midtrans_atomik(
  p_transaksi_item_id  uuid,
  p_siswa_id           uuid,
  p_jenis_id           uuid,
  p_bulan              int,
  p_jumlah             numeric,
  p_tanggal_bayar      date,
  p_departemen_id      uuid,
  p_tahun_ajaran_id    uuid,
  p_order_id           text,
  p_payment_type       text,
  p_kas_akun_id        uuid,
  p_kredit_akun_id     uuid,
  p_jenis_nama         text
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
  v_bulan_norm      int := NULLIF(p_bulan, 0);
  v_keterangan      text;
  v_tagihan         record;
  v_dimuka          boolean := false;
  v_kredit_akun_id  uuid := p_kredit_akun_id;
  v_kredit_label    text;
  v_periode_bayar   uuid;
  v_nama_siswa      text;
  v_nama_ta         text;
  v_info_bulan      text := '';
  v_ket_dasar       text;
  -- Array literal Postgres 1-based by default (BUKAN 0-based seperti JS) --
  -- indeks 1 langsung 'Jan' supaya v_bulan_names[v_bulan_norm] pas untuk
  -- v_bulan_norm 1..12, tanpa placeholder kosong di indeks 0.
  v_bulan_names     text[] := ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                                     'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
BEGIN
  IF p_kas_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun Bank Midtrans belum dikonfigurasi di Pengaturan Akun';
  END IF;
  IF p_kredit_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun Pendapatan untuk jenis "%" belum dikonfigurasi', p_jenis_nama;
  END IF;

  SELECT nama INTO v_nama_siswa FROM public.siswa WHERE id = p_siswa_id;
  SELECT nama INTO v_nama_ta FROM public.tahun_ajaran WHERE id = p_tahun_ajaran_id;

  IF v_bulan_norm IS NOT NULL AND v_bulan_norm BETWEEN 1 AND 12 THEN
    v_info_bulan := ' — ' || v_bulan_names[v_bulan_norm];
  END IF;

  -- Format sama dengan keterangan otomatis kasir manual (src/server/pembayaran.ts):
  -- "<jenis><— bulan> (TA <tahun ajaran>) — <nama siswa>", ditambah penanda online.
  v_ket_dasar := p_jenis_nama || v_info_bulan
    || ' (TA ' || COALESCE(v_nama_ta, p_tahun_ajaran_id::text) || ') — '
    || COALESCE(v_nama_siswa, p_siswa_id::text);

  v_keterangan := v_ket_dasar || ' [Online - ' || p_order_id || ' via ' || COALESCE(p_payment_type, '-') || ']';

  -- ── 0. Anti-duplikat (unique index juga menjaga di level DB untuk bulanal) ──
  IF v_bulan_norm IS NOT NULL THEN
    PERFORM 1 FROM public.pembayaran
    WHERE siswa_id = p_siswa_id AND jenis_id = p_jenis_id
      AND bulan = v_bulan_norm AND tahun_ajaran_id = p_tahun_ajaran_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Pembayaran bulan % untuk jenis ini sudah ada', v_bulan_norm;
    END IF;
  END IF;

  -- ── 0b. Tagihan sasaran: menentukan akun kredit yang benar ────────────────
  SELECT t.id, t.status INTO v_tagihan
  FROM public.tagihan t
  WHERE t.siswa_id        = p_siswa_id
    AND t.jenis_id        = p_jenis_id
    AND t.tahun_ajaran_id = p_tahun_ajaran_id
    AND (
      (v_bulan_norm IS NULL AND t.bulan IS NULL) OR
      (t.bulan = v_bulan_norm)
    )
    AND t.status IN ('belum_bayar', 'terjadwal')
  LIMIT 1;

  -- Tanpa tagihan yang cocok, v_tagihan.status NULL -> perlakukan sebagai
  -- pembayaran biasa (kredit Pendapatan), bukan diterima di muka.
  v_dimuka := COALESCE(v_tagihan.status = 'terjadwal', false);

  IF v_dimuka THEN
    SELECT COALESCE(
             (SELECT akun_dimuka_id FROM public.jenis_pembayaran WHERE id = p_jenis_id),
             (SELECT akun_id FROM public.pengaturan_akun WHERE kode_setting = 'AKUN_PENDAPATAN_DIMUKA')
           )
    INTO v_kredit_akun_id;

    IF v_kredit_akun_id IS NULL THEN
      RAISE EXCEPTION 'Akun Pendapatan Diterima di Muka belum dikonfigurasi (pembayaran sebelum jatuh tempo untuk jenis "%")', p_jenis_nama;
    END IF;

    v_kredit_label := 'Pendapatan Diterima di Muka - ' || v_ket_dasar;
  ELSE
    v_kredit_label := 'Pendapatan - ' || v_ket_dasar;
  END IF;

  -- ── 1. Insert pembayaran ──────────────────────────────────────────────────
  INSERT INTO public.pembayaran (
    siswa_id, jenis_id, tahun_ajaran_id, bulan,
    jumlah, tanggal_bayar, departemen_id, keterangan
  )
  VALUES (
    p_siswa_id, p_jenis_id, p_tahun_ajaran_id, v_bulan_norm,
    p_jumlah, p_tanggal_bayar, p_departemen_id, v_keterangan
  )
  RETURNING id INTO v_pembayaran_id;

  -- ── 2. Generate nomor jurnal ──────────────────────────────────────────────
  v_nomor_jurnal := public.generate_nomor_jurnal(CASE WHEN v_dimuka THEN 'JD' ELSE 'JP' END, v_tahun);

  -- ── 3. Insert jurnal header ───────────────────────────────────────────────
  INSERT INTO public.jurnal (
    nomor, tanggal, keterangan, referensi,
    total_debit, total_kredit, status, departemen_id
  )
  VALUES (
    v_nomor_jurnal,
    p_tanggal_bayar,
    v_keterangan,
    p_order_id,
    p_jumlah,
    p_jumlah,
    'posted',
    p_departemen_id
  )
  RETURNING id INTO v_jurnal_id;

  -- ── 4. Jurnal detail: DEBIT Bank Midtrans ─────────────────────────────────
  INSERT INTO public.jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
  VALUES (v_jurnal_id, p_kas_akun_id, 'Penerimaan online payment - ' || v_ket_dasar, p_jumlah, 0, 1);

  -- ── 5. Jurnal detail: KREDIT Pendapatan / Pendapatan Diterima di Muka ─────
  INSERT INTO public.jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
  VALUES (v_jurnal_id, v_kredit_akun_id, v_kredit_label, 0, p_jumlah, 2);

  -- ── 6. Update pembayaran: set jurnal_id ───────────────────────────────────
  UPDATE public.pembayaran
  SET jurnal_id = v_jurnal_id
  WHERE id = v_pembayaran_id;

  -- ── 7. Update tagihan → lunas (termasuk yang belum jatuh tempo) ──────────
  UPDATE public.tagihan
  SET status = 'lunas', pembayaran_id = v_pembayaran_id
  WHERE siswa_id        = p_siswa_id
    AND jenis_id        = p_jenis_id
    AND tahun_ajaran_id = p_tahun_ajaran_id
    AND status          IN ('belum_bayar', 'terjadwal')
    AND (
      (v_bulan_norm IS NULL AND bulan IS NULL) OR
      (bulan = v_bulan_norm)
    );

  -- ── 7b. Catat liabilitas pendapatan diterima di muka ─────────────────────
  -- Pendapatannya baru diakui saat jatuh tempo, lewat RPC
  -- akui_pendapatan_dimuka_jatuh_tempo.
  IF v_dimuka THEN
    SELECT id INTO v_periode_bayar
    FROM public.tahun_buku
    WHERE p_tanggal_bayar >= tanggal_mulai
      AND p_tanggal_bayar <= tanggal_selesai
    ORDER BY tanggal_mulai DESC
    LIMIT 1;

    INSERT INTO public.pendapatan_dimuka (
      pembayaran_id, siswa_id, jenis_id,
      tahun_ajaran_pembayaran_id, tahun_ajaran_target_id,
      bulan, jumlah, status, departemen_id
    )
    VALUES (
      v_pembayaran_id, p_siswa_id, p_jenis_id,
      COALESCE(v_periode_bayar, p_tahun_ajaran_id), p_tahun_ajaran_id,
      v_bulan_norm, p_jumlah, 'pending', p_departemen_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 8. Update transaksi_midtrans_item → link ke pembayaran ───────────────
  UPDATE public.transaksi_midtrans_item
  SET pembayaran_id = v_pembayaran_id
  WHERE id = p_transaksi_item_id;

  -- ── Return hasil ──────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'pembayaran_id',   v_pembayaran_id,
    'jurnal_id',       v_jurnal_id,
    'nomor_jurnal',    v_nomor_jurnal,
    'diterima_dimuka', v_dimuka
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.proses_pembayaran_midtrans_atomik(
  uuid, uuid, uuid, int, numeric, date, uuid, uuid, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.proses_pembayaran_midtrans_atomik(
  uuid, uuid, uuid, int, numeric, date, uuid, uuid, text, text, uuid, uuid, text
) TO service_role;
