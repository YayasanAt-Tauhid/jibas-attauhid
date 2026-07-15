-- Lapis pengaman terakhir di level database: siswa yang dikenakan tarif
-- tagihan harus dari lembaga yang sama dengan jenis pembayaran, kalau jenis
-- itu scoped ke satu lembaga (departemen_id IS NOT NULL). Jenis pembayaran
-- "universal" (departemen_id NULL) tetap boleh dikenakan ke siswa manapun.
-- Ini menutup celah kalau UI dilewati (mis. lewat SQL langsung / bug baru)
-- sehingga akun jurnal (COA per jenis pembayaran) tidak tercampur antar
-- lembaga.
CREATE OR REPLACE FUNCTION public.validate_tarif_tagihan_lembaga()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_jenis_dept uuid;
  v_siswa_dept uuid;
BEGIN
  IF NEW.siswa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT departemen_id INTO v_jenis_dept FROM public.jenis_pembayaran WHERE id = NEW.jenis_id;
  IF v_jenis_dept IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT departemen_id INTO v_siswa_dept FROM public.siswa WHERE id = NEW.siswa_id;
  IF v_siswa_dept IS NOT NULL AND v_siswa_dept <> v_jenis_dept THEN
    RAISE EXCEPTION 'Siswa % bukan dari lembaga yang sesuai dengan jenis pembayaran ini', NEW.siswa_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tarif_tagihan_lembaga ON public.tarif_tagihan;
CREATE TRIGGER trg_validate_tarif_tagihan_lembaga
  BEFORE INSERT OR UPDATE ON public.tarif_tagihan
  FOR EACH ROW EXECUTE FUNCTION public.validate_tarif_tagihan_lembaga();
