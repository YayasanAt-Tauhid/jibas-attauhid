import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Badge,
  Card,
  ChoiceChips,
  EmptyState,
  Screen,
  Spinner,
  Subtitle,
  Title,
} from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function NilaiScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [selectedSiswa, setSelectedSiswa] = useState("");

  const { data: anakList = [] } = useQuery({
    queryKey: ["portal-anak-nilai", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select("siswa_id, siswa:siswa_id (id, nama, nis)")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const effectiveSiswa = selectedSiswa || (anakList[0] as any)?.siswa_id || "";

  const {
    data: nilai = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["portal-nilai", effectiveSiswa],
    queryFn: async () => {
      const { data } = await supabase
        .from("penilaian")
        .select(
          `
          *,
          mapel:mapel_id (nama, kode),
          kelas:kelas_id (nama),
          semester:semester_id (nama),
          tahun_ajaran:tahun_ajaran_id (nama)
        `
        )
        .eq("siswa_id", effectiveSiswa)
        .order("tahun_ajaran_id", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveSiswa,
  });

  const grouped = (nilai as any[]).reduce((acc: Record<string, any[]>, n: any) => {
    const key = `${n.tahun_ajaran?.nama || "-"} — ${n.semester?.nama || "-"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  const selectedAnak = anakList.find((a: any) => a.siswa_id === effectiveSiswa) as any;
  const siswaInfo = selectedAnak?.siswa as any;

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <View>
        <Title>Nilai Anak</Title>
        <Subtitle>Lihat nilai akademik anak per semester</Subtitle>
      </View>

      {anakList.length > 1 && (
        <ChoiceChips
          options={(anakList as any[]).map((a) => ({
            value: a.siswa_id as string,
            label: a.siswa?.nama ?? "-",
          }))}
          value={effectiveSiswa}
          onChange={setSelectedSiswa}
        />
      )}

      {siswaInfo && (
        <Card>
          <Text style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}>
            {siswaInfo.nama}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
            NIS: {siswaInfo.nis || "-"}
          </Text>
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : Object.keys(grouped).length === 0 ? (
        <EmptyState message="Belum ada data nilai" />
      ) : (
        Object.entries(grouped).map(([period, items]) => {
          const avg =
            items.reduce((s: number, n: any) => s + (n.nilai || 0), 0) / items.length;
          return (
            <Card key={period} style={{ gap: 8 }}>
              <View style={styles.periodHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Ionicons name="school-outline" size={16} color={theme.text} />
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14, flex: 1 }}>
                    {period}
                  </Text>
                </View>
                <Badge label={`Rata-rata: ${avg.toFixed(1)}`} tone="neutral" />
              </View>

              {items.map((n: any, idx: number) => (
                <View
                  key={n.id}
                  style={[
                    styles.nilaiRow,
                    { borderTopColor: theme.border },
                    idx === 0 && { borderTopWidth: 1 },
                  ]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                      {n.mapel?.nama || "-"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Badge label={n.jenis_ujian || "-"} tone="neutral" />
                      {n.keterangan ? (
                        <Text style={{ color: theme.textSecondary, fontSize: 11, flex: 1 }}>
                          {n.keterangan}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: (n.nilai || 0) >= 70 ? theme.primary : theme.danger,
                    }}
                  >
                    {n.nilai ?? "-"}
                  </Text>
                </View>
              ))}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nilaiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
});
