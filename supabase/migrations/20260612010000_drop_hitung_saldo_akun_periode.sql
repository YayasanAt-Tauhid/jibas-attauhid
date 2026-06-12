-- RPC tak terpakai di aplikasi dan tidak mengecualikan jurnal penutup —
-- dihapus agar tidak terpakai keliru. Buku besar memakai buku_besar_mutasi/buku_besar_saldo_awal.
DROP FUNCTION IF EXISTS public.hitung_saldo_akun_periode(date, date);
