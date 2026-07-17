import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Badge,
  BadgeTone,
  Card,
  ChoiceChips,
  Screen,
  SectionTitle,
  Spinner,
  Subtitle,
  Title,
} from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const statusConfig: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tone: BadgeTone }
> = {
  H: { label: "Hadir", icon: "checkmark-circle-outline", tone: "primary" },
  I: { label: "Izin", icon: "time-outline", tone: "blue" },
  S: { label: "Sakit", icon: "alert-circle-outline", tone: "amber" },
  A: { label: "Alpha", icon: "close-circle-outline", tone: "danger" },
};

export default function PresensiScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [selectedSiswa, setSelectedSiswa] = useState("");

  const { data: anakList = [] } = useQuery({
    queryKey: ["portal-anak-presensi", user?.id],
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
    data: presensi = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["portal-presensi", effectiveSiswa],
    queryFn: async () => {
      const { data } = await supabase
        .from("presensi_siswa")
        .select("*, kelas:kelas_id(nama)")
        .eq("siswa_id", effectiveSiswa)
        .order("tanggal", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!effectiveSiswa,
  });

  const summary = useMemo(() => {
    const counts = { H: 0, I: 0, S: 0, A: 0 };
    presensi.forEach((p: any) => {
      if (p.status && counts[p.status as keyof typeof counts] !== undefined) {
        counts[p.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [presensi]);

  const selectedAnak = anakList.find((a: any) => a.siswa_id === effectiveSiswa) as any;
  const siswaInfo = selectedAnak?.siswa as any;

  const toneColor: Record<BadgeTone, string> = {
    primary: theme.primary,
    danger: theme.danger,
    amber: theme.amber,
    blue: theme.blue,
    neutral: theme.textSecondary,
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <View>
        <Title>Presensi Anak</Title>
        <Subtitle>Lihat rekap kehadiran anak di sekolah</Subtitle>
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

      <View style={styles.summaryGrid}>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Card key={key} style={styles.summaryCard}>
            <Ionicons name={cfg.icon} size={20} color={toneColor[cfg.tone]} />
            <View>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
                {summary[key as keyof typeof summary]}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{cfg.label}</Text>
            </View>
          </Card>
        ))}
      </View>

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Ionicons name="calendar-outline" size={17} color={theme.text} />
          <SectionTitle>Riwayat Presensi</SectionTitle>
        </View>
        {isLoading ? (
          <Spinner />
        ) : presensi.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 20 }}>
            Belum ada data presensi
          </Text>
        ) : (
          (presensi as any[]).map((p, idx) => {
            const cfg = statusConfig[p.status] || statusConfig.H;
            return (
              <View
                key={p.id}
                style={[
                  styles.presensiRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                <Ionicons name={cfg.icon} size={16} color={toneColor[cfg.tone]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                    {p.tanggal &&
                      format(new Date(p.tanggal), "EEEE, dd MMMM yyyy", { locale: idLocale })}
                  </Text>
                  {p.keterangan && (
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      {p.keterangan}
                    </Text>
                  )}
                </View>
                <Badge label={cfg.label} tone={cfg.tone} />
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  presensiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
});
