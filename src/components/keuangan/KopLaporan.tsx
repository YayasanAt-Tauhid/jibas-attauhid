import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Kop surat untuk laporan keuangan — hanya tampil saat dicetak.
 * Mengambil identitas dari Pengaturan → Profil Yayasan (tabel sekolah).
 */
export default function KopLaporan() {
  const { data: sekolah } = useQuery({
    queryKey: ["profil_sekolah_kop"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sekolah")
        .select("nama, alamat, kota, telepon, email, logo_url")
        .maybeSingle();
      return data;
    },
    staleTime: Infinity,
  });

  if (!sekolah) return null;

  const alamat = [sekolah.alamat, sekolah.kota].filter(Boolean).join(", ");
  const kontak = [
    sekolah.telepon ? `Telp. ${sekolah.telepon}` : null,
    sekolah.email,
  ].filter(Boolean).join(" — ");

  return (
    <div className="hidden print:block mb-4">
      <div className="flex items-center justify-center gap-4 pb-3 border-b-4 border-double border-black">
        {sekolah.logo_url && (
          <img src={sekolah.logo_url} alt="" className="h-16 w-16 object-contain" />
        )}
        <div className="text-center">
          <p className="text-xl font-bold uppercase tracking-wide">{sekolah.nama}</p>
          {alamat && <p className="text-sm">{alamat}</p>}
          {kontak && <p className="text-sm">{kontak}</p>}
        </div>
      </div>
    </div>
  );
}
