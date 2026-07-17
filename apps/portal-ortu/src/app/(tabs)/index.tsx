import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Screen, SectionTitle, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function BerandaScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const anakQuery = useQuery({
    queryKey: ["portal-anak", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select(
          `
          siswa_id,
          hubungan,
          siswa:siswa_id (
            id, nama, nis, jenis_kelamin,
            kelas_siswa (
              aktif,
              kelas:kelas_id (
                nama,
                departemen:departemen_id (nama, kode)
              )
            )
          )
        `
        )
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });
  const anakList = anakQuery.data ?? [];

  // Referensi array distabilkan agar queryKey tidak berubah tiap render.
  const siswaIds = useMemo(() => anakList.map((a: any) => a.siswa_id), [anakList]);

  const tagihanQuery = useQuery({
    queryKey: ["portal-tagihan-count", siswaIds],
    queryFn: async () => {
      if (siswaIds.length === 0) return 0;
      const { data } = await supabase
        .from("v_tagihan_belum_bayar")
        .select("*")
        .in("siswa_id", siswaIds)
        .eq("sudah_bayar", false);
      return ((data || []) as any[]).filter((t) => t.nominal > 0).length;
    },
    enabled: siswaIds.length > 0,
  });
  const tagihanCount = tagihanQuery.data ?? 0;

  const notifQuery = useQuery({
    queryKey: ["portal-notif-dashboard", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifikasi_ortu")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!user,
  });
  const recentNotifs = notifQuery.data ?? [];

  const refreshing = anakQuery.isRefetching || tagihanQuery.isRefetching || notifQuery.isRefetching;
  const onRefresh = () => {
    anakQuery.refetch();
    tagihanQuery.refetch();
    notifQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View>
        <Title>Selamat Datang, {user?.email?.split("@")[0]}</Title>
        <Subtitle>Portal Orang Tua Hijrah At-Tauhid</Subtitle>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="people-outline" size={22} color={theme.primary} />
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{anakList.length}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Anak Terdaftar</Text>
        </Card>
        <Card style={styles.statCard} onPress={() => router.push("/tagihan")}>
          <View style={[styles.statIcon, { backgroundColor: theme.amberSoft }]}>
            <Ionicons name="document-text-outline" size={22} color={theme.amber} />
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{tagihanCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tagihan Belum Bayar</Text>
        </Card>
        <Card style={styles.statCard} onPress={() => router.push("/riwayat")}>
          <View style={[styles.statIcon, { backgroundColor: theme.blueSoft }]}>
            <Ionicons name="card-outline" size={22} color={theme.blue} />
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>Riwayat</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pembayaran</Text>
        </Card>
      </View>

      <Card style={{ gap: 12 }}>
        <SectionTitle>Data Anak</SectionTitle>
        {anakList.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            Belum ada data anak yang terhubung. Hubungi admin sekolah.
          </Text>
        ) : (
          anakList.map((item: any) => {
            const siswa = item.siswa;
            const activeKelas = siswa?.kelas_siswa?.find((ks: any) => ks.aktif);
            return (
              <View
                key={item.siswa_id}
                style={[styles.anakRow, { borderColor: theme.border }]}
              >
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>
                  {siswa?.nama}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                  NIS: {siswa?.nis || "-"} • {activeKelas?.kelas?.departemen?.nama || "-"} —{" "}
                  {activeKelas?.kelas?.nama || "-"}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      {recentNotifs.length > 0 && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="notifications-outline" size={16} color={theme.text} />
            <SectionTitle>Notifikasi Terbaru</SectionTitle>
          </View>
          {recentNotifs.map((n: any) => (
            <View
              key={n.id}
              style={[
                styles.notifRow,
                {
                  borderColor: n.dibaca ? theme.border : theme.primary,
                  backgroundColor: n.dibaca ? "transparent" : theme.primarySoft,
                },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>
                {n.judul}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                {n.pesan}
              </Text>
              {n.created_at && (
                <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>
                  {format(new Date(n.created_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                </Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    gap: 6,
    alignItems: "flex-start",
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 17,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
  },
  anakRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  notifRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
