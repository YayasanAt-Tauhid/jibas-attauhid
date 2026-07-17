import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Badge,
  BadgeTone,
  Card,
  EmptyState,
  Screen,
  Spinner,
  Subtitle,
} from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const statusConfig: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "Lunas", tone: "primary" },
  pending: { label: "Menunggu", tone: "amber" },
  failed: { label: "Gagal", tone: "danger" },
  expired: { label: "Kedaluwarsa", tone: "neutral" },
};

interface RiwayatItem {
  key: string;
  order_id: string | null; // hanya ada untuk transaksi online
  tanggal: string | null;
  payment_type: string | null;
  status: string;
  total_amount: number;
  biaya_admin: number;
  items: { id: string; nama_item: string; jumlah: number }[];
}

export default function RiwayatScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: anakIds = [] } = useQuery({
    queryKey: ["portal-anak-ids", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select("siswa_id")
        .eq("user_id", user!.id);
      return (data || []).map((d: any) => d.siswa_id);
    },
    enabled: !!user,
  });

  const {
    data: transaksi = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["portal-riwayat", user?.id, anakIds],
    queryFn: async (): Promise<RiwayatItem[]> => {
      const [{ data: online }, { data: manual }] = await Promise.all([
        supabase
          .from("transaksi_midtrans")
          .select("*, transaksi_midtrans_item(*)")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
        anakIds.length > 0
          ? supabase
              .from("pembayaran")
              .select("id, jumlah, tanggal_bayar, keterangan")
              .in("siswa_id", anakIds)
              .order("tanggal_bayar", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const onlineItems: RiwayatItem[] = (online || []).map((tx: any) => {
        const biayaAdmin = Number(tx.biaya_admin) || 0;
        const items = (tx.transaksi_midtrans_item || []).map((i: any) => ({
          id: i.id,
          nama_item: i.nama_item,
          jumlah: Number(i.jumlah),
        }));
        if (biayaAdmin > 0) {
          items.push({
            id: `${tx.id}-biaya-admin`,
            nama_item: "Biaya Admin",
            jumlah: biayaAdmin,
          });
        }
        return {
          key: tx.id,
          order_id: tx.order_id,
          tanggal: tx.created_at,
          payment_type: tx.payment_type,
          status: tx.status,
          total_amount: Number(tx.total_amount) + biayaAdmin,
          biaya_admin: biayaAdmin,
          items,
        };
      });

      // Pembayaran yang dicatat manual oleh kasir/keuangan (tunai/transfer di kantor)
      const manualItems: RiwayatItem[] = ((manual || []) as any[]).map((p: any) => ({
        key: p.id,
        order_id: null,
        tanggal: p.tanggal_bayar,
        payment_type: "Kasir",
        status: "paid",
        total_amount: Number(p.jumlah),
        biaya_admin: 0,
        items: [
          {
            id: p.id,
            nama_item: p.keterangan || "Pembayaran",
            jumlah: Number(p.jumlah),
          },
        ],
      }));

      return [...onlineItems, ...manualItems].sort((a, b) => {
        const ta = a.tanggal ? new Date(a.tanggal).getTime() : 0;
        const tb = b.tanggal ? new Date(b.tanggal).getTime() : 0;
        return tb - ta;
      });
    },
    enabled: !!user,
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Subtitle>
        Daftar seluruh transaksi pembayaran Anda, baik online maupun di kasir sekolah
      </Subtitle>

      {transaksi.length === 0 ? (
        <EmptyState message="Belum ada riwayat pembayaran" />
      ) : (
        transaksi.map((tx) => {
          const status = statusConfig[tx.status] || statusConfig.pending;
          const isOpen = expanded.has(tx.key);
          return (
            <Card key={tx.key} style={{ gap: 10 }}>
              <Pressable style={styles.header} onPress={() => toggle(tx.key)}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    selectable
                    style={[
                      styles.orderId,
                      { color: theme.textSecondary, backgroundColor: theme.background },
                    ]}
                  >
                    {tx.order_id || "Bayar di Kasir"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      {tx.tanggal &&
                        format(new Date(tx.tanggal), "dd MMM yyyy HH:mm", {
                          locale: idLocale,
                        })}
                    </Text>
                    {tx.payment_type && <Badge label={tx.payment_type} tone="neutral" />}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>
                    {formatRupiah(tx.total_amount)}
                  </Text>
                  <Badge label={status.label} tone={status.tone} />
                </View>
                <Ionicons
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.textSecondary}
                />
              </Pressable>

              {isOpen && (
                <View style={[styles.detail, { borderTopColor: theme.border }]}>
                  {tx.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={{ color: theme.text, fontSize: 12, flex: 1 }}>
                        {item.nama_item}
                      </Text>
                      <Text style={{ color: theme.text, fontSize: 12 }}>
                        {formatRupiah(item.jumlah)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.itemRow, { marginTop: 4 }]}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700", flex: 1 }}>
                      TOTAL
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                      {formatRupiah(tx.total_amount)}
                    </Text>
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orderId: {
    fontSize: 11,
    fontFamily: "monospace",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  detail: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
