import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/shared/StatsCard";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  useKasKecilSetting, useUpdateKasKecilSetting,
  useTransaksiKasKecilList, useCreateTransaksiKasKecil,
  useUpdateTransaksiKasKecil, useDeleteTransaksiKasKecil,
  useReplenishmentList, useCreateReplenishment,
  useSaldoKasKecil,
} from "@/hooks/useKasKecil";
import { useJenisPengeluaran, formatRupiah } from "@/hooks/useKeuangan";
import { useAkunRekening } from "@/hooks/useJurnal";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Wallet, RefreshCw,
  AlertCircle, CheckCircle, Settings, ArrowDownCircle,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const now = new Date();
const BULAN_LABELS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

export default function KasKecil() {
  const [activeTab, setActiveTab] = useState("transaksi");

  // ── Filter transaksi ──────────────────────────────────────────────────────
  const [filterBulan, setFilterBulan] = useState(now.getMonth() + 1);
  const [filterTahun, setFilterTahun] = useState(now.getFullYear());

  // ── Dialog tambah/edit transaksi ──────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [formTanggal, setFormTanggal] = useState(format(now, "yyyy-MM-dd"));
  const [formKeterangan, setFormKeterangan] = useState("");
  const [formJenisId, setFormJenisId] = useState("");
  const [formJumlah, setFormJumlah] = useState("");
  const [formPenerima, setFormPenerima] = useState("");
  const [formNoBukti, setFormNoBukti] = useState("");

  // ── Dialog replenishment ──────────────────────────────────────────────────
  const [repDialog, setRepDialog] = useState(false);
  const [repTanggal, setRepTanggal] = useState(format(now, "yyyy-MM-dd"));
  const [repKeterangan, setRepKeterangan] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Dialog hapus ─────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Dialog pengaturan ─────────────────────────────────────────────────────
  const [settingDialog, setSettingDialog] = useState(false);
  const [settingImprest, setSettingImprest] = useState("");
  const [settingAkunKasKecil, setSettingAkunKasKecil] = useState("");
  const [settingAkunPengisian, setSettingAkunPengisian] = useState("");
  const [settingKeterangan, setSettingKeterangan] = useState("");

  // ── Queries & Mutations ───────────────────────────────────────────────────
  const { data: saldo } = useSaldoKasKecil();
  const { data: setting } = useKasKecilSetting();
  const { data: transaksiList, isLoading } = useTransaksiKasKecilList({
    bulan: filterBulan,
    tahun: filterTahun,
  });
  const { data: pendingList } = useTransaksiKasKecilList({ onlyPending: true });
  const { data: repList, isLoading: repLoading } = useReplenishmentList();
  const { data: jenisList } = useJenisPengeluaran();
  const { data: akunList } = useAkunRekening();

  const { data: sekolah } = useQuery({
    queryKey: ["sekolah"],
    queryFn: async () => {
      const { data } = await supabase.from("sekolah").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const createMut = useCreateTransaksiKasKecil();
  const updateMut = useUpdateTransaksiKasKecil();
  const deleteMut = useDeleteTransaksiKasKecil();
  const repMut = useCreateReplenishment();
  const settingMut = useUpdateKasKecilSetting();

  // ── Handlers: Transaksi ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditItem(null);
    setFormTanggal(format(now, "yyyy-MM-dd"));
    setFormKeterangan("");
    setFormJenisId("");
    setFormJumlah("");
    setFormPenerima("");
    setFormNoBukti("");
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setFormTanggal(item.tanggal);
    setFormKeterangan(item.keterangan || "");
    setFormJenisId(item.jenis_pengeluaran_id || "");
    setFormJumlah(String(item.jumlah));
    setFormPenerima(item.penerima || "");
    setFormNoBukti(item.no_bukti || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formKeterangan || !formJumlah) {
      toast.error("Keterangan dan jumlah wajib diisi");
      return;
    }
    const values = {
      tanggal: formTanggal,
      keterangan: formKeterangan,
      jenis_pengeluaran_id: formJenisId || null,
      jumlah: Number(formJumlah),
      penerima: formPenerima || null,
      no_bukti: formNoBukti || null,
    };
    if (editItem) {
      if (editItem.replenishment_id) {
        toast.error("Transaksi yang sudah diisi ulang tidak bisa diubah.");
        return;
      }
      await updateMut.mutateAsync({ id: editItem.id, ...values });
    } else {
      await createMut.mutateAsync(values);
    }
    setDialogOpen(false);
  };

  // ── Handlers: Replenishment ───────────────────────────────────────────────
  const openRepDialog = () => {
    if (!pendingList || pendingList.length === 0) {
      toast.info("Tidak ada transaksi yang belum diisi ulang.");
      return;
    }
    setSelectedIds(new Set(pendingList.map((t: any) => t.id)));
    setRepTanggal(format(now, "yyyy-MM-dd"));
    setRepKeterangan("");
    setRepDialog(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotal = (pendingList || [])
    .filter((t: any) => selectedIds.has(t.id))
    .reduce((s: number, t: any) => s + Number(t.jumlah), 0);

  const handleReplenish = async () => {
    if (selectedIds.size === 0) {
      toast.error("Pilih minimal satu transaksi.");
      return;
    }
    await repMut.mutateAsync({
      tanggal: repTanggal,
      keterangan: repKeterangan,
      transaksiIds: Array.from(selectedIds),
    });
    setRepDialog(false);
  };

  // ── Handlers: Setting ─────────────────────────────────────────────────────
  const openSettingDialog = () => {
    setSettingImprest(String(setting?.dana_imprest || 0));
    setSettingAkunKasKecil(setting?.akun_kas_kecil_id || "");
    setSettingAkunPengisian(setting?.akun_pengisian_id || "");
    setSettingKeterangan(setting?.keterangan || "");
    setSettingDialog(true);
  };

  const handleSaveSetting = async () => {
    await settingMut.mutateAsync({
      dana_imprest: Number(settingImprest),
      akun_kas_kecil_id: settingAkunKasKecil || null,
      akun_pengisian_id: settingAkunPengisian || null,
      keterangan: settingKeterangan || null,
    });
    setSettingDialog(false);
  };

  // ── Kolom tabel transaksi ─────────────────────────────────────────────────
  const kolom: DataTableColumn<any>[] = [
    {
      key: "tanggal", label: "Tanggal", sortable: true,
      render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-",
    },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    {
      key: "jenis", label: "Jenis",
      render: (_, r) => (r as any).jenis_pengeluaran?.nama || <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: "penerima", label: "Penerima", render: (v) => (v as string) || "-" },
    { key: "no_bukti", label: "No. Bukti", render: (v) => (v as string) || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    {
      key: "status", label: "Status",
      render: (_, r) =>
        (r as any).replenishment_id
          ? <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30" variant="outline"><CheckCircle className="h-3 w-3 mr-1" />Sudah Diisi</Badge>
          : <Badge className="bg-amber-50 text-amber-700 border-amber-300" variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Belum Diisi</Badge>,
    },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            disabled={!!(r as any).replenishment_id}
            onClick={() => openEdit(r)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
            disabled={!!(r as any).replenishment_id}
            onClick={() => setDeleteId((r as any).id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // ── Kolom tabel replenishment ─────────────────────────────────────────────
  const kolomRep: DataTableColumn<any>[] = [
    {
      key: "tanggal", label: "Tanggal", sortable: true,
      render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-",
    },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    {
      key: "jurnal", label: "Jurnal",
      render: (_, r) => {
        const j = (r as any).jurnal;
        return j?.nomor
          ? <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30" variant="outline"><CheckCircle className="h-3 w-3 mr-1" />{j.nomor}</Badge>
          : <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Belum dijurnal</Badge>;
      },
    },
  ];

  const pendingCount = pendingList?.length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kas Kecil</h1>
          <p className="text-sm text-muted-foreground">Petty cash — sistem imprest</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openSettingDialog}>
            <Settings className="h-4 w-4 mr-2" />Pengaturan
          </Button>
          <Button variant="outline" size="sm" onClick={openRepDialog} disabled={pendingCount === 0}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Isi Ulang {pendingCount > 0 && <Badge className="ml-1 h-5 px-1.5 text-xs">{pendingCount}</Badge>}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />Catat Pengeluaran
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Saldo Kas Kecil"
          value={formatRupiah(saldo?.saldo ?? 0)}
          icon={Wallet}
          color={saldo && saldo.saldo < saldo.imprest * 0.25 ? "destructive" : "success"}
        />
        <StatsCard
          title="Dana Imprest"
          value={formatRupiah(saldo?.imprest ?? 0)}
          icon={ArrowDownCircle}
          color="info"
        />
        <StatsCard
          title="Belum Diisi Ulang"
          value={formatRupiah(saldo?.pending ?? 0)}
          icon={AlertCircle}
          color={pendingCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
          <TabsTrigger value="replenishment">
            Riwayat Pengisian
          </TabsTrigger>
        </TabsList>

        {/* Tab Transaksi */}
        <TabsContent value="transaksi" className="space-y-4 mt-4">
          {/* Filter */}
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label>Bulan</Label>
              <Select value={String(filterBulan)} onValueChange={(v) => setFilterBulan(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULAN_LABELS.map((b, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tahun</Label>
              <Input type="number" className="w-24" value={filterTahun}
                onChange={(e) => setFilterTahun(Number(e.target.value))} />
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={kolom}
                data={transaksiList || []}
                loading={isLoading}
                exportable
                exportFilename="transaksi_kas_kecil"
                pageSize={20}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Replenishment */}
        <TabsContent value="replenishment" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={kolomRep}
                data={repList || []}
                loading={repLoading}
                exportable
                exportFilename="replenishment_kas_kecil"
                pageSize={20}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog Tambah/Edit Transaksi ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Transaksi Kas Kecil" : "Catat Pengeluaran Kas Kecil"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tanggal *</Label>
              <Input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} />
            </div>
            <div>
              <Label>Keterangan *</Label>
              <Textarea value={formKeterangan} onChange={(e) => setFormKeterangan(e.target.value)}
                placeholder="Keperluan pengeluaran..." />
            </div>
            <div>
              <Label>Jenis Pengeluaran</Label>
              <Select value={formJenisId || "__none__"} onValueChange={(v) => setFormJenisId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis (opsional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak ada —</SelectItem>
                  {(jenisList || []).map((j: any) => (
                    <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jumlah (Rp) *</Label>
              <Input type="number" value={formJumlah} onChange={(e) => setFormJumlah(e.target.value)}
                placeholder="0" min="1" />
            </div>
            <div>
              <Label>Penerima</Label>
              <Input value={formPenerima} onChange={(e) => setFormPenerima(e.target.value)}
                placeholder="Nama penerima (opsional)" />
            </div>
            <div>
              <Label>No. Bukti / Kwitansi</Label>
              <Input value={formNoBukti} onChange={(e) => setFormNoBukti(e.target.value)}
                placeholder="Nomor kwitansi (opsional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave}
              disabled={!formKeterangan || !formJumlah || createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Replenishment ── */}
      <Dialog open={repDialog} onOpenChange={setRepDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Isi Ulang Kas Kecil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tanggal Pengisian *</Label>
                <Input type="date" value={repTanggal} onChange={(e) => setRepTanggal(e.target.value)} />
              </div>
              <div>
                <Label>Keterangan</Label>
                <Input value={repKeterangan} onChange={(e) => setRepKeterangan(e.target.value)}
                  placeholder="Opsional" />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Transaksi yang akan diisi ulang</Label>
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {(pendingList || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Tidak ada transaksi pending</p>
                ) : (
                  (pendingList || []).map((t: any) => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Checkbox
                        checked={selectedIds.has(t.id)}
                        onCheckedChange={() => toggleSelect(t.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.keterangan}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(t.tanggal), "dd MMM yyyy", { locale: idLocale })}
                          {t.jenis_pengeluaran?.nama && ` · ${t.jenis_pengeluaran.nama}`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{formatRupiah(Number(t.jumlah))}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="bg-muted rounded-md px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{selectedIds.size} transaksi dipilih</span>
                <span className="font-bold text-sm">{formatRupiah(selectedTotal)}</span>
              </div>
            )}

            {!setting?.akun_pengisian_id && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Akun pengisian belum dikonfigurasi — jurnal otomatis tidak akan dibuat.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepDialog(false)}>Batal</Button>
            <Button onClick={handleReplenish}
              disabled={selectedIds.size === 0 || repMut.isPending}>
              {repMut.isPending ? "Memproses..." : `Isi Ulang ${formatRupiah(selectedTotal)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Pengaturan ── */}
      <Dialog open={settingDialog} onOpenChange={setSettingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengaturan Kas Kecil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dana Imprest (Rp)</Label>
              <Input type="number" value={settingImprest}
                onChange={(e) => setSettingImprest(e.target.value)}
                placeholder="Contoh: 2000000" />
              <p className="text-xs text-muted-foreground mt-1">
                Jumlah tetap dana kas kecil yang selalu dipertahankan.
              </p>
            </div>
            <div>
              <Label>Akun Kas Kecil</Label>
              <Select value={settingAkunKasKecil || "__none__"}
                onValueChange={(v) => setSettingAkunKasKecil(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih akun aset kas kecil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak dipilih —</SelectItem>
                  {(akunList || [])
                    .filter((a: any) => a.jenis === "aset")
                    .map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.kode} — {a.nama}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Akun aset untuk pencatatan dana kas kecil.</p>
            </div>
            <div>
              <Label>Akun Sumber Pengisian</Label>
              <Select value={settingAkunPengisian || "__none__"}
                onValueChange={(v) => setSettingAkunPengisian(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih akun kas/bank" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak dipilih —</SelectItem>
                  {(akunList || [])
                    .filter((a: any) => a.jenis === "aset")
                    .map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.kode} — {a.nama}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Akun kas/bank yang dikredit saat pengisian ulang (jurnal otomatis).
              </p>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea value={settingKeterangan}
                onChange={(e) => setSettingKeterangan(e.target.value)}
                placeholder="Catatan pengaturan (opsional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingDialog(false)}>Batal</Button>
            <Button onClick={handleSaveSetting} disabled={settingMut.isPending}>
              {settingMut.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi Hapus ── */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Hapus Transaksi Kas Kecil"
        description="Data transaksi yang dihapus tidak dapat dikembalikan."
        onConfirm={() => {
          if (deleteId) deleteMut.mutate(deleteId);
          setDeleteId(null);
        }}
        loading={deleteMut.isPending}
      />
    </div>
  );
}
