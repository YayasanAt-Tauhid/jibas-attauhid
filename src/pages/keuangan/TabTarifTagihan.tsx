import { useState, useMemo, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Plus, Pencil, Trash2, Info, Zap, AlertCircle, Users } from "lucide-react";
import TarifMassalDialog from "./TarifMassalDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRupiah, useAllJenisPembayaran, useTahunBuku, useLembaga, namaBulan, namaBulanTahun } from "@/hooks/useKeuangan";
import { useAllTarifTagihan, useCreateTarifTagihan, useUpdateTarifTagihan, useDeleteTarifTagihan } from "@/hooks/useTarifTagihan";
import { useTagihanList, useGenerateTagihan } from "@/hooks/useTagihan";
import { useKelas, useAngkatan } from "@/hooks/useAkademikData";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

// Skema field Tambah/Edit Tarif. Field scope (jenis/siswa/kelas/dst) hanya
// wajib & divalidasi saat mode tambah -- di mode edit field-field itu terkunci
// (lihat superRefine di buildTarifSchema, dan render read-only summary di JSX).
const tarifFormSchema = z.object({
  deptId: z.string(),
  jenisId: z.string(),
  siswa: z.custom<SiswaRingkas | null>(),
  kelasId: z.string(),
  angkatanId: z.string(),
  tahunAjaranId: z.string(),
  nominal: z.string(),
  keterangan: z.string(),
  autoGenerate: z.boolean(),
  genBulanList: z.array(z.number()),
  genDeptId: z.string(),
});
type TarifFormValues = z.infer<typeof tarifFormSchema>;

const tarifFormDefaults: TarifFormValues = {
  deptId: "", jenisId: "", siswa: null, kelasId: "", angkatanId: "", tahunAjaranId: "",
  nominal: "", keterangan: "", autoGenerate: true, genBulanList: [], genDeptId: "",
};

// Validasi bertingkat: field wajib (create-only) + deteksi tarif duplikat —
// keduanya butuh data live (jenisList, tarifList) makanya schema dibangun
// lewat factory, bukan objek statis.
function buildTarifSchema(opts: { isEditMode: boolean; jenisById: Map<string, any>; tarifList: any[] | undefined }) {
  return tarifFormSchema.superRefine((data, ctx) => {
    if (!data.nominal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nominal"], message: "Nominal belum diisi" });
    } else if (Number(data.nominal) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nominal"], message: "Nominal harus lebih dari 0" });
    }
    if (opts.isEditMode) return;

    if (!data.jenisId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jenisId"], message: "Jenis Pembayaran belum dipilih" });
    }
    if (data.autoGenerate) {
      if (!data.tahunAjaranId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tahunAjaranId"], message: "Tahun Buku wajib dipilih saat opsi generate tagihan aktif" });
      }
      const isSekali = data.jenisId ? opts.jenisById.get(data.jenisId)?.tipe === "sekali" : false;
      if (data.jenisId && !isSekali && data.genBulanList.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["genBulanList"], message: "Pilih minimal satu bulan untuk generate tagihan" });
      }
    }

    if (data.jenisId) {
      const norm = (x: string) => x || null;
      const duplicate = opts.tarifList?.find((t: any) =>
        t.jenis_id === data.jenisId &&
        norm(t.siswa_id) === norm(data.siswa?.id ?? "") &&
        norm(t.kelas_id) === norm(data.kelasId) &&
        norm(t.angkatan_id) === norm(data.angkatanId) &&
        norm(t.tahun_ajaran_id) === norm(data.tahunAjaranId)
      );
      if (duplicate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jenisId"], message: "Tarif dengan jenis & scope persis sama sudah ada — edit tarif yang lama, jangan buat duplikat" });
      }
    }
  });
}

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
  const [pendingSaveData, setPendingSaveData] = useState<TarifFormValues | null>(null);
  const [massalOpen, setMassalOpen] = useState(false);

  const jenisById = useMemo(() => new Map((jenisList ?? []).map((j: any) => [j.id, j])), [jenisList]);

  // Form fields — urutan mengikuti ketergantungan: Lembaga → Jenis → target → nominal
  const form = useForm<TarifFormValues>({
    resolver: zodResolver(buildTarifSchema({ isEditMode: !!editItem, jenisById, tarifList })),
    mode: "onChange",
    defaultValues: tarifFormDefaults,
  });
  const deptId = form.watch("deptId");
  const jenisId = form.watch("jenisId");
  const siswa = form.watch("siswa");
  const kelasId = form.watch("kelasId");
  const angkatanId = form.watch("angkatanId");
  const tahunAjaranId = form.watch("tahunAjaranId");
  const nominal = form.watch("nominal");

  const selectedJenisForm = jenisById.get(jenisId);
  // Lembaga efektif: eksplisit dipilih user, atau diturunkan dari jenis
  // pembayaran terpilih kalau jenis itu scoped ke satu lembaga. Dipakai untuk
  // membatasi pilihan Kelas/Angkatan (target scope tarif). Siswa TIDAK
  // dibatasi ke lembaga ini -- kasus sah: tarif SPP/Uang Pangkal SMP untuk
  // siswa yang masih kelas 6 SD (lihat validationWarnings di bawah).
  const effectiveDeptId = deptId || selectedJenisForm?.departemen_id || "";

  // Filter kelas & angkatan by lembaga efektif
  const filteredKelasList = useMemo(() => {
    if (!kelasList) return [];
    if (!effectiveDeptId) return kelasList;
    return kelasList.filter((k: any) => k.departemen_id === effectiveDeptId);
  }, [kelasList, effectiveDeptId]);

  const filteredAngkatanList = useMemo(() => {
    if (!angkatanList) return [];
    if (!effectiveDeptId) return angkatanList;
    return angkatanList.filter((a: any) => !a.departemen_id || a.departemen_id === effectiveDeptId);
  }, [angkatanList, effectiveDeptId]);

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
    form.setValue("deptId", newDept, { shouldValidate: true });
    form.setValue("kelasId", "", { shouldValidate: true });
    // Kalau jenis/angkatan/siswa yang sudah dipilih tidak berlaku untuk
    // lembaga baru, reset — dan BERI TAHU user, jangan diam-diam.
    const jenisTerpilih = jenisById.get(jenisId);
    if (newDept && jenisTerpilih?.departemen_id && jenisTerpilih.departemen_id !== newDept) {
      form.setValue("jenisId", "", { shouldValidate: true });
      toast.info("Pilihan Jenis Pembayaran direset karena tidak berlaku untuk lembaga yang dipilih.");
    }
    const angkatanTerpilih = angkatanList?.find((a: any) => a.id === angkatanId);
    if (newDept && angkatanTerpilih?.departemen_id && angkatanTerpilih.departemen_id !== newDept) {
      form.setValue("angkatanId", "", { shouldValidate: true });
      toast.info("Pilihan Angkatan direset karena tidak berlaku untuk lembaga yang dipilih.");
    }
    // Siswa SENGAJA tidak direset/dibatasi ke lembaga ini — kasus umum:
    // siswa kelas 6 SD yang mau diinputkan tarif SPP/Uang Pangkal SMP untuk
    // jenjang berikutnya. Mismatch cukup ditandai sebagai peringatan (lihat
    // validationWarnings), bukan diblokir.
  };

  const autoGenerate = form.watch("autoGenerate");
  const genBulanList = form.watch("genBulanList");
  const genDeptId = form.watch("genDeptId");

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

  const selectedJenis = jenisById.get(jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";
  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const allSelected = genBulanList.length === 12;

  const toggleBulan = (b: number) => {
    const next = genBulanList.includes(b) ? genBulanList.filter((x) => x !== b) : [...genBulanList, b].sort((a, c) => a - c);
    form.setValue("genBulanList", next, { shouldValidate: true });
  };

  const openAdd = () => {
    setEditItem(null);
    form.reset(tarifFormDefaults);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    form.reset({ ...tarifFormDefaults, nominal: String(item.nominal ?? "").replace(/\D/g, ""), keterangan: item.keterangan || "" });
    setDialogOpen(true);
  };

  // Pastikan checklist validasi & tombol Simpan langsung akurat saat dialog
  // dibuka -- mode "onChange" baru menghitung ulang isValid/errors setelah
  // field pertama disentuh, dan resolver-nya sendiri butuh render berikutnya
  // supaya bergantung ke editItem/tarifList yang terbaru.
  useEffect(() => {
    if (dialogOpen) void form.trigger();
  }, [dialogOpen, editItem, form]);

  // Peringatan (tidak memblokir simpan) — mis. siswa masih tercatat di
  // lembaga lain dari Lembaga/Jenis Pembayaran terpilih. Ini SAH untuk kasus
  // seperti tarif SPP/Uang Pangkal SMP bagi siswa yang masih kelas 6 SD
  // (belum resmi naik jenjang), jadi cukup diingatkan, bukan diblokir.
  const validationWarnings = useMemo(() => {
    const warns: string[] = [];
    if (!editItem && siswa && effectiveDeptId && siswa.departemen_id && siswa.departemen_id !== effectiveDeptId) {
      warns.push("Siswa terpilih tercatat di lembaga lain dari Lembaga/Jenis Pembayaran ini — pastikan ini memang disengaja (mis. tarif jenjang berikutnya).");
    }
    return warns;
  }, [editItem, siswa, effectiveDeptId]);

  // Checklist kekurangan ditampilkan ke user (bukan cuma tombol disabled tanpa
  // penjelasan) — sumbernya sekarang error zod dari buildTarifSchema di atas.
  const validationErrors = useMemo(
    () => Object.values(form.formState.errors).map((e) => e?.message).filter((m): m is string => !!m),
    [form.formState.errors]
  );
  const canSave = form.formState.isValid;
  const isSaving = createMut.isPending || updateMut.isPending || generateMut.isPending;

  const performSave = async (data: TarifFormValues) => {
    const nominalNum = Number(data.nominal || 0);
    const isSekaliData = data.jenisId ? jenisById.get(data.jenisId)?.tipe === "sekali" : false;
    try {
      if (editItem) {
        await updateMut.mutateAsync({ id: editItem.id, nominal: nominalNum, keterangan: data.keterangan || undefined });
      } else {
        await createMut.mutateAsync({ jenis_id: data.jenisId, siswa_id: data.siswa?.id || null, kelas_id: data.kelasId || null, angkatan_id: data.angkatanId || null, tahun_ajaran_id: data.tahunAjaranId || null, nominal: nominalNum, keterangan: data.keterangan || undefined });

        // Auto-generate tagihan if checked
        if (data.autoGenerate && data.tahunAjaranId && data.jenisId) {
          try {
            const params: any = {
              tahun_ajaran_id: data.tahunAjaranId,
              jenis_id: data.jenisId,
            };
            if (data.siswa) params.siswa_id = data.siswa.id;
            if (data.kelasId) params.kelas_id = data.kelasId;
            const effectiveGenDeptId = data.genDeptId || data.deptId;
            if (effectiveGenDeptId) params.departemen_id = effectiveGenDeptId;
            if (!isSekaliData && data.genBulanList.length > 0) {
              params.bulan_list = data.genBulanList;
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

  const onSubmit = (data: TarifFormValues) => {
    // Generate tanpa siswa/kelas/lembaga = SEMUA siswa aktif → wajib konfirmasi
    const isBroadGenerate = !editItem && data.autoGenerate && !data.siswa && !data.kelasId && !(data.genDeptId || data.deptId);
    if (isBroadGenerate) {
      setPendingSaveData(data);
      setBroadConfirmOpen(true); // konfirmasi dulu — dampaknya semua siswa aktif
      return;
    }
    void performSave(data);
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
    { key: "jenis", label: "Jenis Pembayaran", className: "min-w-[150px]", render: (_, r) => (r as any).jenis?.nama || "-", sortable: true },
    { key: "level", label: "Level Override", className: "min-w-[120px]", render: (_, r) => getLevelBadge(r) },
    { key: "siswa", label: "Siswa", className: "min-w-[180px]", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : <span className="text-muted-foreground">—</span>; } },
    { key: "kelas", label: "Kelas", className: "min-w-[100px]", render: (_, r) => (r as any).kelas?.nama || <span className="text-muted-foreground">—</span> },
    { key: "angkatan", label: "Angkatan", className: "min-w-[110px]", render: (_, r) => (r as any).angkatan?.nama || <span className="text-muted-foreground">—</span> },
    { key: "tahun_ajaran", label: "Tahun Buku", className: "min-w-[140px]", render: (_, r) => (r as any).tahun_ajaran?.nama || <span className="text-muted-foreground">—</span> },
    { key: "nominal_default", label: "Nominal Default", className: "min-w-[130px]", render: (_, r) => { const def = (r as any).jenis?.nominal; return def ? <span className="text-muted-foreground">{formatRupiah(Number(def))}</span> : "-"; } },
    { key: "nominal", label: "Nominal Override", className: "min-w-[140px]", render: (v) => <span className="font-semibold text-primary">{formatRupiah(Number(v))}</span> },
    { key: "keterangan", label: "Keterangan", className: "min-w-[160px]", render: (v) => (v as string) || "-" },
    {
      key: "aksi", label: "Aksi", className: "min-w-[90px]",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const tagihanColumns: DataTableColumn<any>[] = [
    { key: "siswa", label: "Siswa", className: "min-w-[180px]", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : "-"; }, sortable: true },
    { key: "jenis", label: "Jenis", className: "min-w-[130px]", render: (_, r) => (r as any).jenis?.nama || "-" },
    { key: "kelas", label: "Kelas", className: "min-w-[100px]", render: (_, r) => (r as any).kelas?.nama || "-" },
    { key: "tahun_ajaran", label: "Tahun Buku", className: "min-w-[140px]", render: (_, r) => (r as any).tahun_ajaran?.nama || "-" },
    { key: "bulan", label: "Bulan", className: "min-w-[130px]", render: (v, r) => v ? namaBulanTahun(v as number, { tahunBukuNama: (r as any).tahun_ajaran?.nama }) : <Badge variant="outline">Sekali — TA {(r as any).tahun_ajaran?.nama || "-"}</Badge> },
    { key: "nominal", label: "Nominal", className: "min-w-[120px]", render: (v) => <span className="font-semibold">{formatRupiah(Number(v))}</span> },
    {
      key: "status", label: "Status", className: "min-w-[110px]",
      render: (v) => v === "lunas"
        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Lunas</Badge>
        : v === "terjadwal"
          ? <Badge variant="secondary">Terjadwal</Badge>
          : v === "dibatalkan"
            ? <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">Dibatalkan</Badge>
            : <Badge variant="destructive">Belum Bayar</Badge>,
    },
  ];

  return (
    <>
      {/* ─── Pengaturan Tarif ─── */}
      <Card className="mt-4">
        <CardContent className="space-y-4 px-3 pt-4 sm:px-6 sm:pt-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed sm:text-sm">
              Tarif dapat dioverride per <strong>siswa</strong>, <strong>kelas</strong>, <strong>angkatan</strong>, dan/atau <strong>tahun buku</strong>.
              Prioritas: Siswa+Kelas+Tahun → Siswa+Tahun → Siswa → Kelas+Tahun → Kelas → Angkatan+Tahun → Angkatan → Tahun → Default.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-full sm:w-64">
              <Label className="text-xs">Filter Jenis Pembayaran</Label>
              <Select value={filterJenis || "__all__"} onValueChange={(v) => setFilterJenis(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Jenis</SelectItem>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs">Filter Kelas</Label>
              <Select value={filterTarifKelas || "__all__"} onValueChange={(v) => setFilterTarifKelas(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Kelas</SelectItem>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs">Filter Tahun Buku</Label>
              <Select value={filterTarifTahun || "__all__"} onValueChange={(v) => setFilterTarifTahun(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua tahun buku" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Tahun Buku</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-56">
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
          <DataTable columns={tarifColumns} data={filteredData} loading={isLoading} pageSize={20} actions={
            <div className="flex w-full gap-2 sm:w-auto">
              <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setMassalOpen(true)}><Users className="h-4 w-4 mr-2" />Tambah Massal</Button>
              <Button size="sm" className="flex-1 sm:flex-none" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Tarif</Button>
            </div>
          } />
        </CardContent>
      </Card>

      {/* ─── Daftar Tagihan ─── */}
      <Card className="mt-4">
        <CardContent className="space-y-4 px-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Daftar Tagihan</h3>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed sm:text-sm">
              Tagihan dibuat saat opsi generate dijalankan. Tagihan yang sudah jatuh tempo otomatis membuat jurnal <strong>Debit Piutang | Kredit Pendapatan</strong>.
              Periode mendatang berstatus <strong>Terjadwal</strong> dan baru dijurnal saat jatuh tempo. Saat pembayaran diterima, jurnal pembayaran adalah <strong>Debit Kas | Kredit Piutang</strong>.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-full sm:w-48">
              <Label className="text-xs">Tahun Buku</Label>
              <Select value={filterTahunId || "__all__"} onValueChange={(v) => setFilterTahunId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs">Jenis Pembayaran</Label>
              <Select value={filterJenisId || "__all__"} onValueChange={(v) => setFilterJenisId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  <SelectItem value="terjadwal">Terjadwal</SelectItem>
                  <SelectItem value="belum_bayar">Belum Bayar</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                  <SelectItem value="dibatalkan">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs">Kelas</Label>
              <Select value={filterTagihanKelas || "__all__"} onValueChange={(v) => setFilterTagihanKelas(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-56">
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <Controller control={form.control} name="jenisId" render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.setValue("genBulanList", [], { shouldValidate: true }); }}>
                      <SelectTrigger><SelectValue placeholder="Pilih jenis pembayaran..." /></SelectTrigger>
                      <SelectContent>{jenisListForForm?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(Default: ${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                <div>
                  <Label>Siswa (opsional)</Label>
                  <Controller control={form.control} name="siswa" render={({ field }) => (
                    <SiswaCombobox
                      value={field.value}
                      onChange={(s) => {
                        field.onChange(s);
                        // Auto-isi Lembaga dari data siswa sebagai default yang nyaman
                        // untuk kasus umum (tarif untuk lembaga siswa saat ini). Tetap
                        // bisa diganti manual -- mis. siswa kelas 6 SD yang mau
                        // diinputkan tarif SPP/Uang Pangkal untuk SMP (jenjang berikutnya).
                        if (s && !deptId && s.departemen_id) {
                          form.setValue("deptId", s.departemen_id, { shouldValidate: true });
                          form.setValue("kelasId", "", { shouldValidate: true });
                          toast.info("Lembaga otomatis diisi dari data siswa — bisa diganti manual jika perlu.");
                        }
                      }}
                      placeholder="Semua siswa — atau cari nama/NIS..."
                    />
                  )} />
                </div>
                <div>
                  <Label>Kelas (opsional)</Label>
                  <Controller control={form.control} name="kelasId" render={({ field }) => (
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Semua Kelas —</SelectItem>
                        {filteredKelasList.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div>
                  <Label>Angkatan (opsional)</Label>
                  <Controller control={form.control} name="angkatanId" render={({ field }) => (
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
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
                  )} />
                </div>
                <div>
                  <Label>Tahun Buku {autoGenerate ? "*" : "(opsional)"}</Label>
                  <Controller control={form.control} name="tahunAjaranId" render={({ field }) => (
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Semua tahun buku" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Semua Tahun Buku —</SelectItem>
                        {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </>
            )}
            <div>
              <Label>Nominal Override *</Label>
              <Controller control={form.control} name="nominal" render={({ field }) => (
                <RupiahInput value={field.value} onChange={field.onChange} />
              )} />
              <p className="text-xs text-muted-foreground mt-1">
                Nominal ini akan menggantikan nominal default
                {!editItem && selectedJenis?.nominal ? <> (default saat ini: <strong>{formatRupiah(Number(selectedJenis.nominal))}</strong>)</> : null}
              </p>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...form.register("keterangan")} placeholder="Misal: Beasiswa prestasi, potongan 50%" />
            </div>

            {/* Auto-generate section - only for new tarif */}
            {!editItem && (
              <>
                <Separator />
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Controller control={form.control} name="autoGenerate" render={({ field }) => (
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(!!v)}
                      />
                    )} />
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
                              onCheckedChange={(checked) => form.setValue("genBulanList", checked ? [...allMonths] : [], { shouldValidate: true })}
                            />
                            <label htmlFor="select-all-months" className="text-sm cursor-pointer">Pilih semua (12 bulan)</label>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                          <Controller control={form.control} name="genDeptId" render={({ field }) => (
                            <Select value={field.value || "__all__"} onValueChange={(v) => field.onChange(v === "__all__" ? "" : v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">Semua Lembaga</SelectItem>
                                {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Peringatan non-blocking — tidak mematikan tombol Simpan */}
            {validationWarnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                {validationWarnings.map((w) => (
                  <p key={w} className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
                    {w}
                  </p>
                ))}
              </div>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={!canSave || isSaving}>
                {isSaving ? "Memproses..." : editItem ? "Simpan" : autoGenerate ? "Simpan & Generate" : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TarifMassalDialog open={massalOpen} onOpenChange={setMassalOpen} />

      {/* Konfirmasi generate skala luas — tanpa siswa/kelas/lembaga terpilih */}
      <ConfirmDialog
        open={broadConfirmOpen}
        onOpenChange={setBroadConfirmOpen}
        title="Generate untuk Semua Siswa Aktif?"
        description="Tidak ada siswa, kelas, atau lembaga yang dipilih — tagihan & jurnal piutang akan dibuat untuk SEMUA siswa aktif pada tahun buku terpilih. Siswa yang sudah punya tagihan akan di-skip. Lanjutkan?"
        onConfirm={() => { setBroadConfirmOpen(false); if (pendingSaveData) void performSave(pendingSaveData); }}
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