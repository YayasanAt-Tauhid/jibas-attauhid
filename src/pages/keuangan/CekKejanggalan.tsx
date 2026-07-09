import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Loader2, CheckCircle2, AlertTriangle, XCircle, Download } from "lucide-react";
import { formatRupiah } from "@/hooks/useKeuangan";
import * as XLSX from "xlsx";

type Status = "ok" | "warning" | "error";

interface CheckResult {
  title: string;
  status: Status;
  message: string;
  details?: string[];
  link?: string;
  linkLabel?: string;
}

export default function CekKejanggalan() {
  const navigate = useNavigate();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runChecks = async () => {
    setRunning(true);
    setResults([]);
    const checks: CheckResult[] = [];
    const totalChecks = 7;
    let done = 0;
    const tick = () => { done++; setProgress(Math.round((done / totalChecks) * 100)); };

    // 1. Pembayaran tanpa jurnal
    {
      const { data } = await supabase
        .from("pembayaran")
        .select("id, tanggal_bayar, jumlah, jenis_pembayaran!jenis_id(nama)")
        .is("jurnal_id", null)
        .order("tanggal_bayar", { ascending: false })
        .limit(20);
      const rows = (data || []) as any[];
      const details = rows.slice(0, 10).map(p =>
        `${p.jenis_pembayaran?.nama || "-"} — ${formatRupiah(p.jumlah)} (${p.tanggal_bayar})`
      );
      checks.push({
        title: "Pembayaran Tanpa Jurnal",
        status: rows.length === 0 ? "ok" : "error",
        message: rows.length === 0
          ? "Semua pembayaran telah terhubung ke jurnal"
          : `${rows.length} pembayaran tidak memiliki entri jurnal`,
        details,
        link: "/keuangan/pembayaran",
        linkLabel: "Buka Pembayaran",
      });
      tick();
    }

    // 2. Tagihan lunas tanpa referensi pembayaran
    {
      const { data } = await supabase
        .from("tagihan")
        .select("id, bulan, jenis_pembayaran!jenis_id(nama)")
        .eq("status", "lunas")
        .is("pembayaran_id", null)
        .limit(20);
      const rows = (data || []) as any[];
      const details = rows.slice(0, 10).map(t =>
        `${t.jenis_pembayaran?.nama || "-"} — Bulan ${t.bulan ?? "N/A"}`
      );
      checks.push({
        title: "Tagihan Lunas Tanpa Pembayaran",
        status: rows.length === 0 ? "ok" : "error",
        message: rows.length === 0
          ? "Semua tagihan lunas memiliki referensi pembayaran"
          : `${rows.length} tagihan berstatus lunas tanpa referensi pembayaran`,
        details,
        link: "/keuangan/tunggakan",
        linkLabel: "Buka Tunggakan",
      });
      tick();
    }

    // 3. Tagihan belum bayar tapi sudah ada pembayaran
    {
      const { data } = await supabase
        .from("tagihan")
        .select("id, bulan, jenis_pembayaran!jenis_id(nama)")
        .eq("status", "belum_bayar")
        .not("pembayaran_id", "is", null)
        .limit(20);
      const rows = (data || []) as any[];
      const details = rows.slice(0, 10).map(t =>
        `${t.jenis_pembayaran?.nama || "-"} — Bulan ${t.bulan ?? "N/A"}`
      );
      checks.push({
        title: "Status Tagihan Tidak Sinkron",
        status: rows.length === 0 ? "ok" : "warning",
        message: rows.length === 0
          ? "Status semua tagihan sinkron dengan data pembayaran"
          : `${rows.length} tagihan masih "belum bayar" padahal sudah ada pembayaran`,
        details,
        link: "/keuangan/tunggakan",
        linkLabel: "Buka Tunggakan",
      });
      tick();
    }

    // 4. Pembayaran dengan jumlah nol atau negatif
    {
      const { data } = await supabase
        .from("pembayaran")
        .select("id, tanggal_bayar, jumlah, jenis_pembayaran!jenis_id(nama)")
        .lte("jumlah", 0)
        .limit(20);
      const rows = (data || []) as any[];
      const details = rows.slice(0, 10).map(p =>
        `${p.jenis_pembayaran?.nama || "-"} — ${formatRupiah(p.jumlah)} (${p.tanggal_bayar})`
      );
      checks.push({
        title: "Pembayaran Jumlah Tidak Wajar",
        status: rows.length === 0 ? "ok" : "error",
        message: rows.length === 0
          ? "Semua pembayaran memiliki jumlah positif"
          : `${rows.length} pembayaran dengan jumlah nol atau negatif`,
        details,
        link: "/keuangan/pembayaran",
        linkLabel: "Buka Pembayaran",
      });
      tick();
    }

    // 5. Pengeluaran tanpa jurnal
    {
      const { data } = await supabase
        .from("pengeluaran")
        .select("id, tanggal, jumlah, keterangan, jenis_pengeluaran!jenis_id(nama)")
        .is("jurnal_id", null)
        .order("tanggal", { ascending: false })
        .limit(20);
      const rows = (data || []) as any[];
      const details = rows.slice(0, 10).map(p =>
        `${p.jenis_pengeluaran?.nama || "-"} — ${formatRupiah(p.jumlah)} (${p.tanggal})`
      );
      checks.push({
        title: "Pengeluaran Tanpa Jurnal",
        status: rows.length === 0 ? "ok" : "error",
        message: rows.length === 0
          ? "Semua pengeluaran telah terhubung ke jurnal"
          : `${rows.length} pengeluaran tidak memiliki entri jurnal`,
        details,
        link: "/keuangan/pengeluaran",
        linkLabel: "Buka Pengeluaran",
      });
      tick();
    }

    // 6. Saldo tabungan tidak konsisten dengan transaksi terakhir
    {
      const { data: tabungan } = await supabase
        .from("tabungan_siswa")
        .select("siswa_id, saldo, siswa!siswa_id(nama)");
      const { data: transaksi } = await supabase
        .from("transaksi_tabungan")
        .select("siswa_id, saldo_sesudah, created_at")
        .order("created_at", { ascending: false });

      const latestPerSiswa: Record<string, number> = {};
      for (const t of ((transaksi || []) as any[])) {
        if (!(t.siswa_id in latestPerSiswa)) {
          latestPerSiswa[t.siswa_id] = Number(t.saldo_sesudah);
        }
      }

      const anomali = ((tabungan || []) as any[]).filter(tb => {
        const latest = latestPerSiswa[tb.siswa_id];
        if (latest === undefined) return false;
        return Math.abs(Number(tb.saldo) - latest) > 0.01;
      });

      const details = anomali.slice(0, 10).map(tb => {
        const nama = (tb.siswa as any)?.nama || tb.siswa_id;
        const latest = latestPerSiswa[tb.siswa_id];
        return `${nama}: saldo tercatat ${formatRupiah(Number(tb.saldo))}, transaksi terakhir ${formatRupiah(latest)}`;
      });

      checks.push({
        title: "Saldo Tabungan Tidak Konsisten",
        status: anomali.length === 0 ? "ok" : "warning",
        message: anomali.length === 0
          ? "Saldo tabungan konsisten dengan riwayat transaksi"
          : `${anomali.length} siswa memiliki selisih antara saldo dan transaksi terakhir`,
        details,
        link: "/keuangan/tabungan",
        linkLabel: "Buka Tabungan",
      });
      tick();
    }

    // 7. Pembayaran bulanan duplikat
    {
      const { data } = await supabase
        .from("pembayaran")
        .select("siswa_id, jenis_id, tahun_ajaran_id, bulan, jenis_pembayaran!jenis_id(nama)")
        .not("bulan", "is", null);

      const groups: Record<string, { count: number; jenis: string }> = {};
      for (const p of ((data || []) as any[])) {
        const key = `${p.siswa_id}|${p.jenis_id}|${p.tahun_ajaran_id}|${p.bulan}`;
        if (!groups[key]) {
          groups[key] = { count: 0, jenis: p.jenis_pembayaran?.nama || p.jenis_id };
        }
        groups[key].count++;
      }

      const dupes = Object.values(groups).filter(g => g.count > 1);
      const details = dupes.slice(0, 10).map(g => `${g.jenis} — ${g.count}x pembayaran untuk kombinasi siswa-bulan yang sama`);

      checks.push({
        title: "Pembayaran Bulanan Duplikat",
        status: dupes.length === 0 ? "ok" : "error",
        message: dupes.length === 0
          ? "Tidak ada pembayaran bulanan yang terduplikasi"
          : `${dupes.length} kombinasi siswa-jenis-bulan dengan lebih dari 1 pembayaran`,
        details,
        link: "/keuangan/pembayaran",
        linkLabel: "Buka Pembayaran",
      });
      tick();
    }

    setResults(checks);
    setRunning(false);
    toast.success("Pemeriksaan kejanggalan selesai");
  };

  const countByStatus = (s: Status) => results.filter(r => r.status === s).length;

  const exportReport = () => {
    const data = results.map(r => ({
      Pemeriksaan: r.title,
      Status: r.status === "ok" ? "AMAN" : r.status === "warning" ? "PERHATIAN" : "KEJANGGALAN",
      Pesan: r.message,
      Detail: r.details?.join("; ") || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cek Kejanggalan");
    XLSX.writeFile(wb, `cek_kejanggalan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const StatusIcon = ({ status }: { status: Status }) => {
    if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-destructive" />;
  };

  const errorCount = countByStatus("error");
  const warnCount = countByStatus("warning");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cek Kejanggalan Kasir</h1>
        <p className="text-sm text-muted-foreground">
          Deteksi anomali dan inkonsistensi data keuangan — pembayaran, tagihan, tabungan, dan pengeluaran
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runChecks} disabled={running}>
          {running
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memeriksa...</>
            : <><Search className="mr-2 h-4 w-4" />Jalankan Pemeriksaan</>}
        </Button>
        {results.length > 0 && (
          <Button variant="outline" onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />Download Laporan
          </Button>
        )}
      </div>

      {running && <Progress value={progress} className="h-2" />}

      {results.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-green-600">{countByStatus("ok")} Aman</Badge>
          <Badge className="bg-yellow-500 text-white">{warnCount} Perhatian</Badge>
          <Badge variant="destructive">{errorCount} Kejanggalan</Badge>
          {errorCount === 0 && warnCount === 0 && (
            <span className="text-sm text-green-700 font-medium">Tidak ada kejanggalan ditemukan.</span>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {results.map((r, i) => (
          <Card
            key={i}
            className={
              r.status === "error"
                ? "border-destructive/50"
                : r.status === "warning"
                ? "border-yellow-500/50"
                : ""
            }
          >
            <CardHeader className="py-4">
              <CardTitle className="flex items-center gap-3 text-base">
                <StatusIcon status={r.status} />
                <span className="flex-1">{r.title}</span>
                <Badge
                  variant={r.status === "error" ? "destructive" : "secondary"}
                  className={
                    r.status === "ok"
                      ? "bg-green-600 text-white"
                      : r.status === "warning"
                      ? "bg-yellow-100 text-yellow-800"
                      : ""
                  }
                >
                  {r.status === "ok" ? "Aman" : r.status === "warning" ? "Perhatian" : "Kejanggalan"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <p className="text-sm">{r.message}</p>
              {r.details && r.details.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 rounded p-2">
                  {r.details.map((d, j) => <p key={j}>• {d}</p>)}
                </div>
              )}
              {r.link && r.status !== "ok" && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-xs"
                  onClick={() => navigate(r.link!)}
                >
                  {r.linkLabel} →
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
