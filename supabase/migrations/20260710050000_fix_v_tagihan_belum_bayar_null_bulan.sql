-- Fix: checkout gagal dengan error
-- "null value in column \"bulan\" of relation \"transaksi_midtrans_item\" violates not-null constraint"
--
-- Root cause: migrasi 20260710020000 mengubah v_tagihan_belum_bayar agar membaca
-- t.bulan langsung dari tabel `tagihan`. Untuk jenis_pembayaran tipe 'sekali'
-- (bayar sekali, mis. uang pangkal/daftar ulang), tagihan.bulan memang NULL by
-- design (lihat migrasi 20260315023022). Nilai NULL ini lolos apa adanya ke
-- keranjang checkout lalu ke insert transaksi_midtrans_item, yang mewajibkan
-- bulan NOT NULL.
--
-- Sebelumnya view lama menyandikan "sekali bayar" sebagai bulan = 0 (bukan NULL),
-- dan konvensi bulan = 0 = "Sekali Bayar" masih dipakai di seluruh UI/portal
-- (PortalTagihan, PortalCheckout, payment.ts). Kembalikan konvensi itu dengan
-- COALESCE di view, tanpa perlu mengubah semua konsumen.

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
    p.tanggal_bayar
FROM public.tagihan t
    JOIN public.siswa s ON s.id = t.siswa_id
    LEFT JOIN public.kelas k ON k.id = t.kelas_id
    LEFT JOIN public.departemen d ON d.id = k.departemen_id
    JOIN public.jenis_pembayaran jp ON jp.id = t.jenis_id
    JOIN public.tahun_ajaran ta ON ta.id = t.tahun_ajaran_id
    LEFT JOIN public.pembayaran p ON p.id = t.pembayaran_id
WHERE s.status = 'aktif'
    AND t.status IN ('belum_bayar', 'lunas');

ALTER VIEW public.v_tagihan_belum_bayar SET (security_invoker = on);
