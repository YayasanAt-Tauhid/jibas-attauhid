-- ─────────────────────────────────────────────────────────────────────────────
-- Pembayaran atas tagihan yang BELUM jatuh tempo
--
-- Dengan adanya status 'terjadwal', pembayaran bisa masuk sebelum tagihannya
-- jadi piutang. Uangnya nyata (kas bertambah) tapi jasanya belum diberikan,
-- jadi lawan kreditnya BUKAN pendapatan dan bukan pula piutang (piutangnya
-- memang belum pernah dibukukan), melainkan liabilitas:
--     (D) Kas   (K) Pendapatan Diterima di Muka
-- lalu diakui jadi pendapatan saat periodenya tiba, lewat RPC
-- akui_pendapatan_dimuka_jatuh_tempo.
--
-- Migrasi ini memperbaiki dua hal di proses_pembayaran_atomik:
--
--   a. Langkah 7 hanya melunasi tagihan berstatus 'belum_bayar', sehingga
--      tagihan 'terjadwal' yang dibayar di muka tetap menggantung belum lunas
--      dan bisa tertagih dua kali.
--
--   b. Langkah 8 melakukan INSERT ke pendapatan_dimuka memakai nama kolom yang
--      TIDAK ADA di tabelnya (tahun_ajaran_id, tanggal, jurnal_id, keterangan --
--      tabel sebenarnya memakai tahun_ajaran_pembayaran_id,
--      tahun_ajaran_target_id, jurnal_pengakuan_id, tanggal_pengakuan, dan
--      pembayaran_id yang NOT NULL). Karena PL/pgSQL baru mem-parse statement
--      saat baris itu dieksekusi, error ini tidak terlihat saat fungsi dibuat
--      dan baru muncul sebagai kegagalan runtime setiap kali ada pembayaran
--      dengan p_is_bayar_dimuka = true.
--
-- Signature fungsi sengaja TIDAK diubah supaya tidak menimbulkan overload baru
-- (pola bug yang sudah pernah kejadian di get_tarif_siswa & buku_besar_mutasi).
-- Tahun buku saat pembayaran diturunkan dari p_tanggal_bayar di dalam fungsi.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_periode_bayar   uuid;
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
  -- 'terjadwal' ikut disertakan: tagihan periode mendatang yang dilunasi lebih
  -- awal tetap harus tertutup, kalau tidak ia akan tertagih lagi saat jatuh
  -- tempo. Status 'sebagian' sengaja TIDAK disertakan -- menandainya 'lunas'
  -- karena satu pembayaran susulan belum tentu benar (sisanya bisa saja belum
  -- tertutup), dan itu di luar cakupan perubahan ini.
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
      AND status IN ('belum_bayar', 'terjadwal');
  END IF;

  -- ── 8. Insert pendapatan_dimuka (jika bayar di muka) ─────────────────────
  -- tahun_ajaran_target_id  = periode yang DIBAYAR (p_tahun_ajaran_id)
  -- tahun_ajaran_pembayaran_id = periode saat UANG DITERIMA, diturunkan dari
  --                           tanggal bayar; fallback ke periode target kalau
  --                           tanggal bayar tidak masuk tahun buku mana pun.
  IF p_is_bayar_dimuka THEN
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
      p_bulan, p_jumlah, 'pending', p_departemen_id
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

-- ─────────────────────────────────────────────────────────────────────────────
-- View tagihan untuk kasir & portal ortu: sertakan tagihan 'terjadwal'
--
-- Tagihan yang belum jatuh tempo tetap harus terlihat (orang tua ingin melihat
-- rencana pembayaran dan boleh membayar lebih awal), jadi statusnya ikut
-- ditampilkan -- lengkap dengan jatuh_tempo & penanda sudah/belum jatuh tempo
-- supaya UI bisa membedakan "belum waktunya" dari "menunggak".
--
-- PENTING: kolom lama HARUS dipertahankan persis pada urutan yang sama dan
-- kolom baru hanya boleh ditambahkan DI AKHIR -- CREATE OR REPLACE VIEW tidak
-- bisa menghapus/menyusun ulang kolom. Termasuk `tahun_ajaran_mulai`, yang ada
-- di database live (dipakai PortalTagihan untuk melabeli bulan sesuai siklus
-- tahun ajaran) tapi belum pernah tercatat di file migrasi mana pun.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_tagihan_belum_bayar AS
SELECT
    t.siswa_id,
    s.nis,
    s.nama AS nama_siswa,
    s.jenis_kelamin,
    k.nama AS kelas_nama,
    d.id AS departemen_id,
    d.nama AS departemen_nama,
    d.kode AS departemen_kode,
    jp.id AS jenis_id,
    jp.nama AS jenis_nama,
    t.nominal::numeric(15,2) AS nominal,
    ta.id AS tahun_ajaran_id,
    ta.nama AS tahun_ajaran_nama,
    COALESCE(t.bulan, 0) AS bulan,
    (t.status = 'lunas') AS sudah_bayar,
    t.pembayaran_id,
    p.tanggal_bayar,
    ta.tanggal_mulai AS tahun_ajaran_mulai,
    t.id AS tagihan_id,
    t.status,
    t.jatuh_tempo,
    -- Sudah lewat jatuh tempo dan belum lunas = tunggakan.
    (t.status <> 'lunas' AND t.jatuh_tempo IS NOT NULL AND t.jatuh_tempo < current_date)
      AS menunggak
FROM public.tagihan t
    JOIN public.siswa s ON s.id = t.siswa_id
    LEFT JOIN public.kelas k ON k.id = t.kelas_id
    LEFT JOIN public.departemen d ON d.id = k.departemen_id
    JOIN public.jenis_pembayaran jp ON jp.id = t.jenis_id
    JOIN public.tahun_ajaran ta ON ta.id = t.tahun_ajaran_id
    LEFT JOIN public.pembayaran p ON p.id = t.pembayaran_id
WHERE s.status = 'aktif'
    AND t.status IN ('terjadwal', 'belum_bayar', 'lunas');

ALTER VIEW public.v_tagihan_belum_bayar SET (security_invoker = on);

-- ─────────────────────────────────────────────────────────────────────────────
-- Online payment (Midtrans): perlakuan yang sama untuk tagihan belum jatuh tempo
--
-- Sejak tagihan 'terjadwal' ikut tampil di portal, orang tua bisa membayar
-- tagihan periode mendatang lewat Midtrans. Versi lama RPC ini:
--   * SELALU mengkredit akun Pendapatan -- padahal untuk tagihan yang belum
--     jatuh tempo jasanya belum diberikan, jadi seharusnya masuk liabilitas
--     Pendapatan Diterima di Muka; dan
--   * hanya menutup tagihan berstatus 'belum_bayar', sehingga tagihan
--     'terjadwal' yang sudah dibayar tetap terbuka lalu DITAGIH LAGI saat
--     jatuh tempo tiba.
--
-- Signature tidak diubah (menghindari overload); akun "diterima di muka"
-- di-resolve di dalam fungsi, sama seperti proses_pembayaran_atomik.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_tagihan         record;
  v_dimuka          boolean := false;
  v_kredit_akun_id  uuid := p_kredit_akun_id;
  v_kredit_label    text;
  v_periode_bayar   uuid;
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

    v_kredit_label := 'Pendapatan Diterima di Muka - ' || p_jenis_nama || ' (' || p_order_id || ')';
  ELSE
    v_kredit_label := 'Pendapatan ' || p_jenis_nama || ' (' || p_order_id || ')';
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
  VALUES (v_jurnal_id, p_kas_akun_id, 'Penerimaan online payment ' || p_order_id, p_jumlah, 0, 1);

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
