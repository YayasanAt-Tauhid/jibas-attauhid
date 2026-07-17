import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Screen, SectionTitle, Subtitle } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { formatRupiah, labelBulanTA, NAMA_BULAN } from "@/lib/format";
import { clearKeranjang, getKeranjang } from "@/lib/keranjang";
import { supabase } from "@/lib/supabase";

// Disalin dari src/server/payment.ts (nilai final tetap dihitung server;
// di sini hanya untuk pratinjau biaya sebelum membayar).
const QRIS_GOPAY_FEE_RATE = 0.007; // 0.7%
const FLAT_ADMIN_FEE = 4400;

type PaymentCategory = "qris_gopay" | "lainnya";

function hitungBiayaAdmin(category: PaymentCategory, totalAmount: number): number {
  if (category === "qris_gopay") {
    return Math.round(totalAmount * QRIS_GOPAY_FEE_RATE);
  }
  return FLAT_ADMIN_FEE;
}

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentCategory, setPaymentCategory] = useState<PaymentCategory>("lainnya");

  // Snapshot sekali saat layar dibuka — keranjang di-clear setelah pembayaran.
  const [keranjang] = useState(getKeranjang);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof keranjang>();
    keranjang.forEach((item) => {
      const list = map.get(item.siswa_id) || [];
      list.push(item);
      map.set(item.siswa_id, list);
    });
    return map;
  }, [keranjang]);

  const totalAmount = keranjang.reduce((sum, i) => sum + i.jumlah, 0);
  const biayaAdmin = hitungBiayaAdmin(paymentCategory, totalAmount);
  const totalBayar = totalAmount + biayaAdmin;

  const selesaiKeCekStatus = () => {
    clearKeranjang();
    // Status akhir ditentukan webhook Midtrans — refresh data lalu arahkan
    // ke Riwayat supaya pengguna melihat status transaksinya.
    queryClient.invalidateQueries({ queryKey: ["portal-tagihan"] });
    queryClient.invalidateQueries({ queryKey: ["portal-tagihan-count"] });
    queryClient.invalidateQueries({ queryKey: ["portal-riwayat"] });
    router.replace("/riwayat");
  };

  const handleBayar = async () => {
    const webUrl = process.env.EXPO_PUBLIC_PORTAL_WEB_URL?.replace(/\/$/, "");
    if (!webUrl) {
      Alert.alert(
        "Belum dikonfigurasi",
        "EXPO_PUBLIC_PORTAL_WEB_URL belum diset. Silakan bayar melalui portal web sekolah."
      );
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Sesi habis", "Sesi login habis. Silakan login ulang.");
        return;
      }

      const res = await fetch(`${webUrl}/api/portal/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          items: keranjang.map((item) => ({
            siswa_id: item.siswa_id,
            nama_siswa: item.nama_siswa,
            jenis_id: item.jenis_id,
            jenis_nama: item.jenis_nama,
            bulan: item.bulan,
            jumlah: item.jumlah,
            departemen_id: item.departemen_id,
            departemen_nama: item.departemen_nama,
            tahun_ajaran_id: item.tahun_ajaran_id,
          })),
          payment_category: paymentCategory,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.redirect_url) {
        Alert.alert("Gagal membuat transaksi", body.error || "Coba lagi beberapa saat.");
        return;
      }

      // Buka halaman Snap di browser in-app. Callback Midtrans mengarah ke
      // deep link portalortu://riwayat sehingga sesi tertutup otomatis saat
      // pembayaran selesai; kalau pengguna menutup manual pun kita tetap
      // lanjut ke layar Riwayat untuk cek status.
      await WebBrowser.openAuthSessionAsync(body.redirect_url, "portalortu://riwayat");
      selesaiKeCekStatus();
    } catch {
      Alert.alert(
        "Gagal terhubung",
        "Tidak bisa menghubungi server pembayaran. Periksa koneksi internet Anda."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (keranjang.length === 0) {
    return (
      <Screen>
        <Card style={{ gap: 12 }}>
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
            Tidak ada tagihan yang dipilih.
          </Text>
          <Button
            title="Kembali ke Tagihan"
            variant="outline"
            onPress={() => router.replace("/tagihan")}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Subtitle>Periksa kembali tagihan Anda, pilih metode, lalu bayar</Subtitle>

      <Card style={{ gap: 14 }}>
        <SectionTitle>Detail Tagihan</SectionTitle>
        {Array.from(grouped.entries()).map(([siswaId, items]) => {
          const first = items[0];
          const subtotal = items.reduce((s, i) => s + i.jumlah, 0);
          return (
            <View key={siswaId} style={{ gap: 6 }}>
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>
                {first.nama_siswa}
                {first.kelas_nama ? (
                  <Text style={{ color: theme.textSecondary, fontWeight: "400" }}>
                    {"  "}({first.departemen_nama} — {first.kelas_nama})
                  </Text>
                ) : null}
              </Text>
              {items.map((item, idx) => (
                <View
                  key={idx}
                  style={[styles.itemRow, { borderTopColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 13 }}>{item.jenis_nama}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      {item.bulan === 0
                        ? `Sekali Bayar${item.tahun_ajaran_nama ? ` — TA ${item.tahun_ajaran_nama}` : ""}`
                        : item.tahun_ajaran_mulai
                          ? labelBulanTA(item.bulan, item.tahun_ajaran_mulai)
                          : NAMA_BULAN[item.bulan] || "-"}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                    {formatRupiah(item.jumlah)}
                  </Text>
                </View>
              ))}
              <View style={[styles.subtotalRow, { borderTopColor: theme.border }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Subtotal {first.nama_siswa}
                </Text>
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 12 }}>
                  {formatRupiah(subtotal)}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionTitle>Metode Pembayaran</SectionTitle>
        {(
          [
            {
              value: "qris_gopay" as const,
              label: "QRIS / GoPay",
              desc: "Biaya admin 0,7% dari total tagihan",
            },
            {
              value: "lainnya" as const,
              label: "Transfer Bank / Kartu Kredit / Lainnya",
              desc: "Biaya admin flat",
            },
          ]
        ).map((opt) => {
          const active = paymentCategory === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPaymentCategory(opt.value)}
              style={[
                styles.categoryRow,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primarySoft : "transparent",
                },
              ]}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={active ? theme.primary : theme.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "500" }}>
                  {opt.label}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{opt.desc}</Text>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {formatRupiah(hitungBiayaAdmin(opt.value, totalAmount))}
              </Text>
            </Pressable>
          );
        })}

        <View style={[styles.totals, { borderTopColor: theme.border }]}>
          <View style={styles.totalRow}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Total Tagihan</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {formatRupiah(totalAmount)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Biaya Admin</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {formatRupiah(biayaAdmin)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
              TOTAL BAYAR
            </Text>
            <Text style={{ color: theme.primary, fontSize: 17, fontWeight: "700" }}>
              {formatRupiah(totalBayar)}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary} />
        <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1 }}>
          Pembayaran diproses oleh Midtrans di halaman aman yang terbuka setelah Anda
          menekan Bayar. Biaya admin sudah termasuk dalam Total Bayar. Setelah selesai,
          status transaksi bisa dicek di Riwayat Pembayaran.
        </Text>
      </Card>

      <View style={{ gap: 10 }}>
        <Button
          title={isLoading ? "Memproses..." : `Bayar ${formatRupiah(totalBayar)} Sekarang`}
          icon="card-outline"
          loading={isLoading}
          onPress={handleBayar}
        />
        <Button
          title="Ubah Pilihan"
          variant="outline"
          icon="arrow-back-outline"
          disabled={isLoading}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  totals: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
    marginTop: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
