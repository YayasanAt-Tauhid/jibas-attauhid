-- ============================================================
-- RPC: proses_pembayaran_midtrans_atomik
-- (Sudah diterapkan ke remote via MCP apply_migration
--  "proses_pembayaran_midtrans_atomik", 12 Jul 2026)
--
-- Dipanggil oleh webhook /api/midtrans-notification, SATU KALI PER ITEM
-- transaksi_midtrans_item saat status transaksi = paid.
--
-- Menggabungkan dalam SATU transaksi PostgreSQL (atomik, semua atau
-- tidak sama sekali):
--   1. Insert pembayaran
--   2. Update tagihan terkait -> lunas
--   3. Insert jurnal header + detail (debit Bank Midtrans, kredit Pendapatan)
--   4. Update pembayaran.jurnal_id
--   5. Update transaksi_midtrans_item.pembayaran_id
--
-- Berbeda dari alur lama (insert pembayaran + jurnal terpisah di webhook
-- JS dengan try/catch yang men-silent-kan error): di sini jika akun
-- belum dikonfigurasi atau langkah manapun gagal, SELURUHNYA di-roll
-- back — tidak ada lagi kondisi "pembayaran lunas tapi jurnal tidak ada".
--
-- Latar belakang: ditemukan 5 pembayaran QRIS (10 Jul 2026, total
-- Rp 10.900.000) yang lunas tapi tidak terjurnal karena akun
-- 'bank_midtrans' belum pernah dikonfigurasi di pengaturan_akun —
-- auto-jurnal lama gagal silent lewat try/catch kosong. Sudah di-backfill
-- terpisah (lihat migrasi backfill_jurnal_pembayaran_midtrans_historis).
-- ============================================================

CREATE OR REPLACE FUNCTION public.proses_pembayaran_midtrans_atomik(
  p_transaksi_item_id  uuid,          -- transaksi_midtrans_item.id
  p_siswa_id           uuid,
  p_jenis_id           uuid,
  p_bulan              int,           -- NULL/0 untuk sekali bayar
  p_jumlah             numeric,
  p_tanggal_bayar      date,
  p_departemen_id      uuid,
  p_tahun_ajaran_id    uuid,
  p_order_id           text,
  p_payment_type       text,
  p_kas_akun_id        uuid,          -- akun Bank Midtrans (debit)
  p_kredit_akun_id     uuid,          -- akun Pendapatan jenis ybs (kredit)
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
BEGIN
  IF p_kas_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun Bank Midtrans belum dikonfigurasi di Pengaturan Akun';
  END IF;
  IF p_kredit_akun_id IS NULL THEN
    RAISE EXCEPTION 'Akun Pendapatan untuk jenis "%" belum dikonfigurasi', p_jenis_nama;
  END IF;

  v_keterangan := 'Online Payment - ' || p_order_id || ' via ' || COALESCE(p_payment_type, '-');

  -- ── 0. Anti-duplikat (unique index juga menjaga di level DB untuk bulanal) ──
  IF v_bulan_norm IS NOT NULL THEN
    PERFORM 1 FROM public.pembayaran
    WHERE siswa_id = p_siswa_id AND jenis_id = p_jenis_id
      AND bulan = v_bulan_norm AND tahun_ajaran_id = p_tahun_ajaran_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Pembayaran bulan % untuk jenis ini sudah ada', v_bulan_norm;
    END IF;
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
  v_nomor_jurnal := public.generate_nomor_jurnal('JP', v_tahun);

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
  VALUES (v_jurnal_id, p_kas_akun_id, 'Penerimaan online payment ' || p_order_id, p_jumlah, 0, 1);

  -- ── 5. Jurnal detail: KREDIT Pendapatan ───────────────────────────────────
  INSERT INTO public.jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
  VALUES (v_jurnal_id, p_kredit_akun_id, 'Pendapatan ' || p_jenis_nama || ' (' || p_order_id || ')', 0, p_jumlah, 2);

  -- ── 6. Update pembayaran: set jurnal_id ───────────────────────────────────
  UPDATE public.pembayaran
  SET jurnal_id = v_jurnal_id
  WHERE id = v_pembayaran_id;

  -- ── 7. Update tagihan → lunas (match siswa+jenis+bulan+tahun) ────────────
  UPDATE public.tagihan
  SET status = 'lunas', pembayaran_id = v_pembayaran_id
  WHERE siswa_id        = p_siswa_id
    AND jenis_id        = p_jenis_id
    AND tahun_ajaran_id = p_tahun_ajaran_id
    AND status          = 'belum_bayar'
    AND (
      (v_bulan_norm IS NULL AND bulan IS NULL) OR
      (bulan = v_bulan_norm)
    );

  -- ── 8. Update transaksi_midtrans_item → link ke pembayaran ───────────────
  UPDATE public.transaksi_midtrans_item
  SET pembayaran_id = v_pembayaran_id
  WHERE id = p_transaksi_item_id;

  -- ── Return hasil ──────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'pembayaran_id', v_pembayaran_id,
    'jurnal_id',     v_jurnal_id,
    'nomor_jurnal',  v_nomor_jurnal
  );
END;
$$;

-- Hanya service_role yang boleh eksekusi (dipanggil dari webhook server-side,
-- BUKAN dari browser). Konsisten dengan hardening proses_pembayaran_atomik.
REVOKE EXECUTE ON FUNCTION public.proses_pembayaran_midtrans_atomik(
  uuid, uuid, uuid, int, numeric, date, uuid, uuid, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.proses_pembayaran_midtrans_atomik(
  uuid, uuid, uuid, int, numeric, date, uuid, uuid, text, text, uuid, uuid, text
) TO service_role;

-- ============================================================
-- Konfigurasi akun bank_midtrans (root cause fix)
-- Hubungkan pengaturan_akun.bank_midtrans ke akun 1210 BANK MIDTRANS
-- yang sudah dibuat di chart of accounts tapi belum pernah di-link.
-- Ini akar penyebab auto-jurnal online payment selalu silent-gagal
-- sejak fitur ini ada (bisaAutoJurnal selalu false karena akun_id null).
-- ============================================================
UPDATE public.pengaturan_akun
SET akun_id = (SELECT id FROM public.akun_rekening WHERE kode = '1210'),
    updated_at = now()
WHERE kode_setting = 'bank_midtrans' AND akun_id IS NULL;
