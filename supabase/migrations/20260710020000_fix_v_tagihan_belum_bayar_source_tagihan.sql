-- Fix v_tagihan_belum_bayar: portal ortu menampilkan tagihan kosong.
--
-- Root cause:
-- 1. View lama meng-generate tagihan secara virtual dari
--    jenis_pembayaran x tahun_ajaran (WHERE aktif = true) x generate_series bulan,
--    bukan dari tabel `tagihan` yang sebenarnya (yang dipakai admin/keuangan untuk
--    generate piutang + jurnal). Ini membuat tunggakan dari tahun ajaran yang tidak
--    lagi "aktif" (mis. setelah tutup buku / pergantian tahun ajaran) tidak pernah
--    muncul di portal ortu.
-- 2. View lama mewajibkan jenis_pembayaran.departemen_id = departemen kelas siswa,
--    sehingga jenis pembayaran tanpa departemen_id (mis. SPP umum) tidak pernah
--    cocok meski dipakai untuk generate tagihan yang sebenarnya.
--
-- Fix: sumber data langsung dari tabel `tagihan` (sumber kebenaran yang sama dipakai
-- halaman admin/keuangan), sehingga tunggakan lintas tahun ajaran & lintas jenis SPP
-- apa pun (SPP reguler, SPP daycare, dst.) otomatis konsisten dengan yang sudah
-- di-generate, tanpa perlu menebak ulang nominal di sisi klien.

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
    t.nominal,
    ta.id AS tahun_ajaran_id,
    ta.nama AS tahun_ajaran_nama,
    t.bulan,
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
