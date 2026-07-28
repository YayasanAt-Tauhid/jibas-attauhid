-- ─────────────────────────────────────────────────────────────────────────────
-- Penjadwal otomatis akrual jatuh tempo (pg_cron)
--
-- Sebelum ini `jalankan_akrual_jatuh_tempo` hanya dipanggil manual dari tab
-- Akrual Jatuh Tempo di Manajemen Piutang. Migrasi ini menjadwalkannya lewat
-- pg_cron supaya tagihan yang jatuh tempo diakui otomatis setiap hari tanpa
-- perlu ada staf yang membuka halaman itu.
--
-- Kenapa pg_cron (bukan Cloudflare Cron Trigger): tidak perlu mengubah
-- pipeline deploy/Worker sama sekali, dan bisa diverifikasi end-to-end
-- langsung di database (aktifkan, jalankan, cek hasil) tanpa bergantung pada
-- deploy Cloudflare yang sesungguhnya.
--
-- Jam jalan: 00:05 UTC = 07:05 WIB. `jalankan_akrual_jatuh_tempo` membandingkan
-- jatuh_tempo terhadap `current_date`, dan timezone database ini adalah UTC
-- (`SHOW timezone` = UTC) -- artinya tanggal kalender UTC baru berganti ke
-- hari D pada pukul 00:00 UTC, yaitu 07:00 WIB. Tagihan yang jatuh tempo
-- tanggal D baru dianggap "sudah jatuh tempo" begitu current_date (UTC)
-- mencapai D, jadi job dijadwalkan sedikit setelah itu (00:05 UTC / 07:05 WIB)
-- supaya tagihan hari itu langsung terproses di awal hari kerja WIB, bukan
-- ditunda ke keesokan harinya.
--
-- RPC-nya sendiri idempoten dan sudah dibatasi p_limit (default 5000), jadi
-- aman dipanggil berkala berkali-kali. Job pg_cron berjalan sebagai role yang
-- menjadwalkannya (di sini: `postgres`, pemilik fungsi), jadi tidak terpengaruh
-- pencabutan akses anon/authenticated pada migrasi 20260728110000.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule dengan job_name yang sudah ada akan meng-update jadwalnya
-- (bukan membuat duplikat), jadi migrasi ini aman dijalankan ulang.
SELECT cron.schedule(
  'akrual-jatuh-tempo-harian',
  '5 0 * * *',
  $$SELECT public.jalankan_akrual_jatuh_tempo();$$
);
