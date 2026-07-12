-- ============================================================
-- Backfill jurnal untuk 5 pembayaran online (Midtrans QRIS, 10 Juli 2026)
-- yang tercatat lunas tapi tidak pernah terjurnal — akar penyebabnya
-- akun 'bank_midtrans' belum dikonfigurasi (auto-jurnal lama silent-gagal).
-- Sudah diperbaiki di migration konfigurasi akun bank_midtrans +
-- proses_pembayaran_midtrans_atomik. Ini hanya membereskan 5 baris historis.
--
-- Total: Rp 10.900.000 (4x SPP @450.000 + 1x Uang Pangkal 9.100.000)
-- Semua atas siswa yang sama, akun kredit sama (Pendapatan Operasional
-- Lembaga Pendidikan), jadi dibuat 1 jurnal per pembayaran (konsisten
-- dengan pola RPC: 1 jurnal per transaksi pembayaran).
--
-- (Sudah diterapkan ke remote via MCP apply_migration
--  "backfill_jurnal_pembayaran_midtrans_historis", 12 Jul 2026)
-- ============================================================

DO $$
DECLARE
  v_bank_midtrans_id uuid := (SELECT id FROM akun_rekening WHERE kode = '1210');
  v_row RECORD;
  v_nomor_jurnal text;
  v_jurnal_id uuid;
BEGIN
  FOR v_row IN
    SELECT p.id as pembayaran_id, p.jumlah, p.tanggal_bayar, p.keterangan,
           p.departemen_id, jp.nama as jenis_nama, jp.akun_pendapatan_id
    FROM pembayaran p
    JOIN jenis_pembayaran jp ON jp.id = p.jenis_id
    WHERE p.keterangan LIKE 'Online Payment%' AND p.jurnal_id IS NULL
    ORDER BY p.tanggal_bayar
  LOOP
    v_nomor_jurnal := generate_nomor_jurnal('JP', EXTRACT(YEAR FROM v_row.tanggal_bayar)::int);

    INSERT INTO jurnal (nomor, tanggal, keterangan, referensi, total_debit, total_kredit, status, departemen_id)
    VALUES (
      v_nomor_jurnal, v_row.tanggal_bayar, v_row.keterangan, v_row.pembayaran_id::text,
      v_row.jumlah, v_row.jumlah, 'posted', v_row.departemen_id
    )
    RETURNING id INTO v_jurnal_id;

    INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
    VALUES (v_jurnal_id, v_bank_midtrans_id, 'Penerimaan online payment (backfill) - ' || v_row.keterangan, v_row.jumlah, 0, 1);

    INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
    VALUES (v_jurnal_id, v_row.akun_pendapatan_id, 'Pendapatan ' || v_row.jenis_nama || ' (backfill)', 0, v_row.jumlah, 2);

    UPDATE pembayaran SET jurnal_id = v_jurnal_id WHERE id = v_row.pembayaran_id;
  END LOOP;
END $$;
