import { useState, useEffect, useMemo } from "react";
import { useMidtrans } from "@/hooks/useMidtrans";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createPayment, type PaymentCategory } from "@/server/payment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Loader2, ShieldCheck } from "lucide-react";

const QRIS_GOPAY_FEE_RATE = 0.007; // 0.7%
const FLAT_ADMIN_FEE = 4400;

function hitungBiayaAdmin(category: PaymentCategory, totalAmount: number): number {
  if (category === "qris_gopay") {
    return Math.round(totalAmount * QRIS_GOPAY_FEE_RATE);
  }
  return FLAT_ADMIN_FEE;
}

const NAMA_BULAN = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

interface KeranjangItem {
  siswa_id: string;
  nama_siswa: string;
  jenis_id: string;
  jenis_nama: string;
  bulan: number;
  jumlah: number;
  departemen_id?: string;
  departemen_nama?: string;
  tahun_ajaran_id?: string;
  tahun_ajaran_nama?: string;
  kelas_nama?: string;
}

export default function PortalCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [paymentCategory, setPaymentCategory] = useState<PaymentCategory>("lainnya");
  const { isReady: isMidtransReady, isLoading: isMidtransLoading, error: midtransError, loadMidtrans } = useMidtrans();

  // Load Midtrans script when component mounts
  useEffect(() => {
    loadMidtrans();
  }, [loadMidtrans]);

  useEffect(() => {
    const raw = sessionStorage.getItem("keranjang_tagihan");
    if (!raw) {
      navigate("/portal/tagihan", { replace: true });
      return;
    }
    try {
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) {
        navigate("/portal/tagihan", { replace: true });
        return;
      }
      setKeranjang(items);
    } catch {
      navigate("/portal/tagihan", { replace: true });
    }
  }, [navigate]);

  // Group by siswa
  const grouped = useMemo(() => {
    const map = new Map<string, KeranjangItem[]>();
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

  const handleBayar = async () => {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesi login habis. Silakan login ulang.");
        navigate("/portal/login");
        return;
      }

      let result: Awaited<ReturnType<typeof createPayment>>;
      try {
        result = await createPayment({
          data: {
            items: keranjang,
            customer: {
              user_id: user!.id,
              email: user!.email || "",
              nama: user!.email?.split("@")[0] || "User",
            },
            payment_category: paymentCategory,
          },
        });
      } catch (err: any) {
        toast.error(err?.message || "Gagal membuat transaksi");
        setIsLoading(false);
        return;
      }

      if (!result.snap_token) {
        toast.error("Gagal membuat transaksi");
        setIsLoading(false);
        return;
      }

      // Cek window.snap tersedia sebelum memanggil
      if (!window.snap || typeof window.snap.pay !== "function") {
        toast.error("Layanan pembayaran belum siap. Coba muat ulang halaman.");
        setIsLoading(false);
        return;
      }

      // Open Midtrans Snap
      window.snap.pay(result.snap_token, {
        onSuccess: () => {
          toast.success("Pembayaran berhasil!");
          sessionStorage.removeItem("keranjang_tagihan");
          navigate(`/portal/pembayaran?order=${result.order_id}`);
        },
        onPending: () => {
          toast.info("Pembayaran pending. Selesaikan pembayaran Anda.");
          sessionStorage.removeItem("keranjang_tagihan");
          navigate(`/portal/pembayaran?order=${result.order_id}`);
        },
        onError: (snapResult: any) => {
          toast.error(
            "Pembayaran gagal: " +
              (snapResult?.status_message || "Unknown error")
          );
          setIsLoading(false);
        },
        onClose: () => {
          toast.warning("Pembayaran dibatalkan.");
          setIsLoading(false);
        },
      });
    } catch (err: any) {
      toast.error("Terjadi kesalahan: " + err.message);
      setIsLoading(false);
    }
  };

  if (keranjang.length === 0) return null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/portal/tagihan")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Checkout</h1>
          <p className="text-sm text-muted-foreground">
            Review dan bayar tagihan
          </p>
        </div>
      </div>

      {/* Detail Tagihan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detail Tagihan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Array.from(grouped.entries()).map(([siswaId, items]) => {
            const first = items[0];
            const subtotal = items.reduce((s, i) => s + i.jumlah, 0);
            return (
              <div key={siswaId}>
                <p className="font-semibold text-sm mb-2">
                  {first.nama_siswa}
                  <span className="font-normal text-muted-foreground ml-2">
                    ({first.departemen_nama} — {first.kelas_nama})
                  </span>
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jenis Pembayaran</TableHead>
                      <TableHead>Bulan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.jenis_nama}</TableCell>
                        <TableCell>
                          {item.bulan === 0
                            ? `Sekali Bayar${item.tahun_ajaran_nama ? ` — TA ${item.tahun_ajaran_nama}` : ""}`
                            : `${NAMA_BULAN[item.bulan] || "-"}${item.tahun_ajaran_nama ? ` — TA ${item.tahun_ajaran_nama}` : ""}`}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatRupiah(item.jumlah)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">
                        Subtotal {first.nama_siswa}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatRupiah(subtotal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            );
          })}

          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-lg font-bold">TOTAL TAGIHAN</span>
            <span className="text-xl font-bold text-emerald-700">
              {formatRupiah(totalAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Metode Pembayaran */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metode Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={paymentCategory}
            onValueChange={(v) => setPaymentCategory(v as PaymentCategory)}
            className="space-y-3"
          >
            <label
              htmlFor="cat-qris-gopay"
              className="flex items-center justify-between gap-4 rounded-lg border p-4 cursor-pointer hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="qris_gopay" id="cat-qris-gopay" />
                <div>
                  <Label htmlFor="cat-qris-gopay" className="cursor-pointer font-medium">
                    QRIS / GoPay
                  </Label>
                  <p className="text-xs text-muted-foreground">Biaya admin 0,7% dari total tagihan</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground shrink-0">
                {formatRupiah(hitungBiayaAdmin("qris_gopay", totalAmount))}
              </span>
            </label>
            <label
              htmlFor="cat-lainnya"
              className="flex items-center justify-between gap-4 rounded-lg border p-4 cursor-pointer hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="lainnya" id="cat-lainnya" />
                <div>
                  <Label htmlFor="cat-lainnya" className="cursor-pointer font-medium">
                    Transfer Bank / Kartu Kredit / Lainnya
                  </Label>
                  <p className="text-xs text-muted-foreground">Biaya admin flat</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground shrink-0">
                {formatRupiah(hitungBiayaAdmin("lainnya", totalAmount))}
              </span>
            </label>
          </RadioGroup>

          <div className="border-t mt-4 pt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Tagihan</span>
              <span>{formatRupiah(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Biaya Admin</span>
              <span>{formatRupiah(biayaAdmin)}</span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-lg font-bold">TOTAL BAYAR</span>
              <span className="text-xl font-bold text-emerald-700">
                {formatRupiah(totalBayar)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Pembayaran */}
      <Card>
        <CardContent className="flex items-start gap-4 p-5">
          <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Info Pembayaran</p>
            <p>
              Pembayaran ini akan diproses oleh Midtrans. Channel yang tersedia
              di halaman pembayaran mengikuti metode yang Anda pilih di atas.
              Biaya admin sudah termasuk dalam Total Bayar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => navigate("/portal/tagihan")}
          disabled={isLoading}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Ubah Pilihan
        </Button>
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12 text-base"
          onClick={handleBayar}
          disabled={isLoading || !isMidtransReady}
        >
          {isLoading || isMidtransLoading ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <CreditCard className="h-5 w-5 mr-2" />
          )}
          {isMidtransLoading ? "Memuat..." : `Bayar ${formatRupiah(totalBayar)} Sekarang`}
        </Button>
      </div>
    </div>
  );
}
