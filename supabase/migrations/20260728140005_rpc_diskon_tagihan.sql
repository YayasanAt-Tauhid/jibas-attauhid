-- ─────────────────────────────────────────────────────────────────────────────
-- Mesin perhitungan & penerapan diskon
--
-- Tiga lapis:
--   1. hitung_bulan_periode_tagihan  -- (periode, bulan) -> tanggal 1 bulan itu
--   2. hitung_diskon_tagihan         -- berapa potongan untuk satu tagihan
--   3. terapkan_diskon_siswa         -- terapkan ke tagihan yang SUDAH ada
--   4. putuskan_diskon_siswa         -- setujui/tolak (sekretaris yayasan)
--
-- KENAPA (3) PERLU ADA: sekolah meng-input SPP bertahun-tahun di muka, jadi
-- saat sebuah keringanan diberikan, tagihannya hampir selalu SUDAH ter-generate
-- (berstatus 'terjadwal'). Kalau diskon hanya dihitung di generate_tagihan_batch,
-- keringanan yang diberikan hari ini tidak akan pernah kena ke tagihan mana pun.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Bulan kalender sebuah tagihan ────────────────────────────────────────
-- Rumus penurunan tahunnya HARUS sama dengan hitung_jatuh_tempo_tagihan (dan
-- kembarannya di TS, src/lib/jatuhTempo.ts): tahun diturunkan dari bulan awal
-- periode, sehingga benar untuk tahun buku (Jan-Des) maupun tahun ajaran
-- (Jul-Jun). Kalau salah satu diubah, ubah semuanya.
CREATE OR REPLACE FUNCTION public.hitung_bulan_periode_tagihan(
  p_periode_id uuid,
  p_bulan integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mulai date;
  v_tahun integer;
BEGIN
  SELECT tanggal_mulai INTO v_mulai FROM tahun_buku WHERE id = p_periode_id;
  IF v_mulai IS NULL THEN
    SELECT tanggal_mulai INTO v_mulai FROM tahun_ajaran WHERE id = p_periode_id;
  END IF;

  IF v_mulai IS NULL THEN
    RETURN NULL;
  END IF;

  -- Tagihan sekali bayar (bulan NULL, mis. uang pangkal): dianggap jatuh di
  -- bulan awal periode -- konsisten dengan hitung_jatuh_tempo_tagihan.
  IF p_bulan IS NULL OR p_bulan < 1 OR p_bulan > 12 THEN
    RETURN date_trunc('month', v_mulai)::date;
  END IF;

  v_tahun := extract(year from v_mulai)::integer
    + CASE WHEN p_bulan >= extract(month from v_mulai)::integer THEN 0 ELSE 1 END;

  RETURN make_date(v_tahun, p_bulan, 1);
END;
$function$;

COMMENT ON FUNCTION public.hitung_bulan_periode_tagihan(uuid, integer) IS
  'Tanggal 1 dari bulan kalender yang dimaksud sebuah (periode, bulan) tagihan. '
  'Dipakai mencocokkan tagihan dengan rentang berlaku siswa_diskon.';

-- ── 2. Potongan untuk satu tagihan ──────────────────────────────────────────
-- Mengembalikan 0 kalau tidak ada diskon yang berlaku. Karena EXCLUDE
-- constraint di siswa_diskon menjamin tidak ada rentang yang tumpang tindih
-- untuk siswa+jenis yang sama, paling banyak SATU baris bisa cocok -- LIMIT 1
-- di bawah adalah jaring pengaman, bukan pemilihan sembarang.
CREATE OR REPLACE FUNCTION public.hitung_diskon_tagihan(
  p_siswa_id      uuid,
  p_jenis_id      uuid,
  p_periode_id    uuid,
  p_bulan         integer,
  p_nominal_bruto numeric
)
RETURNS TABLE(nominal_diskon numeric, siswa_diskon_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bulan_periode date;
  v_sd            record;
  v_nilai         numeric;
  v_diskon        numeric := 0;
BEGIN
  IF p_nominal_bruto IS NULL OR p_nominal_bruto <= 0 THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  v_bulan_periode := hitung_bulan_periode_tagihan(p_periode_id, p_bulan);
  IF v_bulan_periode IS NULL THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  SELECT sd.id, sd.nilai, sk.tipe, sk.nilai_default
  INTO v_sd
  FROM siswa_diskon sd
  JOIN skema_diskon sk ON sk.id = sd.skema_diskon_id
  WHERE sd.siswa_id = p_siswa_id
    AND sd.jenis_id = p_jenis_id
    AND sd.status   = 'disetujui'
    AND sk.aktif
    AND v_bulan_periode BETWEEN sd.periode_mulai AND sd.periode_selesai
  ORDER BY sd.diputuskan_at DESC NULLS LAST, sd.diajukan_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  v_nilai := COALESCE(v_sd.nilai, v_sd.nilai_default, 0);

  IF v_sd.tipe = 'persen' THEN
    v_diskon := round(p_nominal_bruto * LEAST(GREATEST(v_nilai, 0), 100) / 100, 2);
  ELSE
    v_diskon := round(GREATEST(v_nilai, 0), 2);
  END IF;

  -- Potongan tidak boleh melebihi tarifnya sendiri (tagihan negatif = uang
  -- sekolah berutang ke siswa; bukan itu yang dimaksud keringanan).
  v_diskon := LEAST(v_diskon, p_nominal_bruto);

  RETURN QUERY SELECT v_diskon, v_sd.id;
END;
$function$;

COMMENT ON FUNCTION public.hitung_diskon_tagihan(uuid, uuid, uuid, integer, numeric) IS
  'Besar potongan yang berlaku untuk satu tagihan + baris siswa_diskon '
  'sumbernya. 0 bila tidak ada keringanan aktif. Potongan di-cap ke tarif bruto.';

-- ── 3. Terapkan diskon ke tagihan yang sudah ada ────────────────────────────
-- Perlakuan per status tagihan:
--   'terjadwal'    -> belum punya jurnal sama sekali: cukup UPDATE nominal.
--   'belum_bayar'  -> piutang sudah diakui: butuh JURNAL KOREKSI
--                        (D) Potongan/Keringanan   (K) Piutang Siswa
--                     sebesar selisih potongan. Jurnal lama TIDAK diedit --
--                     mengikuti pola repo ini yang selalu menambah jurnal baru,
--                     tidak pernah mengubah jurnal 'posted'.
--   lainnya        -> dilewati & dilaporkan. Tagihan yang sudah lunas/sebagian
--                     menyangkut uang yang benar-benar sudah diterima, jadi
--                     pemberian keringanan atasnya adalah keputusan refund --
--                     bukan sesuatu yang boleh diputuskan diam-diam oleh job.
CREATE OR REPLACE FUNCTION public.terapkan_diskon_siswa(
  p_siswa_diskon_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sd            record;
  v_potongan_akun uuid;
  v_potongan_glob uuid;
  v_piutang_akun  uuid;
  v_pegawai_id    uuid;
  v_tahun         integer := extract(year from current_date)::integer;
  v_row           record;
  v_bruto         numeric;
  v_diskon        numeric;
  v_selisih       numeric;
  v_netto         numeric;
  v_jurnal_id     uuid;
  v_nomor         text;
  v_dept_id       uuid;
  v_terjadwal     integer := 0;
  v_dikoreksi     integer := 0;
  v_dilewati      integer := 0;
  v_total         numeric := 0;
  v_errors        text[] := '{}';
BEGIN
  SELECT sd.*, jp.nama AS jenis_nama, jp.akun_potongan_id
  INTO v_sd
  FROM siswa_diskon sd
  JOIN jenis_pembayaran jp ON jp.id = sd.jenis_id
  WHERE sd.id = p_siswa_diskon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data diskon siswa tidak ditemukan';
  END IF;

  IF v_sd.status <> 'disetujui' THEN
    RAISE EXCEPTION 'Diskon belum disetujui (status: %)', v_sd.status;
  END IF;

  SELECT akun_id INTO v_potongan_glob
  FROM pengaturan_akun WHERE kode_setting = 'AKUN_POTONGAN_PENDAPATAN';

  v_potongan_akun := COALESCE(v_sd.akun_potongan_id, v_potongan_glob);

  IF v_potongan_akun IS NULL THEN
    RAISE EXCEPTION 'Akun potongan/keringanan belum dikonfigurasi di Pengaturan Akun';
  END IF;

  SELECT akun_id INTO v_piutang_akun
  FROM pengaturan_akun WHERE kode_setting = 'piutang_siswa';

  IF v_piutang_akun IS NULL THEN
    RAISE EXCEPTION 'Akun piutang siswa belum dikonfigurasi di Pengaturan Akun';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT pegawai_id INTO v_pegawai_id FROM users_profile WHERE id = p_user_id;
  END IF;

  FOR v_row IN
    SELECT t.id, t.status, t.nominal, t.nominal_bruto, t.nominal_diskon,
           t.bulan, t.kelas_id, t.siswa_id, t.jurnal_piutang_id
    FROM tagihan t
    WHERE t.siswa_id = v_sd.siswa_id
      AND t.jenis_id = v_sd.jenis_id
      AND hitung_bulan_periode_tagihan(t.tahun_ajaran_id, t.bulan)
            BETWEEN v_sd.periode_mulai AND v_sd.periode_selesai
    ORDER BY t.jatuh_tempo NULLS LAST, t.id
  LOOP
    BEGIN
      v_bruto := COALESCE(v_row.nominal_bruto, v_row.nominal);

      -- Dihitung langsung dari skema baris siswa_diskon INI (bukan lewat
      -- hitung_diskon_tagihan): pencocokan periode sudah dikerjakan di WHERE
      -- loop, dan kalau baris ini baru saja disetujui, memanggil pencari
      -- "diskon yang berlaku" justru berisiko memilih baris lain.
      SELECT CASE
               WHEN sk.tipe = 'persen'
                 THEN round(v_bruto * LEAST(GREATEST(COALESCE(v_sd.nilai, sk.nilai_default, 0), 0), 100) / 100, 2)
               ELSE round(GREATEST(COALESCE(v_sd.nilai, sk.nilai_default, 0), 0), 2)
             END
      INTO v_diskon
      FROM skema_diskon sk WHERE sk.id = v_sd.skema_diskon_id;

      v_diskon := LEAST(COALESCE(v_diskon, 0), v_bruto);
      v_netto  := v_bruto - v_diskon;
      v_selisih := v_diskon - COALESCE(v_row.nominal_diskon, 0);

      IF v_selisih = 0 THEN
        CONTINUE;                        -- sudah sesuai, tidak perlu disentuh
      END IF;

      IF v_row.status = 'terjadwal' THEN
        -- Belum ada jurnal apa pun: cukup ubah angkanya.
        UPDATE tagihan
        SET nominal         = v_netto,
            nominal_bruto   = v_bruto,
            nominal_diskon  = v_diskon,
            siswa_diskon_id = v_sd.id
        WHERE id = v_row.id AND status = 'terjadwal';

        IF FOUND THEN
          v_terjadwal := v_terjadwal + 1;
          v_total := v_total + v_selisih;
        END IF;

      ELSIF v_row.status = 'belum_bayar' AND v_row.jurnal_piutang_id IS NOT NULL THEN
        -- Piutang sudah diakui sebesar bruto: koreksi lewat jurnal baru.
        v_dept_id := NULL;
        IF v_row.kelas_id IS NOT NULL THEN
          SELECT departemen_id INTO v_dept_id FROM kelas WHERE id = v_row.kelas_id;
        END IF;
        IF v_dept_id IS NULL THEN
          SELECT departemen_id INTO v_dept_id FROM siswa WHERE id = v_row.siswa_id;
        END IF;

        v_nomor := generate_nomor_jurnal('JKD', v_tahun);

        INSERT INTO jurnal (nomor, tanggal, keterangan, referensi, departemen_id,
                            total_debit, total_kredit, status, dibuat_oleh)
        VALUES (
          v_nomor, current_date,
          'Keringanan ' || v_sd.jenis_nama
            || CASE WHEN v_row.bulan IS NOT NULL THEN '-B' || v_row.bulan ELSE '' END
            || ' - siswa ' || v_row.siswa_id,
          v_row.id::text, v_dept_id,
          abs(v_selisih), abs(v_selisih), 'posted', v_pegawai_id
        )
        RETURNING id INTO v_jurnal_id;

        IF v_selisih > 0 THEN
          -- Potongan bertambah: piutang berkurang.
          INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
          VALUES
            (v_jurnal_id, v_potongan_akun, 'Keringanan ' || v_sd.jenis_nama, v_selisih, 0, 1),
            (v_jurnal_id, v_piutang_akun,  'Piutang ' || v_sd.jenis_nama,    0, v_selisih, 2);
        ELSE
          -- Potongan berkurang/dicabut: piutang kembali bertambah.
          INSERT INTO jurnal_detail (jurnal_id, akun_id, keterangan, debit, kredit, urutan)
          VALUES
            (v_jurnal_id, v_piutang_akun,  'Piutang ' || v_sd.jenis_nama,    -v_selisih, 0, 1),
            (v_jurnal_id, v_potongan_akun, 'Koreksi keringanan ' || v_sd.jenis_nama, 0, -v_selisih, 2);
        END IF;

        UPDATE tagihan
        SET nominal         = v_netto,
            nominal_bruto   = v_bruto,
            nominal_diskon  = v_diskon,
            siswa_diskon_id = v_sd.id
        WHERE id = v_row.id AND status = 'belum_bayar';

        IF NOT FOUND THEN
          -- Kalah balapan (mis. baru saja dibayar): buang jurnal koreksinya.
          DELETE FROM jurnal_detail WHERE jurnal_id = v_jurnal_id;
          DELETE FROM jurnal WHERE id = v_jurnal_id;
          v_dilewati := v_dilewati + 1;
          CONTINUE;
        END IF;

        v_dikoreksi := v_dikoreksi + 1;
        v_total := v_total + v_selisih;

      ELSE
        v_dilewati := v_dilewati + 1;
        v_errors := v_errors ||
          ('Tagihan ' || v_row.id || ' berstatus "' || v_row.status ||
           '" -- keringanan tidak diterapkan otomatis, perlu penanganan manual');
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || ('Tagihan ' || v_row.id || ': ' || SQLERRM);
    END;
  END LOOP;

  UPDATE siswa_diskon SET diterapkan_at = now() WHERE id = v_sd.id;

  RETURN jsonb_build_object(
    'siswa_diskon_id',   v_sd.id,
    'terjadwal_diubah',  v_terjadwal,
    'dikoreksi_jurnal',  v_dikoreksi,
    'dilewati',          v_dilewati,
    'total_potongan',    v_total,
    'errors',            to_jsonb(v_errors)
  );
END;
$function$;

COMMENT ON FUNCTION public.terapkan_diskon_siswa(uuid, uuid) IS
  'Menerapkan diskon yang sudah disetujui ke tagihan yang sudah ada. Tagihan '
  'terjadwal diubah langsung; tagihan belum_bayar dikoreksi lewat jurnal baru '
  '(D Potongan / K Piutang). Tagihan lunas/sebagian dilewati & dilaporkan.';

-- ── 4. Keputusan sekretaris yayasan ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.putuskan_diskon_siswa(
  p_siswa_diskon_id uuid,
  p_setujui boolean,
  p_user_id uuid,
  p_alasan text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status_lama text;
  v_hasil       jsonb;
BEGIN
  IF NOT public.is_penyetuju_diskon(p_user_id) THEN
    RAISE EXCEPTION 'Hanya sekretaris yayasan yang berhak memutuskan pengajuan diskon';
  END IF;

  SELECT status INTO v_status_lama FROM siswa_diskon WHERE id = p_siswa_diskon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan diskon tidak ditemukan';
  END IF;

  IF v_status_lama <> 'diajukan' THEN
    RAISE EXCEPTION 'Pengajuan sudah diputuskan sebelumnya (status: %)', v_status_lama;
  END IF;

  IF NOT p_setujui AND btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;

  UPDATE siswa_diskon
  SET status           = CASE WHEN p_setujui THEN 'disetujui' ELSE 'ditolak' END,
      diputuskan_oleh  = p_user_id,
      diputuskan_at    = now(),
      alasan_penolakan = CASE WHEN p_setujui THEN NULL ELSE btrim(p_alasan) END
  WHERE id = p_siswa_diskon_id AND status = 'diajukan';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan sudah diputuskan oleh proses lain';
  END IF;

  IF NOT p_setujui THEN
    RETURN jsonb_build_object('status', 'ditolak', 'siswa_diskon_id', p_siswa_diskon_id);
  END IF;

  -- Disetujui -> langsung kena ke tagihan yang sudah ter-generate.
  v_hasil := terapkan_diskon_siswa(p_siswa_diskon_id, p_user_id);

  RETURN jsonb_build_object('status', 'disetujui', 'penerapan', v_hasil);
END;
$function$;

COMMENT ON FUNCTION public.putuskan_diskon_siswa(uuid, boolean, uuid, text) IS
  'Sekretaris yayasan menyetujui/menolak pengajuan diskon. Persetujuan langsung '
  'menerapkan potongan ke tagihan yang sudah ada.';

-- Semua RPC di atas mengubah data / memposting jurnal dan hanya dipanggil dari
-- src/server/diskon.ts -> kunci ke service_role, ikuti pola migrasi
-- 20260728110000. REVOKE FROM PUBLIC dulu: privilege bisa datang dari grant
-- implisit ke PUBLIC, sehingga REVOKE FROM anon saja tidak menutup aksesnya.
REVOKE ALL ON FUNCTION public.terapkan_diskon_siswa(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.putuskan_diskon_siswa(uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terapkan_diskon_siswa(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.putuskan_diskon_siswa(uuid, boolean, uuid, text) TO service_role;

-- Fungsi hitung juga dikunci ke service_role, TERMASUK dari authenticated.
-- Alasannya bukan sekadar kehati-hatian: hitung_diskon_tagihan menerima
-- siswa_id sembarang dan mengembalikan besar keringanannya, jadi akun
-- authenticated mana pun (termasuk akun orang tua) bisa menyisir UUID siswa
-- lain untuk mengetahui siapa menerima beasiswa/keringanan berapa. Itu
-- informasi pribadi keluarga, bukan angka publik.
--
-- Aman untuk dikunci: keduanya dipanggil dari DALAM fungsi SECURITY DEFINER
-- lain (generate_tagihan_batch, terapkan_diskon_siswa) yang berjalan dengan
-- hak pemilik fungsi, sehingga pemanggil tidak perlu punya EXECUTE sendiri.
-- Preview diskon di UI dihitung dari skema_diskon/siswa_diskon yang memang
-- sudah dibatasi RLS, bukan lewat RPC ini.
REVOKE ALL ON FUNCTION public.hitung_bulan_periode_tagihan(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hitung_diskon_tagihan(uuid, uuid, uuid, integer, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hitung_bulan_periode_tagihan(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.hitung_diskon_tagihan(uuid, uuid, uuid, integer, numeric) TO service_role;
