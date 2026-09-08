import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TarifAtomikRow {
  jenis_id: string;
  siswa_id?: string | null;
  kelas_id?: string | null;
  angkatan_id?: string | null;
  tahun_ajaran_id: string;
  nominal: number;
  keterangan?: string | null;
}

export interface GenerateGroupAtomik {
  tahun_buku_id: string;
  bulan_list: Array<number | null>;
}

export interface SimpanTarifGenerateAtomikInput {
  tarif_rows: TarifAtomikRow[];
  tahun_akademik_id: string;
  jenis_id: string;
  generate_groups: GenerateGroupAtomik[];
  departemen_id?: string | null;
  siswa_ids?: string[] | null;
  siswa_id?: string | null;
  kelas_id?: string | null;
  angkatan_id?: string | null;
}

export interface SimpanTarifGenerateAtomikResult {
  success: boolean;
  tarif_inserted: number;
  generated: number;
  skipped: number;
  scheduled: number;
}

export function useSimpanTarifGenerateAtomik() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SimpanTarifGenerateAtomikInput) => {
      const { data, error } = await (supabase as any).rpc(
        "simpan_tarif_dan_generate_atomik",
        {
          p_tarif_rows: input.tarif_rows,
          p_tahun_akademik_id: input.tahun_akademik_id,
          p_jenis_id: input.jenis_id,
          p_generate_groups: input.generate_groups,
          p_departemen_id: input.departemen_id || null,
          p_siswa_ids: input.siswa_ids?.length ? input.siswa_ids : null,
          p_siswa_id: input.siswa_id || null,
          p_kelas_id: input.kelas_id || null,
          p_angkatan_id: input.angkatan_id || null,
        }
      );
      if (error) throw error;
      return data as SimpanTarifGenerateAtomikResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tarif_tagihan"] });
      qc.invalidateQueries({ queryKey: ["tagihan"] });
      qc.invalidateQueries({ queryKey: ["jurnal"] });

      const scheduledInfo = data.scheduled > 0
        ? `, ${data.scheduled} belum jatuh tempo`
        : "";
      toast.success(
        `Tarif & tagihan berhasil disimpan atomik: ${data.tarif_inserted} tarif, ${data.generated} tagihan baru, ${data.skipped} sudah ada${scheduledInfo}`
      );
    },
    onError: (e: any) => {
      toast.error(`Tarif dan tagihan dibatalkan/rollback: ${e.message}`);
    },
  });
}
