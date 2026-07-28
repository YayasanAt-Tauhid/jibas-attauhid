-- ─────────────────────────────────────────────────────────────────────────────
-- Akrual tagihan: kolom jatuh tempo + status 'terjadwal'
--
-- MASALAH YANG DIPERBAIKI
-- Sekolah meng-input tagihan SPP jauh di muka (mis. 6 tahun sekaligus untuk
-- siswa kelas 1 SD, 3 tahun untuk kelas 7 SMP / kelas 10 SMA). Sampai sekarang
-- `generate_tagihan_batch` LANGSUNG memposting jurnal
--     (D) Piutang Siswa   (K) Pendapatan
-- untuk SETIAP tagihan yang dibuat, berapa pun jauhnya periode tagihan itu ke
-- depan. Akibatnya pendapatan 6 tahun ke depan diakui hari ini juga, dan
-- neraca memuat piutang atas jasa pendidikan yang bahkan belum diberikan --
-- melanggar prinsip pengakuan pendapatan (pendapatan diakui pada periode
-- jasanya diberikan, bukan saat tagihan dicetak).
--
-- DESAIN BARU
-- Tagihan punya tanggal jatuh tempo. Sebelum tanggal itu tiba, tagihan hanya
-- berupa JADWAL: tercatat di tabel `tagihan` (supaya orang tua tetap bisa
-- melihat & membayar di muka) tapi TIDAK memunculkan jurnal apa pun --
-- statusnya 'terjadwal'. Begitu jatuh tempo tiba, barulah piutang & pendapatan
-- diakui dan statusnya berpindah ke 'belum_bayar' (lihat migrasi
-- 20260728100002 untuk RPC yang menjalankan perpindahan itu).
--
-- Migrasi ini hanya menyiapkan skema + fungsi bantu; perubahan perilaku
-- generate/posting ada di migrasi berikutnya.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Kolom jatuh tempo pada tagihan ───────────────────────────────────────
-- Nullable: data lama (yang jurnalnya sudah terlanjur diposting) diisi lewat
-- backfill di bawah, tapi kolom tetap boleh NULL supaya baris legacy yang
-- periodenya tidak punya tanggal_mulai tidak menggagalkan migrasi.
ALTER TABLE public.tagihan ADD COLUMN IF NOT EXISTS jatuh_tempo date;

COMMENT ON COLUMN public.tagihan.jatuh_tempo IS
  'Tanggal tagihan ini jatuh tempo. Sebelum tanggal ini tagihan berstatus '
  '''terjadwal'' dan belum menimbulkan jurnal; sejak tanggal ini piutang & '
  'pendapatan diakui, dan bila lewat tanpa pelunasan tagihan menjadi tunggakan.';

-- ── 2. Hari jatuh tempo per jenis pembayaran ────────────────────────────────
-- Mis. SPP jatuh tempo tanggal 10 tiap bulan. NULL = pakai default sistem (10).
ALTER TABLE public.jenis_pembayaran
  ADD COLUMN IF NOT EXISTS hari_jatuh_tempo integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jenis_pembayaran_hari_jatuh_tempo_check'
      AND conrelid = 'public.jenis_pembayaran'::regclass
  ) THEN
    ALTER TABLE public.jenis_pembayaran
      ADD CONSTRAINT jenis_pembayaran_hari_jatuh_tempo_check
      CHECK (hari_jatuh_tempo IS NULL OR hari_jatuh_tempo BETWEEN 1 AND 31);
  END IF;
END $$;

COMMENT ON COLUMN public.jenis_pembayaran.hari_jatuh_tempo IS
  'Tanggal berapa dalam bulan tagihan jenis ini jatuh tempo (1-31). NULL = 10. '
  'Nilai yang melewati akhir bulan otomatis dipotong ke hari terakhir bulan tsb.';

-- ── 3. Izinkan status 'terjadwal' ───────────────────────────────────────────
-- CATATAN: daftar status di bawah adalah gabungan SELURUH status yang dipakai
-- aplikasi (lihat migrasi 20260615120000 -- 'sebagian' & 'dihapusbuku' sudah
-- dipakai di DB live). Jangan persempit daftarnya.
CREATE OR REPLACE FUNCTION public.validate_tagihan_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN (
    'terjadwal', 'belum_bayar', 'sebagian', 'lunas', 'dihapusbuku', 'dibatalkan'
  ) THEN
    RAISE EXCEPTION 'status tagihan tidak valid: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

-- ── 4. Fungsi bantu: hitung tanggal jatuh tempo sebuah tagihan ──────────────
-- Tahun kalender sebuah `bulan` diturunkan dari bulan awal periodenya, supaya
-- rumus yang sama benar untuk KEDUA konvensi periode yang hidup berdampingan
-- di sistem ini:
--   * tahun buku  Januari-Desember (mulai bulan 1)  -> semua bulan 1..12 jatuh
--     di tahun yang sama dengan tanggal_mulai
--   * tahun ajaran Juli-Juni       (mulai bulan 7)  -> bulan 7..12 di tahun
--     tanggal_mulai, bulan 1..6 di tahun berikutnya
-- Dengan begitu tidak perlu meng-hardcode asumsi Juli-Juni yang akan salah
-- untuk tahun buku, atau sebaliknya.
--
-- p_periode_id dicari di `tahun_buku` dulu baru `tahun_ajaran`: kolom FK
-- tagihan.tahun_ajaran_id memang menunjuk ke tahun_buku (lihat pemisahan
-- tahun_ajaran/tahun_buku), tapi UUID keduanya sengaja disamakan sehingga
-- data lama tetap bisa di-resolve lewat tahun_ajaran.
CREATE OR REPLACE FUNCTION public.hitung_jatuh_tempo_tagihan(
  p_periode_id uuid,
  p_bulan integer,
  p_hari integer DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mulai       date;
  v_hari        integer := COALESCE(p_hari, 10);
  v_tahun       integer;
  v_akhir_bulan date;
BEGIN
  SELECT tanggal_mulai INTO v_mulai FROM tahun_buku WHERE id = p_periode_id;
  IF v_mulai IS NULL THEN
    SELECT tanggal_mulai INTO v_mulai FROM tahun_ajaran WHERE id = p_periode_id;
  END IF;

  -- Periode tanpa tanggal_mulai tidak bisa dihitung jatuh temponya.
  IF v_mulai IS NULL THEN
    RETURN NULL;
  END IF;

  -- Tagihan sekali bayar (bulan NULL, mis. uang pangkal / daftar ulang):
  -- jatuh tempo di awal periode.
  IF p_bulan IS NULL OR p_bulan < 1 OR p_bulan > 12 THEN
    RETURN v_mulai;
  END IF;

  v_tahun := extract(year from v_mulai)::integer
    + CASE WHEN p_bulan >= extract(month from v_mulai)::integer THEN 0 ELSE 1 END;

  -- Hari terakhir bulan tsb.
  v_akhir_bulan := (make_date(v_tahun, p_bulan, 1) + interval '1 month')::date - 1;

  -- Potong SEBELUM make_date: make_date(2027, 2, 31) melempar
  -- "date field value out of range", jadi tidak bisa mengandalkan LEAST()
  -- setelah tanggalnya terlanjur dibentuk.
  RETURN make_date(
    v_tahun,
    p_bulan,
    LEAST(GREATEST(v_hari, 1), extract(day from v_akhir_bulan)::integer)
  );
END;
$$;

COMMENT ON FUNCTION public.hitung_jatuh_tempo_tagihan(uuid, integer, integer) IS
  'Tanggal jatuh tempo tagihan untuk sebuah periode + bulan. Tahun kalender '
  'diturunkan dari bulan awal periode sehingga benar untuk tahun buku '
  '(Jan-Des) maupun tahun ajaran (Jul-Jun).';

-- ── 5. Index pendukung job akrual harian ────────────────────────────────────
-- Job hanya memindai tagihan 'terjadwal' yang jatuh temponya sudah lewat.
CREATE INDEX IF NOT EXISTS idx_tagihan_status_jatuh_tempo
  ON public.tagihan (status, jatuh_tempo);

-- ── 6. Backfill jatuh tempo untuk tagihan yang sudah ada ────────────────────
-- Status baris lama TIDAK diubah: jurnal piutangnya sudah terlanjur diposting,
-- jadi mengembalikannya ke 'terjadwal' justru akan membuat jurnal dan status
-- tidak sinkron. Yang diisi hanya tanggal jatuh temponya, supaya laporan
-- tunggakan/umur piutang bisa langsung bekerja di atas data lama.
UPDATE public.tagihan t
SET jatuh_tempo = public.hitung_jatuh_tempo_tagihan(
      t.tahun_ajaran_id, t.bulan, jp.hari_jatuh_tempo
    )
FROM public.jenis_pembayaran jp
WHERE jp.id = t.jenis_id
  AND t.jatuh_tempo IS NULL;
