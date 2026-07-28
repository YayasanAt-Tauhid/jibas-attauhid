-- ─────────────────────────────────────────────────────────────────────────────
-- Identitas keluarga (untuk potongan kakak-adik)
--
-- Sistem ini tidak menyimpan NIK/No. KK di mana pun, jadi tidak ada identitas
-- keluarga yang bisa dipakai untuk mendeteksi kakak-adik secara pasti.
-- Pendekatannya: SISTEM MENYARANKAN, ADMIN MENGONFIRMASI SEKALI, hasilnya
-- tersimpan permanen di siswa.keluarga_id -- bukan dihitung ulang tiap kali.
--
-- Alasan tidak auto-apply: kecocokan nama orang tua adalah heuristik. "Ahmad"
-- di dua berkas bisa saja dua orang berbeda; menggabungkan dua keluarga secara
-- diam-diam lalu memberi potongan kakak-adik ke anak yang salah adalah
-- kesalahan finansial yang sulit terdeteksi. Saran + konfirmasi manual membuat
-- kesalahan itu tertahan di depan mata admin.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabel keluarga ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.keluarga (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        text NOT NULL,
  keterangan  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.keluarga IS
  'Kelompok keluarga (kakak-adik) hasil konfirmasi admin atas saran '
  'saran_kelompok_keluarga(). Dipakai untuk potongan kakak-adik.';

-- ── 2. Kolom keluarga_id di siswa ───────────────────────────────────────────
ALTER TABLE public.siswa
  ADD COLUMN IF NOT EXISTS keluarga_id uuid REFERENCES public.keluarga(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.siswa.keluarga_id IS
  'Kelompok keluarga siswa. NULL = belum dikelompokkan. Diisi lewat konfirmasi '
  'admin atas saran sistem, bukan otomatis.';

CREATE INDEX IF NOT EXISTS idx_siswa_keluarga ON public.siswa (keluarga_id)
  WHERE keluarga_id IS NOT NULL;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.keluarga ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_keluarga" ON public.keluarga;
CREATE POLICY "auth_read_keluarga" ON public.keluarga
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_keuangan_manage_keluarga" ON public.keluarga;
CREATE POLICY "admin_keuangan_manage_keluarga" ON public.keluarga
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_kepala(auth.uid())
    OR public.has_role(auth.uid(), 'keuangan')
    OR public.is_penyetuju_diskon(auth.uid())
  )
  WITH CHECK (
    public.is_admin_or_kepala(auth.uid())
    OR public.has_role(auth.uid(), 'keuangan')
    OR public.is_penyetuju_diskon(auth.uid())
  );

-- ── 4. Saran pengelompokan keluarga ─────────────────────────────────────────
-- Menggabungkan dua sinyal, dari yang terkuat:
--   1. satu akun ortu (ortu_siswa.user_id) terhubung ke >1 siswa -- ini bukan
--      tebakan, orang tuanya sendiri yang mendaftarkan anak-anaknya
--   2. kecocokan persis nama_ayah + nama_ibu (dinormalisasi: lowercase, spasi
--      dirapikan) -- keduanya harus terisi; satu nama saja terlalu lemah
--      ("Siti" bisa ibu dari puluhan siswa yang tidak bersaudara)
--
-- Siswa yang sudah punya keluarga_id tidak ikut disarankan lagi.
CREATE OR REPLACE FUNCTION public.saran_kelompok_keluarga(p_limit integer DEFAULT 200)
RETURNS TABLE(
  sumber        text,
  kunci         text,
  skor          integer,
  jumlah_siswa  integer,
  siswa         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_admin_or_kepala(auth.uid())
    OR public.has_role(auth.uid(), 'keuangan')
    OR public.is_penyetuju_diskon(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Tidak diizinkan melihat saran kelompok keluarga';
  END IF;

  RETURN QUERY
  WITH kandidat AS (
    -- Sinyal 1: satu akun ortu -> banyak anak
    SELECT
      'akun_ortu'::text AS sumber,
      os.user_id::text  AS kunci,
      100               AS skor,
      s.id              AS siswa_id,
      s.nama            AS siswa_nama,
      s.nis             AS siswa_nis,
      s.tanggal_lahir   AS siswa_tanggal_lahir
    FROM ortu_siswa os
    JOIN siswa s ON s.id = os.siswa_id
    WHERE s.keluarga_id IS NULL

    UNION ALL

    -- Sinyal 2: nama ayah + ibu cocok persis (keduanya wajib terisi)
    SELECT
      'nama_ortu'::text,
      lower(btrim(regexp_replace(sd.nama_ayah, '\s+', ' ', 'g'))) || ' & ' ||
      lower(btrim(regexp_replace(sd.nama_ibu,  '\s+', ' ', 'g'))),
      60,
      s.id, s.nama, s.nis, s.tanggal_lahir
    FROM siswa_detail sd
    JOIN siswa s ON s.id = sd.siswa_id
    WHERE s.keluarga_id IS NULL
      AND btrim(COALESCE(sd.nama_ayah, '')) <> ''
      AND btrim(COALESCE(sd.nama_ibu,  '')) <> ''
  ),
  digrup AS (
    SELECT
      k.sumber,
      k.kunci,
      max(k.skor)                    AS skor,
      count(DISTINCT k.siswa_id)::int AS jumlah_siswa,
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'siswa_id',      k.siswa_id,
          'nama',          k.siswa_nama,
          'nis',           k.siswa_nis,
          'tanggal_lahir', k.siswa_tanggal_lahir
        )
      ) AS siswa
    FROM kandidat k
    GROUP BY k.sumber, k.kunci
  )
  SELECT d.sumber, d.kunci, d.skor, d.jumlah_siswa, d.siswa
  FROM digrup d
  WHERE d.jumlah_siswa > 1          -- sendirian bukan "kakak-adik"
  ORDER BY d.skor DESC, d.jumlah_siswa DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END;
$function$;

COMMENT ON FUNCTION public.saran_kelompok_keluarga(integer) IS
  'Daftar kandidat kelompok kakak-adik untuk DIREVIEW admin (bukan diterapkan '
  'otomatis). Skor 100 = satu akun ortu, 60 = kecocokan nama ayah+ibu.';

REVOKE ALL ON FUNCTION public.saran_kelompok_keluarga(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saran_kelompok_keluarga(integer) TO authenticated, service_role;

-- ── 5. Konfirmasi saran jadi keluarga ───────────────────────────────────────
-- Atomik: buat baris keluarga + tandai seluruh siswanya sekaligus. Siswa yang
-- sudah punya keluarga_id TIDAK dipindahkan (guard di WHERE) supaya konfirmasi
-- yang tumpang tindih tidak diam-diam merombak pengelompokan yang sudah ada.
CREATE OR REPLACE FUNCTION public.konfirmasi_kelompok_keluarga(
  p_nama       text,
  p_siswa_ids  uuid[],
  p_user_id    uuid DEFAULT NULL,
  p_keterangan text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keluarga_id uuid;
  v_jumlah      integer;
BEGIN
  IF p_siswa_ids IS NULL OR array_length(p_siswa_ids, 1) IS NULL OR array_length(p_siswa_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Kelompok keluarga minimal berisi 2 siswa';
  END IF;

  IF btrim(COALESCE(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama keluarga wajib diisi';
  END IF;

  INSERT INTO keluarga (nama, keterangan, created_by)
  VALUES (btrim(p_nama), p_keterangan, p_user_id)
  RETURNING id INTO v_keluarga_id;

  UPDATE siswa
  SET keluarga_id = v_keluarga_id
  WHERE id = ANY(p_siswa_ids)
    AND keluarga_id IS NULL;

  GET DIAGNOSTICS v_jumlah = ROW_COUNT;

  IF v_jumlah < 2 THEN
    RAISE EXCEPTION
      'Hanya % siswa yang bisa dikelompokkan (sisanya sudah punya keluarga). Batal.', v_jumlah;
  END IF;

  RETURN v_keluarga_id;
END;
$function$;

COMMENT ON FUNCTION public.konfirmasi_kelompok_keluarga(text, uuid[], uuid, text) IS
  'Membuat kelompok keluarga dan menandai siswanya dalam satu transaksi. '
  'Siswa yang sudah punya keluarga tidak dipindahkan.';

REVOKE ALL ON FUNCTION public.konfirmasi_kelompok_keluarga(text, uuid[], uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.konfirmasi_kelompok_keluarga(text, uuid[], uuid, text) TO service_role;
