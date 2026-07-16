import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, Spinner, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { BULAN_ORDER_AKADEMIK, formatRupiah, labelBulanTA } from "@/lib/format";
import { setKeranjang } from "@/lib/keranjang";
import { supabase } from "@/lib/supabase";

interface TagihanItem {
  siswa_id: string;
  nama_siswa: string;
  nis: string;
  kelas_nama: string;
  departemen_nama: string;
  departemen_kode: string;
  departemen_id: string;
  jenis_id: string;
  jenis_nama: string;
  nominal: number;
  bulan: number;
  tahun_ajaran_id: string;
  tahun_ajaran_nama: string;
  tahun_ajaran_mulai: string;
}

export default function TagihanScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    data: tagihan = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["portal-tagihan", anakIds],
    queryFn: async () => {
      if (anakIds.length === 0) return [];
      const { data } = await supabase
        .from("v_tagihan_belum_bayar")
        .select("*")
        .in("siswa_id", anakIds)
        .eq("sudah_bayar", false)
        .order("nama_siswa");

      const rows = ((data || []) as TagihanItem[]).filter((t) => t.nominal > 0);

      // Urut per siswa, lalu tahun ajaran, lalu posisi bulan dalam siklus
      // akademik Juli-Juni — logika sama persis dengan portal web.
      const posisiBulan = (b: number) => {
        const idx = BULAN_ORDER_AKADEMIK.indexOf(b);
        return idx === -1 ? 99 : idx; // 0 = sekali bayar, taruh di awal
      };
      rows.sort((a, b) => {
        const namaCmp = a.nama_siswa.localeCompare(b.nama_siswa);
        if (namaCmp !== 0) return namaCmp;
        if (a.siswa_id !== b.siswa_id) return a.siswa_id.localeCompare(b.siswa_id);
        const tA = a.tahun_ajaran_mulai || "";
        const tB = b.tahun_ajaran_mulai || "";
        if (tA !== tB) return tA.localeCompare(tB);
        return posisiBulan(a.bulan) - posisiBulan(b.bulan);
      });
      return rows;
    },
    enabled: anakIds.length > 0,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TagihanItem[]>();
    tagihan.forEach((t) => {
      const list = map.get(t.siswa_id) || [];
      list.push(t);
      map.set(t.siswa_id, list);
    });
    return map;
  }, [tagihan]);

  const getKey = (t: TagihanItem) =>
    `${t.siswa_id}-${t.jenis_id}-${t.tahun_ajaran_id}-${t.bulan}`;

  const toggleItem = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllForSiswa = (siswaId: string) => {
    const items = grouped.get(siswaId) || [];
    const keys = items.map(getKey);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const selectedItems = tagihan.filter((t) => selected.has(getKey(t)));
  const totalSelected = selectedItems.reduce((sum, t) => sum + (t.nominal || 0), 0);

  // Checkout in-app (fase 2): keranjang diisi di sini, dibayar lewat layar
  // /checkout yang memanggil API route web /api/portal/checkout lalu membuka
  // halaman Midtrans Snap di browser in-app.
  const handleCheckout = () => {
    setKeranjang(
      selectedItems.map((t) => ({
        siswa_id: t.siswa_id,
        nama_siswa: t.nama_siswa,
        jenis_id: t.jenis_id,
        jenis_nama: t.jenis_nama,
        bulan: t.bulan,
        jumlah: t.nominal,
        departemen_id: t.departemen_id,
        departemen_nama: t.departemen_nama,
        tahun_ajaran_id: t.tahun_ajaran_id,
        tahun_ajaran_nama: t.tahun_ajaran_nama,
        tahun_ajaran_mulai: t.tahun_ajaran_mulai,
        kelas_nama: t.kelas_nama,
      }))
    );
    router.push("/checkout");
  };

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          selectedItems.length > 0 && { paddingBottom: 96 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View>
          <Title>Tagihan</Title>
          <Subtitle>Pilih tagihan yang ingin dibayar</Subtitle>
        </View>

        {tagihan.length === 0 ? (
          <EmptyState message="🎉 Tidak ada tagihan yang belum dibayar" />
        ) : (
          Array.from(grouped.entries()).map(([siswaId, items]) => {
            const first = items[0];
            const allKeys = items.map(getKey);
            const allChecked = allKeys.every((k) => selected.has(k));
            const subtotal = items
              .filter((t) => selected.has(getKey(t)))
              .reduce((s, t) => s + (t.nominal || 0), 0);

            return (
              <Card key={siswaId} style={{ gap: 8 }}>
                <Pressable
                  style={styles.siswaHeader}
                  onPress={() => selectAllForSiswa(siswaId)}
                >
                  <Ionicons
                    name={allChecked ? "checkbox" : "square-outline"}
                    size={22}
                    color={allChecked ? theme.primary : theme.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}>
                      {first.nama_siswa}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      {first.departemen_nama} — {first.kelas_nama} • NIS: {first.nis || "-"}
                    </Text>
                  </View>
                </Pressable>

                <View>
                  {items.map((t) => {
                    const key = getKey(t);
                    const checked = selected.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => toggleItem(key)}
                        style={[styles.itemRow, { borderTopColor: theme.border }]}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={20}
                          color={checked ? theme.primary : theme.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                            {t.jenis_nama}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                            {t.bulan === 0
                              ? `Sekali Bayar — TA ${t.tahun_ajaran_nama}`
                              : labelBulanTA(t.bulan, t.tahun_ajaran_mulai)}
                          </Text>
                        </View>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                          {formatRupiah(t.nominal || 0)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {subtotal > 0 && (
                  <View style={[styles.subtotalRow, { borderTopColor: theme.border }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                      Subtotal {first.nama_siswa}
                    </Text>
                    <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>
                      {formatRupiah(subtotal)}
                    </Text>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>

      {selectedItems.length > 0 && (
        <View style={[styles.checkoutBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Button
            title={`Bayar ${selectedItems.length} item — ${formatRupiah(totalSelected)}`}
            icon="cart-outline"
            onPress={handleCheckout}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  siswaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
  },
  checkoutBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    borderTopWidth: 1,
  },
});
