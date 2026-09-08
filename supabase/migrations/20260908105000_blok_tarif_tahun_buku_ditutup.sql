-- Cegah perubahan referensi tarif dan pembuatan tagihan baru ke Tahun Buku
-- Unit Pendidikan yang sudah ditutup.
--
-- Tarif tagihan merupakan bagian dari konfigurasi periode. Mengubah tarif pada
-- Tahun Buku yang sudah ditutup dapat mengubah hasil lookup historis, sedangkan
-- generate tagihan ke periode tertutup dapat membuat transaksi/jurnal baru
-- untuk periode yang seharusnya sudah final.

CREATE OR REPLACE FUNCTION public.is_tahun_buku_pendidikan_locked(
  p_tahun_buku_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN p_tahun_buku_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.tahun_buku tb
      WHERE tb.id = p_tahun_buku_id
        AND (
          COALESCE(tb.ditutup, false)
          OR EXISTS (
            SELECT 1
            FROM public.log_tutup_buku l
            WHERE l.unit = 'unit_pendidikan'
              AND (
                l.tahun_buku_id = tb.id
                OR l.tahun_ajaran_id = tb.id
              )
          )
        )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_tahun_buku_pendidikan_locked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tahun_buku_pendidikan_locked(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_tarif_tagihan_tahun_buku_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_nama text;
BEGIN
  -- UPDATE/DELETE tidak boleh mengubah histori tarif pada periode yang sudah
  -- ditutup, termasuk memindahkan baris tarif dari periode tertutup ke periode lain.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.tahun_ajaran_id IS NOT NULL
     AND public.is_tahun_buku_pendidikan_locked(OLD.tahun_ajaran_id)
  THEN
    SELECT nama INTO v_nama FROM public.tahun_buku WHERE id = OLD.tahun_ajaran_id;
    RAISE EXCEPTION 'Tarif tagihan tidak dapat diubah/dihapus: Tahun Buku "%" sudah ditutup untuk Unit Pendidikan',
      COALESCE(v_nama, OLD.tahun_ajaran_id::text)
      USING ERRCODE = '55000';
  END IF;

  -- INSERT/UPDATE tidak boleh menulis ke periode tertutup.
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.tahun_ajaran_id IS NOT NULL
     AND public.is_tahun_buku_pendidikan_locked(NEW.tahun_ajaran_id)
  THEN
    SELECT nama INTO v_nama FROM public.tahun_buku WHERE id = NEW.tahun_ajaran_id;
    RAISE EXCEPTION 'Tarif tagihan tidak dapat disimpan: Tahun Buku "%" sudah ditutup untuk Unit Pendidikan',
      COALESCE(v_nama, NEW.tahun_ajaran_id::text)
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tarif_tagihan_tahun_buku_locked ON public.tarif_tagihan;
CREATE TRIGGER guard_tarif_tagihan_tahun_buku_locked
BEFORE INSERT OR UPDATE OR DELETE ON public.tarif_tagihan
FOR EACH ROW
EXECUTE FUNCTION public.guard_tarif_tagihan_tahun_buku_locked();

-- Tagihan lama pada periode tertutup tetap boleh dilunasi/di-update statusnya.
-- Yang diblok hanya pembuatan TAGIHAN BARU ke periode yang sudah ditutup.
CREATE OR REPLACE FUNCTION public.guard_tagihan_insert_tahun_buku_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_nama text;
BEGIN
  IF NEW.tahun_ajaran_id IS NOT NULL
     AND public.is_tahun_buku_pendidikan_locked(NEW.tahun_ajaran_id)
  THEN
    SELECT nama INTO v_nama FROM public.tahun_buku WHERE id = NEW.tahun_ajaran_id;
    RAISE EXCEPTION 'Tagihan baru tidak dapat dibuat: Tahun Buku "%" sudah ditutup untuk Unit Pendidikan',
      COALESCE(v_nama, NEW.tahun_ajaran_id::text)
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tagihan_insert_tahun_buku_locked ON public.tagihan;
CREATE TRIGGER guard_tagihan_insert_tahun_buku_locked
BEFORE INSERT ON public.tagihan
FOR EACH ROW
EXECUTE FUNCTION public.guard_tagihan_insert_tahun_buku_locked();
