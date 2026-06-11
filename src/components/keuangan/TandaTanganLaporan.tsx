import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Blok tanda tangan Ketua Yayasan & Bendahara — hanya tampil saat dicetak.
 * Nama diambil dari Pengaturan → Profil Yayasan (tabel sekolah).
 */
export default function TandaTanganLaporan() {
  const { data: sekolah } = useQuery({
    queryKey: ["profil_sekolah_ttd"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sekolah")
        .select("kota, kepala_sekolah, bendahara")
        .maybeSingle();
      return data;
    },
    staleTime: Infinity,
  });

  const now = new Date();
  const tanggal = `${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
  const tempatTanggal = [sekolah?.kota, tanggal].filter(Boolean).join(", ");

  return (
    <div className="hidden print:block mt-10 break-inside-avoid">
      <p className="text-right mb-2">{tempatTanggal}</p>
      <div className="flex justify-between text-center">
        <div className="w-64">
          <p>Bendahara,</p>
          <div className="h-20" />
          <p className="font-bold underline">{(sekolah as any)?.bendahara || "(................................)"}</p>
        </div>
        <div className="w-64">
          <p>Ketua Yayasan,</p>
          <div className="h-20" />
          <p className="font-bold underline">{sekolah?.kepala_sekolah || "(................................)"}</p>
        </div>
      </div>
    </div>
  );
}
