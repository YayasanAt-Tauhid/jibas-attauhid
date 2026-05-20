import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAngkatan() {
  return useQuery({
    queryKey: ["angkatan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("angkatan")
        .select("*, departemen:departemen_id(id, nama)")
        .order("nama", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDepartemen() {
  return useQuery({
    queryKey: ["departemen"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departemen")
        .select("*")
        .eq("aktif", true)
        .order("nama");
      if (error) throw error;
      return data;
    },
  });
}

// Bug A1/A2 fix: Referensi Akademik & PSB hanya butuh unit pendidikan
export function useDepartemenPendidikan() {
  return useQuery({
    queryKey: ["departemen", "unit_pendidikan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departemen")
        .select("*")
        .eq("aktif", true)
        .eq("kategori", "unit_pendidikan")
        .order("nama");
      if (error) throw error;
      return data;
    },
  });
}

// Bug A4 fix: jika departemenId === null (belum dipilih), return array kosong tanpa fetch.
// Jika departemenId === undefined, fetch semua (backward compat untuk konteks lain).
export function useTingkat(departemenId?: string | null) {
  return useQuery({
    queryKey: ["tingkat", departemenId],
    queryFn: async () => {
      // null berarti "belum dipilih departemen" → tidak ada tingkat yang ditampilkan
      if (departemenId === null) return [];
      let q = supabase.from("tingkat").select("*").eq("aktif", true).order("urutan");
      if (departemenId) q = q.eq("departemen_id", departemenId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    // Jika null, skip query sepenuhnya
    enabled: departemenId !== null,
  });
}

export function useKelas(tingkatId?: string) {
  return useQuery({
    queryKey: ["kelas", tingkatId],
    queryFn: async () => {
      let q = supabase
        .from("kelas")
        .select("*, tingkat:tingkat_id(id, nama), departemen:departemen_id(id, nama)")
        .eq("aktif", true)
        .order("nama");
      if (tingkatId) q = q.eq("tingkat_id", tingkatId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });
}

export function useTahunAjaran() {
  return useQuery({
    queryKey: ["tahun_ajaran"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tahun_ajaran")
        .select("*")
        .order("nama", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSemester(tahunAjaranId?: string) {
  return useQuery({
    queryKey: ["semester", tahunAjaranId],
    queryFn: async () => {
      let q = supabase.from("semester").select("*").order("urutan");
      if (tahunAjaranId) q = q.eq("tahun_ajaran_id", tahunAjaranId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
