-- get_siswa_tahun_masuk() cuma dipanggil secara internal dari
-- generate_tagihan_batch (yang sudah dibatasi ke service_role saja, lihat
-- migration restrict_generate_tagihan_batch_execute). Fungsinya SECURITY
-- DEFINER, jadi default PostgreSQL memberi EXECUTE ke PUBLIC/anon/
-- authenticated -- membuatnya bisa dipanggil siapa saja lewat
-- /rest/v1/rpc/get_siswa_tahun_masuk tanpa login, mengekspos data
-- siswa_id -> tahun masuk. Cabut akses publik, sisakan hanya untuk
-- pemilik/service_role (dipanggil dari dalam fungsi lain dengan konteks
-- SECURITY DEFINER, bukan lewat sesi anon/authenticated).
REVOKE EXECUTE ON FUNCTION public.get_siswa_tahun_masuk(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_siswa_tahun_masuk(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_siswa_tahun_masuk(uuid) FROM authenticated;
