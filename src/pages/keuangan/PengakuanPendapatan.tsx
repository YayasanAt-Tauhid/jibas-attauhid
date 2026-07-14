import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTahunAjaran, useTahunAjaranAktif, formatRupiah, namaBulanTahun } from "@/hooks/useKeuangan";
import { usePengaturanAkun } from "@/hooks/useJurnal";
import { toast } from "sonner";
import { CheckCircle, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function PengakuanPendapatan() {
  const [filterTahunTarget, setFilterTahunTarget] = useState("");
  const [confirmRecognize, setConfirmRecognize] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const qc = useQueryClient();

  const { data: tahunAjaranList } = useTahunAjaran();
  const { data: tahunAktif } = useTahunAjaranAktif();
  const { data: pengaturanAkun } = usePengaturanAkun();

  const { data: dimukaList, isLoading } = useQuery({
    queryKey: ["pendapatan_dimuka", filterTahunTarget],
    queryFn: async () => {
      let q = supabase
        .from("pendapatan_dimuka")
        .select(`
          *,
          siswa:siswa_id(id, nama, nis),
          jenis:jenis_id(id, nama, akun_pendapatan_id, akun_dimuka_id),
          tahun_pembayaran:tahun_ajaran_pembayaran_id(id, nama),
          tahun_target:tahun_ajaran_target_id(id, nama, aktif),
          pembayaran:pembayaran_id(id, tanggal_bayar, jumlah)
        `)
        .order("created_at", { ascending: false });

      if (filterTahunTarget) {
        q = q.eq("tahun_ajaran_target_id", filterTahunTarget);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const pendingItems = dimukaList?.filter((d: any) => d.status === "pending") || [];
  const diakuiItems = dimukaList?.filter((d: any) => d.status === "diakui") || [];
  const totalPending = pendingItems.reduce((s: number, d: any) => s + Number(d.jumlah || 0), 0);
  const totalDiakui = diakuiItems.reduce((s: number, d: any) => s + Number(d.jumlah || 0), 0);

  const recognizeMutation = useMutation({
    mutationFn: async (dimukaId: string) => {
      const item = dimukaList?.find((d: any) => d.id === dimukaId);
      if (!item) throw new Error("Data tidak ditemukan");

      // Pakai akun dimuka per-jenis jika ada (konsisten dengan edge function proses-pembayaran), fallback ke setting global
      const dimukaGlobalId = pengaturanAkun?.find((p: any) => p.kode_setting === "AKUN_PENDAPATAN_DIMUKA")?.akun?.id;
      const dimukaAkunId = item.jenis?.akun_dimuka_id ?? dimukaGlobalId;
      const pendapatanAkunId = item.jenis?.akun_pendapatan_id;

      if (!dimukaAkunId || !pendapatanAkunId) {
        throw new Error("Akun Pendapatan Diterima di Muka atau Akun Pendapatan belum dikonfigurasi");
      }

      const today = format(new Date(), "yyyy-MM-dd");
      const tahun = new Date().getFullYear();

      const { data: nomor } = await supabase.rpc("generate_nomor_jurnal", {
        p_prefix: "PD",
        p_tahun: tahun,
      });
      if (!nomor) throw new Error("Gagal generate nomor jurnal");

      const ket = `Pengakuan pendapatan ${item.jenis?.nama} - ${item.siswa?.nama}${item.bulan ? ` (${namaBulanTahun(item.bulan, { tahunBukuNama: item.tahun_target?.nama })})` : ""}`;

      // Create recognition journal: Debit Pendapatan Dimuka, Credit Pendapatan
      const { data: jurnal, error: jErr } = await supabase
        .from("jurnal")
        .insert({
          nomor,
          tanggal: today,
          keterangan: ket,
          referensi: item.pembayaran_id,
          departemen_id: item.departemen_id,
          total_debit: Number(item.jumlah),
          total_kredit: Number(item.jumlah),
          status: "posted",
        })
        .select()
        .single();

      if (jErr) throw jErr;

      await supabase.from("jurnal_detail").insert([
        {
          jurnal_id: jurnal.id,
          akun_id: dimukaAkunId,
          keterangan: `Pengakuan Pend. Diterima di Muka - ${item.jenis?.nama}`,
          debit: Number(item.jumlah),
          kredit: 0,
          urutan: 1,
        },
        {
          jurnal_id: jurnal.id,
          akun_id: pendapatanAkunId,
          keterangan: `Pendapatan ${item.jenis?.nama} - ${item.siswa?.nama}`,
          debit: 0,
          kredit: Number(item.jumlah),
          urutan: 2,
        },
      ]);

      // Update status
      const { error: upErr } = await supabase
        .from("pendapatan_dimuka")
        .update({
          status: "diakui",
          jurnal_pengakuan_id: jurnal.id,
          tanggal_pengakuan: today,
        } as any)
        .eq("id", dimukaId);

      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendapatan_dimuka"] });
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      toast.success("Pendapatan berhasil diakui");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkRecognizeMutation = useMutation({
    mutationFn: async () => {
      // Only recognize items where target tahun_ajaran is now active
      const itemsToRecognize = pendingItems.filter(
        (d: any) => d.tahun_target?.aktif === true
      );
      if (itemsToRecognize.length === 0) {
        throw new Error("Tidak ada item yang bisa diakui. Tahun ajaran target harus aktif terlebih dahulu.");
      }
      for (const item of itemsToRecognize) {
        await recognizeMutation.mutateAsync(item.id);
      }
    },
    onSuccess: () => {
      toast.success("Semua pendapatan di muka untuk periode aktif berhasil diakui");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "siswa",
      label: "Siswa",
      render: (_, r) => (
        <div>
          <p className="font-medium text-sm">{(r as any).siswa?.nama || "-"}</p>
          <p className="text-xs text-muted-foreground">NIS: {(r as any).siswa?.nis || "-"}</p>
        </div>
      ),
    },
    { key: "jenis", label: "Jenis", render: (_, r) => (r as any).jenis?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v, r) => v ? namaBulanTahun(v as number, { tahunBukuNama: (r as any).tahun_target?.nama }) : "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    {
      key: "tahun_pembayaran",
      label: "Dibayar di TA",
      render: (_, r) => <Badge variant="outline">{(r as any).tahun_pembayaran?.nama || "-"}</Badge>,
    },
    {
      key: "tahun_target",
      label: "Untuk TA",
      render: (_, r) => {
        const ta = (r as any).tahun_target;
        return (
          <Badge variant={ta?.aktif ? "default" : "secondary"}>
            {ta?.nama || "-"} {ta?.aktif ? "✓" : ""}
          </Badge>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (v) =>
        v === "diakui" ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <CheckCircle className="h-3 w-3 mr-1" /> Diakui
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            <Clock className="h-3 w-3 mr-1" /> Pending
          </Badge>
        ),
    },
    {
      key: "tanggal_pengakuan",
      label: "Tgl Pengakuan",
      render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-",
    },
    {
      key: "aksi",
      label: "Aksi",
      render: (_, r) => {
        const row = r as any;
        if (row.status === "diakui") return <span className="text-xs text-muted-foreground">Selesai</span>;
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); setConfirmRecognize(row.id); }}
            disabled={recognizeMutation.isPending}
          >
            <ArrowRight className="h-3 w-3 mr-1" />
            Akui
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pengakuan Pendapatan</h1>
        <p className="text-sm text-muted-foreground">
          Kelola pendapatan diterima di muka (Unearned Revenue) dan akui sebagai pendapatan saat periode target aktif
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Pengakuan</p>
                <p className="text-lg font-bold">{formatRupiah(totalPending)}</p>
                <p className="text-xs text-muted-foreground">{pendingItems.length} item</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sudah Diakui</p>
                <p className="text-lg font-bold">{formatRupiah(totalDiakui)}</p>
                <p className="text-xs text-muted-foreground">{diakuiItems.length} item</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-center">
            <Button
              onClick={() => setConfirmBulk(true)}
              disabled={!pendingItems.some((d: any) => d.tahun_target?.aktif) || bulkRecognizeMutation.isPending}
              className="w-full"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Akui Semua (TA Aktif)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Alert */}
      {pendingItems.some((d: any) => d.tahun_target?.aktif) && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Ada <strong>{pendingItems.filter((d: any) => d.tahun_target?.aktif).length}</strong> pembayaran di muka yang tahun ajaran targetnya sudah aktif dan siap diakui sebagai pendapatan.
          </p>
        </div>
      )}

      {/* Filter + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daftar Pendapatan Diterima di Muka</CardTitle>
            <Select value={filterTahunTarget || "__all__"} onValueChange={(v) => setFilterTahunTarget(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Filter TA target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua Tahun Ajaran</SelectItem>
                {tahunAjaranList?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.nama} {t.aktif ? "(Aktif)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={dimukaList || []} loading={isLoading} pageSize={20} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmRecognize}
        onOpenChange={() => setConfirmRecognize(null)}
        title="Akui Pendapatan"
        description="Pendapatan diterima di muka ini akan diakui sebagai pendapatan sesungguhnya. Jurnal penyesuaian akan dibuat otomatis (Debit: Pend. Diterima di Muka, Kredit: Pendapatan). Lanjutkan?"
        onConfirm={() => {
          if (confirmRecognize) recognizeMutation.mutate(confirmRecognize);
          setConfirmRecognize(null);
        }}
      />

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={() => setConfirmBulk(false)}
        title="Akui Semua Pendapatan (TA Aktif)"
        description={`Semua pendapatan di muka yang tahun ajaran targetnya sudah aktif (${pendingItems.filter((d: any) => d.tahun_target?.aktif).length} item, total ${formatRupiah(pendingItems.filter((d: any) => d.tahun_target?.aktif).reduce((s: number, d: any) => s + Number(d.jumlah || 0), 0))}) akan diakui. Lanjutkan?`}
        onConfirm={() => {
          bulkRecognizeMutation.mutate();
          setConfirmBulk(false);
        }}
      />
    </div>
  );
}
