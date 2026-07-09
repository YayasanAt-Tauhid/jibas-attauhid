import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "@/lib/router-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  paid: { label: "Lunas", variant: "default" },
  pending: { label: "Menunggu", variant: "secondary" },
  failed: { label: "Gagal", variant: "destructive" },
  expired: { label: "Kedaluwarsa", variant: "outline" },
};

export default function PortalRiwayat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightOrder = searchParams.get("order");

  const { data: transaksi = [], isLoading } = useQuery({
    queryKey: ["portal-riwayat", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaksi_midtrans")
        .select("*, transaksi_midtrans_item(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (highlightOrder && transaksi.length > 0) {
      const found = transaksi.find((t: any) => t.order_id === highlightOrder);
      if (found && found.status === "paid") {
        toast.success(`Transaksi ${highlightOrder} berhasil diproses`);
      }
    }
  }, [highlightOrder, transaksi]);

  // Bug 5 fix: buka popup terpisah untuk cetak, bukan window.print() seluruh halaman
  const printBukti = (tx: any) => {
    const items = tx.transaksi_midtrans_item || [];
    const w = window.open("", "_blank", "width=620,height=650");
    if (!w) { toast.error("Popup diblokir. Izinkan popup untuk mencetak."); return; }
    w.document.write(`
      <html><head><title>Bukti Pembayaran ${tx.order_id}</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#111}
        h2{margin-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        th{background:#f0f0f0}
        .total{font-weight:bold}
        .footer{margin-top:24px;font-size:12px;color:#666}
        @media print{button{display:none}}
      </style>
      </head><body>
      <h2>Bukti Pembayaran</h2>
      <p><b>Order ID:</b> ${tx.order_id}</p>
      <p><b>Tanggal:</b> ${tx.created_at ? new Date(tx.created_at).toLocaleString("id-ID") : "-"}</p>
      <p><b>Metode:</b> ${tx.payment_type || "-"}</p>
      <table>
        <thead><tr><th>Item</th><th style="text-align:right">Jumlah</th></tr></thead>
        <tbody>${items.map((i: any) => `<tr><td>${i.nama_item}</td><td style="text-align:right">${Number(i.jumlah).toLocaleString("id-ID", { style:"currency", currency:"IDR", minimumFractionDigits:0 })}</td></tr>`).join("")}</tbody>
        <tfoot><tr class="total"><td>TOTAL</td><td style="text-align:right">${Number(tx.total_amount).toLocaleString("id-ID", { style:"currency", currency:"IDR", minimumFractionDigits:0 })}</td></tr></tfoot>
      </table>
      <p class="footer">Terima kasih telah melakukan pembayaran.</p>
      <br/><button onclick="window.print()">Cetak</button>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // Bug 5b fix: copyOrderId function selesai (sesi lalu terpotong)
  const copyOrderId = (orderId: string) => {
    navigator.clipboard.writeText(orderId).then(
      () => toast.success("Order ID disalin"),
      () => toast.error("Gagal menyalin Order ID")
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Riwayat Pembayaran
        </h1>
        <p className="text-sm text-muted-foreground">
          Daftar transaksi pembayaran online Anda
        </p>
      </div>

      {transaksi.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Belum ada riwayat pembayaran
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible defaultValue={highlightOrder || undefined}>
          {transaksi.map((tx: any) => {
            const status = statusConfig[tx.status] || statusConfig.pending;
            const items = tx.transaksi_midtrans_item || [];
            const isHighlighted = tx.order_id === highlightOrder;

            return (
              <AccordionItem
                key={tx.id}
                value={tx.order_id}
                className={isHighlighted ? "ring-2 ring-emerald-500 rounded-lg" : ""}
              >
                <Card className="mb-3">
                  <AccordionTrigger className="px-5 py-4 hover:no-underline">
                    <div className="flex flex-1 items-center justify-between gap-4 text-left">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                            {tx.order_id}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyOrderId(tx.order_id);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {tx.created_at &&
                            format(
                              new Date(tx.created_at),
                              "dd MMM yyyy HH:mm",
                              { locale: idLocale }
                            )}
                          {tx.payment_type && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {tx.payment_type}
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold text-sm">
                          {formatRupiah(Number(tx.total_amount))}
                        </span>
                        <Badge
                          variant={status.variant}
                          className={
                            tx.status === "paid"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : tx.status === "pending"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : ""
                          }
                        >
                          {status.label}
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Jumlah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">
                              {item.nama_item}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatRupiah(Number(item.jumlah))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex justify-end">
                      {/* Bug 5 fix: pakai printBukti(tx) bukan window.print() */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => printBukti(tx)}
                      >
                        <Printer className="h-4 w-4 mr-1.5" />
                        Cetak Bukti
                      </Button>
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
