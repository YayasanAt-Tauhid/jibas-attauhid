import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SiswaCombobox, SiswaRingkas } from "@/components/shared/SiswaCombobox";
import { RupiahInput } from "@/components/shared/RupiahInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Info, Zap, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRupiah, useAllJenisPembayaran, useTahunBuku, useLembaga, namaBulan, namaBulanTahun } from "@/hooks/useKeuangan";
import { useAllTarifTagihan, useCreateTarifTagihan, useUpdateTarifTagihan, useDeleteTarifTagihan } from "@/hooks/useTarifTagihan";
import { useTagihanList, useGenerateTagihan } from "@/hooks/useTagihan";
import { useKelas, useAngkatan } from "@/hooks/useAkademikData";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

export default function TabTarifTagihan() {
  const { data: tarifList, isLoading } = useAllTarifTagihan();
  const { data: jenisList } = useAllJenisPembayaran();
  const { data: kelasList } = useKelas();
  const { data: tahunList } = useTahunBuku();
  const { data: lembagaList } = useLembaga();
  const { data: angkatanList } = useAngkatan();

  const createMut = useCreateTarifTagihan();
  const updateMut = useUpdateTarifTagihan();
  const deleteMut = useDeleteTarifTagihan();
  const generateMut = useGenerateTagihan();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [broadConfirmOpen, setBroadConfirmOpen] = useState(false);

  // Form fields — urutan mengikuti ketergantungan: Lembaga → Jenis → target → nominal
  const [deptId, setDeptId] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [siswa, setSiswa] = useState<SiswaRingkas | null>(null);
  const [kelasId, setKelasId] = useState("");
  const [angkatanId, setAngkatanId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");

  // Filter kelas & angkatan by selected lembaga
  const filteredKelasList = useMemo(() => {
    if (!kelasList) return [];
    if (!deptId) return kelasList;
    return kelasList.filter((k: any) => k.departemen_id === deptId);
  }, [kelasList, deptId]);

  const filteredAngkatanList = useMemo(() => {
    if (!angkatanList) return [];
    if (!deptId) return angkatanList;
    return angkatanList.filter((a: any) => !a.departemen_id || a.departemen_id === deptId);
  }, [angkatanList, deptId]);

  // Filter jenis pembayaran by selected lembaga -- KHUSUS untuk dropdown di
  // form Tambah/Edit Tarif. Jenis dengan departemen_id NULL (berlaku umum
  // lintas lembaga) tetap ditampilkan terlepas dari lembaga yang dipilih.
  // TIDAK dipakai untuk dropdown filter tabel (Filter Jenis Pembayaran /
  // filter Daftar Tagihan) yang sengaja menampilkan semua jenis untuk
  // keperluan pencarian data yang sudah ada.
  const jenisListForForm = useMemo(() => {
    if (!jenisList) return [];
    if (!deptId) return jenisList;
    return jenisList.filter((j: any) => !j.departemen_id || j.departemen_id === deptId);
  }, [jenisList, deptId]);

  const handleLembagaChange = (v: string) => {
    const newDept = v === "__none__" ? "" : v;
    setDeptId(newDept);
    setKelasId("");
    // Kalau jenis/angkatan yang sudah dipilih tidak berlaku untuk lembaga
    // baru, reset — dan BERI TAHU user, jangan diam-diam.
    const jenisTerpilih = jenisList?.find((j: any) => j.id === jenisId);
    if (newDept && jenisTerpilih?.departemen_id && jenisTerpilih.departemen_id !== newDept) {
      setJenisId("");
      toast.info("Pilihan Jenis Pembayaran direset karena tidak berlaku untuk lembaga yang dipilih.");
    }
    const angkatanTerpilih = angkatanList?.find((a: any) => a.id === angkatanId);
    if (newDept && angkatanTerpilih?.departemen_id && angkatanTerpilih.departemen_id !== newDept) {
      setAngkatanId("");
      toast.info("Pilihan Angkatan direset karena tidak berlaku untuk lembaga yang dipilih.");
    }
  };

  // Auto-generate options
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [genBulanList, setGenBulanList] = useState<number[]>([]);
  const [genDeptId, setGenDeptId] = useState("");

  // Filter tarif
  const [filterJenis, setFilterJenis] = useState("");
  const [filterTarifKelas, setFilterTarifKelas] = useState("");
  const [filterTarifTahun, setFilterTarifTahun] = useState("");
  const [filterTarifSiswa, setFilterTarifSiswa] = useState<SiswaRingkas | null>(null);

  // Tagihan list filters
  const [filterTahunId, setFilterTahunId] = useState("");
  const [filterJenisId, setFilterJenisId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTagihanKelas, setFilterTagihanKelas] = useState("");
  const [filterSiswa, setFilterSiswa] = useState<SiswaRingkas | null>(null);

  const { data: tagihanDataRaw, isLoading: loadingTagihan } = useTagihanList({
    tahun_ajaran_id: filterTahunId || undefined,
    jenis_id: filterJenisId || undefined,
    status: filterStatus || undefined,
    siswa_id: filterSiswa?.id || undefined,
  });
  // Default (filter "Semua"): sembunyikan tagihan yang sudah dibatalkan, supaya
  // tidak tercampur dengan tagihan aktif. Pilih eksplisit "Dibatalkan" di filter
  // Status untuk melihatnya. Filter Kelas diterapkan di client karena
  // useTagihanList tidak punya parameter kelas_id.
  const tagihanData = useMemo(() => {
    if (!tagihanDataRaw) return tagihanDataRaw;
    let result = tagihanDataRaw;
    if (!filterStatus) result = result.filter((t: any) => t.status !== "dibatalkan");
    if (filterTagihanKelas) result = result.filter((t: any) => t.kelas_id === filterTagihanKelas);
    return result;
  }, [tagihanDataRaw, filterStatus, filterTagihanKelas]);

  const filteredData = useMemo(() => {
    if (!tarifList) return [];
    let result = tarifList;
    if (filterJenis) result = result.filter((t: any) => t.jenis_id === filterJenis);
    if (filterTarifKelas) result = result.filter((t: any) => t.kelas_id === filterTarifKelas);
    if (filterTarifTahun) result = result.filter((t: any) => t.tahun_ajaran_id === filterTarifTahun);
    if (filterTarifSiswa) result = result.filter((t: any) => t.siswa_id === filterTarifSiswa.id);
    return result;
  }, [tarifList, filterJenis, filterTarifKelas, filterTarifTahun, filterTarifSiswa]);

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";
  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const allSelected = genBulanList.length === 12;

  const toggleBulan = (b: number) => {
    setGenBulanList((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b].sort((a, c) => a - c));
  };

  const openAdd = () => {
    setEditItem(null); setJenisId(""); setSiswa(null); setDeptId(""); setKelasId(""); setAngkatanId(""); setTahunAjaranId(""); setNominal(""); setKeterangan("");
    setAutoGenerate(true); setGenBulanList([]); setGenDeptId("");
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setNominal(String(item.nominal ?? "").replace(/\D/g, ""));
    setKeterangan(item.keterangan || "");
    setDialogOpen(true);
  };

  // Deteksi tarif duplikat: jenis + scope persis sama dengan yang sudah ada
  const duplicateTarif = useMemo(() => {
    if (editItem || !jenisId || !tarifList) return null;
    const norm = (x: any) => x || null;
    return tarifList.find((t: any) =>
      t.jenis_id === jenisId &&
      norm(t.siswa_id) === norm(siswa?.id) &&
      norm(t.kelas_id) === norm(kelasId) &&
      norm(t.angkatan_id) === norm(angkatanId) &&
      norm(t.tahun_ajaran_id) === norm(tahunAjaranId)
    ) ?? null;
  }, [editItem, jenisId, siswa, kelasId, angkatanId, tahunAjaranId, tarifList]);

  // Validasi form — daftar alasan kenapa belum bisa disimpan, ditampilkan ke
  // user (bukan cuma tombol disabled tanpa penjelasan)
  const nominalNum = Number(nominal || 0);
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!editItem && !jenisId) errs.push("Jenis Pembayaran belum dipilih");
    if (!nominal) errs.push("Nominal belum diisi");
    else if (nominalNum <= 0) errs.push("Nominal harus lebih dari 0");
    if (!editItem && autoGenerate) {
      if (!tahunAjaranId) errs.push("Tahun Buku wajib dipilih saat opsi generate tagihan aktif");
      if (jenisId && !isSekali && genBulanList.length === 0) errs.push("Pilih minimal satu bulan untuk generate tagihan");
    }
    if (duplicateTarif) errs.push("Tarif dengan jenis & scope persis sama sudah ada — edit tarif yang lama, jangan buat duplikat");
    return errs;
  }, [editItem, jenisId, nominal, nominalNum, autoGenerate, tahunAjaranId, isSekali, genBulanList, duplicateTarif]);

  const canSave = validationErrors.length === 0;
  const isSaving = createMut.isPending || updateMut.isPending || generateMut.isPending;

  // Generate tanpa siswa/kelas/lembaga = SEMUA siswa aktif → wajib konfirmasi
  const isBroadGenerate = !editItem && autoGenerate && !siswa && !kelasId && !(genDeptId || deptId);

  const performSave = async () => {
    try {
      if (editItem) {
        await updateMut.mutateAsync({ id: editItem.id, nominal: nominalNum, keterangan: keterangan || undefined });
      } else {
        await createMut.mutateAsync({ jenis_id: jenisId, siswa_id: siswa?.id || null, kelas_id: kelasId || null, angkatan_id: angkatanId || null, tahun_ajaran_id: tahunAjaranId || null, nominal: nominalNum, keterangan: keterangan || undefined });

        // Auto-generate tagihan if checked
        if (autoGenerate && tahunAjaranId && jenisId) {
          try {
            const params: any = {
              tahun_ajaran_id: tahunAjaranId,
              jenis_id: jenisId,
            };
            if (siswa) params.siswa_id = siswa.id;
            if (kelasId) params.kelas_id = kelasId;
            const effectiveDeptId = genDeptId || deptId;
            if (effectiveDeptId) params.departemen_id = effectiveDeptId;
            if (!isSekali && genBulanList.length > 0) {
              params.bulan_list = genBulanList;
            }
            const genResult = await generateMut.mutateAsync(params);
            // Lapis pengaman tambahan: server function selalu resolve
            // (tidak reject) walau semua bulan gagal digenerate, jadi catch
            // di bawah ini tidak akan menangkap kasus "sukses API tapi 0
            // tagihan berhasil". Toast detail sudah ditampilkan oleh hook
            // useGenerateTagihan; di sini cukup pastikan dialog TIDAK
            // tertutup otomatis kalau generate gagal total, supaya user
            // sadar & bisa coba lagi tanpa harus buka ulang form dari nol.
            if (genResult.generated === 0 && genResult.errors && genResult.errors.length > 0) {
              return; // jangan setDialogOpen(false) -- biarkan user lihat & retry
            }
          } catch (genErr: any) {
            toast.error(`Tarif tersimpan, tapi generate tagihan gagal: ${genErr.message}`);
            return; // sama -- jangan tutup dialog otomatis saat generate gagal
          }
        }
      }
      setDialogOpen(false);
    } catch {
      // mutation error already handled by toast in hooks
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    if (isBroadGenerate) {
      setBroadConfirmOpen(true); // konfirmasi dulu — dampaknya semua siswa aktif
      return;
    }
    void performSave();
  };

  const getLevelBadge = (row: any) => {
    const parts: string[] = [];
    if (row.siswa_id) parts.push("Siswa");
    if (row.kelas_id) parts.push("Kelas");
    if (row.angkatan_id) parts.push("Angkatan");
    if (row.tahun_ajaran_id) parts.push("Tahun");
    if (parts.length === 0) return <Badge variant="outline">Umum</Badge>;
    return <Badge variant="secondary">{parts.join(" + ")}</Badge>;
  };

  const tarifColumns: DataTableColumn<any>[] = [
    { key: "jenis", label: "Jenis Pembayaran", render: (_, r) => (r as any).jenis?.nama || "-", sortable: true },
    { key: "level", label: "Level Override", render: (_, r) => getLevelBadge(r) },
    { key: "siswa", label: "Siswa", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : <span className="text-muted-foreground">—</span>; } },
    { key: "kelas", label: "Kelas", render: (_, r) => (r as any).kelas?.nama || <span className="text-muted-foreground">—</span> },
    { key: "angkatan", label: "Angkatan", render: (_, r) => (r as any).angkatan?.nama || <span className="text-muted-foreground">—</span> },
    { key: "tahun_ajaran", label: "Tahun Buku", render: (_, r) => (r as any).tahun_ajaran?.nama || <span className="text-muted-foreground">—</span> },
    { key: "nominal_default", label: "Nominal Default", render: (_, r) => { const def = (r as any).jenis?.nominal; return def ? <span className="text-muted-foreground">{formatRupiah(Number(def))}</span> : "-"; } },
    { key: "nominal", label: "Nominal Override", render: (v) => <span className="font-semibold text-primary">{formatRupiah(Number(v))}</span> },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const tagihanColumns: DataTableColumn<any>[] = [
    { key: "siswa", label: "Siswa", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : "-"; }, sortable: true },
    { key: "jenis", label: "Jenis", render: (_, r) => (r as any).jenis?.nama || "-" },
    { key: "kelas", label: "Kelas", render: (_, r) => (r as any).kelas?.nama || "-" },
    { key: "tahun_ajaran", label: "Tahun Buku", render: (_, r) => (r as any).tahun_ajaran?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v, r) => v ? namaBulanTahun(v as number, { tahunBukuNama: (r as any).tahun_ajaran?.nama }) : <Badge variant="outline">Sekali — TA {(r as any).tahun_ajaran?.nama || "-"}</Badge> },
    { key: "nominal", label: "Nominal", render: (v) => <span className="font-semibold">{formatRupiah(Number(v))}</span> },
    {
      key: "status", label: "Status",
      render: (v) => v === "lunas"
        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Lunas</Badge>
        : v === "dibatalkan"
          ? <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">Dibatalkan</Badge>
          : <Badge variant="destructive">Belum Bayar</Badge>,
    },
  ];

  return (
    <>
      {/* ─── Pengaturan Tarif ─── */}
      <Card className="mt-4">
        <CardContent className="pt-6 space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Tarif tagihan memungkinkan pengaturan nominal berbeda per <strong>siswa</strong>, <strong>kelas</strong>, dan/atau <strong>tahun buku</strong>.
              Prioritas: Siswa+Kelas+Tahun → Siswa+Tahun → Siswa → Kelas+Tahun → Kelas → Tahun → Default.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-64">
              <Label className="text-xs">Filter Jenis Pembayaran</Label>
              <Select value={filterJenis || "__all__"} onValueChange={(v) => setFilterJenis(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Jenis</SelectItem>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Filter Kelas</Label>
              <Select value={filterTarifKelas || "__all__"} onValueChange={(v) => setFilterTarifKelas(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Kelas</SelectItem>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Filter Tahun Buku</Label>
              <Select value={filterTarifTahun || "__all__"} onValueChange={(v) => setFilterTarifTahun(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua tahun buku" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Tahun Buku</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Label className="text-xs">Filter Siswa</Label>
              <SiswaCombobox value={filterTarifSiswa} onChange={setFilterTarifSiswa} placeholder="Semua siswa" />
            </div>
            {(filterJenis || filterTarifKelas || filterTarifTahun || filterTarifSiswa) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => { setFilterJenis(""); setFilterTarifKelas(""); setFilterTarifTahun(""); setFilterTarifSiswa(null); }}>
                Reset Filter
              </Button>
            )}
          </div>
          <DataTable columns={tarifColumns} data={filteredData} loading={isLoading} pageSize={20} actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Tarif</Button>} />
        </CardContent>
      </Card>

      {/* ─── Daftar Tagihan ─── */}
      <Card className="mt-4">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Daftar Tagihan</h3>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Tagihan & <strong>jurnal piutang otomatis</strong> (Debit Piutang | Credit Pendapatan) dibuat saat menyimpan tarif baru dengan opsi generate dicentang.
              Saat pembayaran diterima, jurnal akan otomatis menjadi Debit Kas | Credit Piutang.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-48">
              <Label className="text-xs">Tahun Buku</Label>
              <Select value={filterTahunId || "__all__"} onValueChange={(v) => setFilterTahunId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Jenis Pembayaran</Label>
              <Select value={filterJenisId || "__all__"} onValueChange={(v) => setFilterJenisId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  <SelectItem value="belum_bayar">Belum Bayar</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                  <SelectItem value="dibatalkan">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Kelas</Label>
              <Select value={filterTagihanKelas || "__all__"} onValueChange={(v) => setFilterTagihanKelas(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Label className="text-xs">Siswa</Label>
              <SiswaCombobox value={filterSiswa} onChange={setFilterSiswa} placeholder="Semua siswa" />
            </div>
            {(filterTahunId || filterJenisId || filterStatus || filterTagihanKelas || filterSiswa) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => { setFilterTahunId(""); setFilterJenisId(""); setFilterStatus(""); setFilterTagihanKelas(""); setFilterSiswa(null); }}>
                Reset Filter
              </Button>
            )}
          </div>

          <DataTable columns={tagihanColumns} data={tagihanData || []} loading={loadingTagihan} pageSize={20} />
        </CardContent>
      </Card>

      {/* ─── Dialog Tambah/Edit Tarif ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Tarif Tagihan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {editItem ? (
              /* Mode edit: jenis & scope terkunci — tampilkan sebagai ringkasan
                 read-only, bukan deretan dropdown disabled dengan peringatan
                 berulang. Hanya Nominal & Keterangan yang bisa diubah. */
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Jenis Pembayaran</span><span className="font-medium text-right">{editItem.jenis?.nama || "-"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Siswa</span><span className="text-right">{editItem.siswa ? `${editItem.siswa.nama} (${editItem.siswa.nis || "-"})` : "Semua siswa"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Kelas</span><span className="text-right">{editItem.kelas?.nama || "Semua kelas"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Angkatan</span><span className="text-right">{editItem.angkatan?.nama || "Semua angkatan"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Tahun Buku</span><span className="text-right">{editItem.tahun_ajaran?.nama || "Semua tahun buku"}</span></div>
                <p className="text-xs text-muted-foreground pt-1.5 border-t mt-2">
                  Jenis & scope tidak bisa diubah agar tagihan yang sudah ada tetap valid. Hapus dan buat ulang jika perlu mengubahnya.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label>Lembaga (opsional)</Label>
                  <Select value={deptId || "__none__"} onValueChange={handleLembagaChange}>
                    <SelectTrigger><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Semua Lembaga —</SelectItem>
                      {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Memfilter pilihan jenis pembayaran, kelas, dan angkatan di bawah</p>
                </div>
                <div>
                  <Label>Jenis Pembayaran *</Label>
                  <Select value={jenisId} onValueChange={(v) => { setJenisId(v); setGenBulanList([]); }}>
                    <SelectTrigger><SelectValue placeholder="Pilih jenis pembayaran..." /></SelectTrigger>
                    <SelectContent>{jenisListForForm?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(Default: ${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Siswa (opsional)</Label>
                  <SiswaCombobox
                    value={siswa}
                    onChange={(s) => {
                      setSiswa(s);
                      // Auto-isi Lembaga dari data siswa sebagai default yang nyaman
                      // untuk kasus umum (tarif untuk lembaga siswa saat ini). Tetap
                      // bisa diganti manual -- mis. siswa kelas 6 SD yang mau
                      // diinputkan tarif SPP/Uang Pangkal untuk SMP (jenjang berikutnya).
                      if (s && !deptId && s.departemen_id) {
                        setDeptId(s.departemen_id);
                        setKelasId("");
                        toast.info("Lembaga otomatis diisi dari data siswa — bisa diganti manual jika perlu.");
                      }
                    }}
                    placeholder="Semua siswa — atau cari nama/NIS..."
                  />
                </div>
                <div>
                  <Label>Kelas (opsional)</Label>
                  <Select value={kelasId || "__none__"} onValueChange={(v) => setKelasId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Semua Kelas —</SelectItem>
                      {filteredKelasList.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Angkatan (opsional)</Label>
                  <Select value={angkatanId || "__none__"} onValueChange={(v) => setAngkatanId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Semua angkatan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Semua Angkatan —</SelectItem>
                      {filteredAngkatanList.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nama}{a.departemen ? ` — ${a.departemen.nama}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tahun Buku {autoGenerate ? "*" : "(opsional)"}</Label>
                  <Select value={tahunAjaranId || "__none__"} onValueChange={(v) => setTahunAjaranId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Semua tahun buku" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Semua Tahun Buku —</SelectItem>
                      {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Nominal Override *</Label>
              <RupiahInput value={nominal} onChange={setNominal} />
              <p className="text-xs text-muted-foreground mt-1">
                Nominal ini akan menggantikan nominal default
                {!editItem && selectedJenis?.nominal ? <> (default saat ini: <strong>{formatRupiah(Number(selectedJenis.nominal))}</strong>)</> : null}
              </p>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Misal: Beasiswa prestasi, potongan 50%" />
            </div>

            {/* Auto-generate section - only for new tarif */}
            {!editItem && (
              <>
                <Separator />
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={autoGenerate}
                      onCheckedChange={(v) => setAutoGenerate(!!v)}
                    />
                    <span className="text-sm font-medium">Generate tagihan & jurnal piutang otomatis</span>
                  </label>

                  {autoGenerate && (
                    <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                      <Alert className="py-2">
                        <Info className="h-3 w-3" />
                        <AlertDescription className="text-xs">
                          Akan membuat tagihan + jurnal piutang untuk{" "}
                          {siswa
                            ? <strong>siswa {siswa.nama}</strong>
                            : kelasId
                              ? <strong>siswa di kelas {filteredKelasList.find((k: any) => k.id === kelasId)?.nama}</strong>
                              : (deptId || genDeptId)
                                ? <strong>siswa di lembaga {lembagaList?.find((l: any) => l.id === (deptId || genDeptId))?.kode}</strong>
                                : <strong>semua siswa aktif di tahun buku terpilih</strong>
                          }. Siswa yang sudah punya tagihan akan di-skip.
                        </AlertDescription>
                      </Alert>

                      {jenisId && isSekali && (
                        <p className="text-xs text-muted-foreground">
                          Tipe <Badge variant="outline" className="text-xs">1x Bayar</Badge> — tagihan di-generate tanpa bulan
                        </p>
                      )}

                      {jenisId && !isSekali && (
                        <div>
                          <Label className="text-xs">Bulan *</Label>
                          <div className="flex items-center gap-2 mb-2 mt-1">
                            <Checkbox
                              id="select-all-months"
                              checked={allSelected}
                              onCheckedChange={(checked) => setGenBulanList(checked ? [...allMonths] : [])}
                            />
                            <label htmlFor="select-all-months" className="text-sm cursor-pointer">Pilih semua (12 bulan)</label>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {allMonths.map((b) => (
                              <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={genBulanList.includes(b)}
                                  onCheckedChange={() => toggleBulan(b)}
                                />
                                {namaBulan(b)}
                              </label>
                            ))}
                          </div>
                          {genBulanList.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {genBulanList.length} bulan dipilih
                            </p>
                          )}
                        </div>
                      )}

                      {!deptId && !siswa && !kelasId && (
                        <div>
                          <Label className="text-xs">Lembaga (opsional — filter generate)</Label>
                          <Select value={genDeptId || "__all__"} onValueChange={(v) => setGenDeptId(v === "__all__" ? "" : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">Semua Lembaga</SelectItem>
                              {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Checklist kekurangan — user tahu persis kenapa tombol Simpan mati */}
            {validationErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                {validationErrors.map((err) => (
                  <p key={err} className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!canSave || isSaving}>
              {isSaving ? "Memproses..." : editItem ? "Simpan" : autoGenerate ? "Simpan & Generate" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi generate skala luas — tanpa siswa/kelas/lembaga terpilih */}
      <ConfirmDialog
        open={broadConfirmOpen}
        onOpenChange={setBroadConfirmOpen}
        title="Generate untuk Semua Siswa Aktif?"
        description="Tidak ada siswa, kelas, atau lembaga yang dipilih — tagihan & jurnal piutang akan dibuat untuk SEMUA siswa aktif pada tahun buku terpilih. Siswa yang sudah punya tagihan akan di-skip. Lanjutkan?"
        onConfirm={() => { setBroadConfirmOpen(false); void performSave(); }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Hapus Tarif Tagihan"
        description="Yakin ingin menghapus tarif ini? Tagihan yang sudah ter-generate dari tarif ini TIDAK ikut terhapus — jika perlu, batalkan tagihannya lewat menu Tunggakan/Piutang."
        onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
      />
    </>
  );
}
