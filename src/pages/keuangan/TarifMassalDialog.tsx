import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { SiswaCombobox, SiswaRingkas } from "@/components/shared/SiswaCombobox";
import { RupiahInput } from "@/components/shared/RupiahInput";
import { Trash2, Info, Download, Upload, AlertCircle, X } from "lucide-react";
import { formatRupiah, useAllJenisPembayaran, useTahunBuku, useLembaga, namaBulan } from "@/hooks/useKeuangan";
import { useAllTarifTagihan, useCreateTarifTagihanBulk } from "@/hooks/useTarifTagihan";
import { useGenerateTagihan } from "@/hooks/useTagihan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RowSiswa {
  siswa: SiswaRingkas;
  nominal: string; // raw digit string
  keterangan: string;
}

interface TarifMassalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_ROWS = 500;

export default function TarifMassalDialog({ open, onOpenChange }: TarifMassalDialogProps) {
  const { data: jenisList } = useAllJenisPembayaran();
  const { data: tahunList } = useTahunBuku();
  const { data: lembagaList } = useLembaga();
  const { data: tarifList } = useAllTarifTagihan();

  const bulkMut = useCreateTarifTagihanBulk();
  const generateMut = useGenerateTagihan();

  const [deptId, setDeptId] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [rows, setRows] = useState<RowSiswa[]>([]);
  const [nominalUmum, setNominalUmum] = useState("");
  const [keteranganUmum, setKeteranganUmum] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [autoGenerate, setAutoGenerate] = useState(true);
  const [genBulanList, setGenBulanList] = useState<number[]>([]);

  const jenisListForForm = useMemo(() => {
    if (!jenisList) return [];
    if (!deptId) return jenisList;
    return jenisList.filter((j: any) => !j.departemen_id || j.departemen_id === deptId);
  }, [jenisList, deptId]);

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";
  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const allSelected = genBulanList.length === 12;

  const toggleBulan = (b: number) => {
    setGenBulanList((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b].sort((a, c) => a - c));
  };

  const resetState = () => {
    setDeptId(""); setJenisId(""); setTahunAjaranId(""); setRows([]);
    setNominalUmum(""); setKeteranganUmum(""); setImportErrors([]);
    setAutoGenerate(true); setGenBulanList([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const defaultNominal = () =>
    nominalUmum || (selectedJenis?.nominal ? String(Math.trunc(Number(selectedJenis.nominal))) : "");

  const addSiswa = (s: SiswaRingkas | null) => {
    if (!s) return;
    if (rows.some((r) => r.siswa.id === s.id)) {
      toast.info(`${s.nama} sudah ada di daftar.`);
      return;
    }
    if (rows.length >= MAX_ROWS) {
      toast.error(`Maksimal ${MAX_ROWS} siswa per batch.`);
      return;
    }
    setRows((prev) => [...prev, { siswa: s, nominal: defaultNominal(), keterangan: keteranganUmum }]);
  };

  const updateRow = (id: string, patch: Partial<Pick<RowSiswa, "nominal" | "keterangan">>) => {
    setRows((prev) => prev.map((r) => (r.siswa.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.siswa.id !== id));

  const applyNominalToAll = () => {
    if (!nominalUmum) return;
    setRows((prev) => prev.map((r) => ({ ...r, nominal: nominalUmum })));
  };

  // ── Import Excel ──────────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { nis: "1234567890", nominal: 150000, keterangan: "Beasiswa prestasi 50%" },
      { nis: "0987654321", nominal: 200000, keterangan: "" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tarif");
    XLSX.writeFile(wb, "template_tarif_massal.xlsx");
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImporting(true);
      setImportErrors([]);
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<{ nis?: unknown; nominal?: unknown; keterangan?: unknown }>(ws, { defval: "" });

        const errors: string[] = [];
        const parsed = data
          .map((r, i) => ({
            baris: i + 2, // +2: header di baris 1, data mulai baris 2
            nis: String(r.nis ?? "").trim(),
            nominal: String(r.nominal ?? "").replace(/\D/g, ""),
            keterangan: String(r.keterangan ?? "").trim(),
          }))
          .filter((r) => {
            if (!r.nis) {
              if (r.nominal || r.keterangan) errors.push(`Baris ${r.baris}: kolom nis kosong — dilewati`);
              return false;
            }
            return true;
          });

        if (parsed.length === 0) {
          setImportErrors(errors.length ? errors : ["File tidak berisi baris data — pastikan kolom bernama: nis, nominal, keterangan"]);
          return;
        }
        if (parsed.length > MAX_ROWS) {
          setImportErrors([`File berisi ${parsed.length} baris — maksimal ${MAX_ROWS} per batch.`]);
          return;
        }

        // Cari siswa aktif berdasarkan NIS (satu query, bukan per-baris)
        const nisList = [...new Set(parsed.map((r) => r.nis))];
        const { data: siswaData, error } = await supabase
          .from("siswa")
          .select("id, nama, nis, departemen_id")
          .in("nis", nisList)
          .eq("status", "aktif");
        if (error) throw error;
        const byNis = new Map((siswaData || []).map((s: any) => [String(s.nis), s as SiswaRingkas]));

        const newRows: RowSiswa[] = [];
        const seen = new Set(rows.map((r) => r.siswa.id));
        for (const r of parsed) {
          const s = byNis.get(r.nis);
          if (!s) {
            errors.push(`Baris ${r.baris}: NIS "${r.nis}" tidak ditemukan / siswa tidak aktif`);
            continue;
          }
          if (seen.has(s.id)) {
            errors.push(`Baris ${r.baris}: ${s.nama} (${r.nis}) duplikat — dilewati`);
            continue;
          }
          seen.add(s.id);
          newRows.push({ siswa: s, nominal: r.nominal || defaultNominal(), keterangan: r.keterangan || keteranganUmum });
        }

        setRows((prev) => [...prev, ...newRows]);
        setImportErrors(errors);
        if (newRows.length > 0) toast.success(`${newRows.length} siswa berhasil diimport dari Excel.`);
      } catch {
        setImportErrors(["Gagal membaca file Excel. Pastikan format sesuai template (kolom: nis, nominal, keterangan)."]);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ── Validasi ──────────────────────────────────────────────────────────────
  // Tarif duplikat: sudah ada tarif per-siswa untuk jenis + tahun buku yang sama
  const existingSiswaTarif = useMemo(() => {
    if (!tarifList || !jenisId) return new Set<string>();
    const norm = (x: any) => x || null;
    return new Set<string>(
      tarifList
        .filter((t: any) =>
          t.jenis_id === jenisId && t.siswa_id && !t.kelas_id && !t.angkatan_id &&
          norm(t.tahun_ajaran_id) === norm(tahunAjaranId)
        )
        .map((t: any) => t.siswa_id as string)
    );
  }, [tarifList, jenisId, tahunAjaranId]);

  const rowError = (r: RowSiswa): string | null => {
    if (!r.nominal || Number(r.nominal) <= 0) return "Nominal harus > 0";
    if (existingSiswaTarif.has(r.siswa.id)) return "Sudah ada tarif untuk jenis & tahun buku ini";
    return null;
  };

  const errorRowCount = rows.filter((r) => rowError(r)).length;
  const totalNominal = rows.reduce((sum, r) => sum + Number(r.nominal || 0), 0);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!jenisId) errs.push("Jenis Pembayaran belum dipilih");
    if (rows.length === 0) errs.push("Belum ada siswa di daftar — tambah lewat pencarian atau import Excel");
    if (errorRowCount > 0) errs.push(`${errorRowCount} baris bermasalah (ditandai merah) — perbaiki atau hapus dulu`);
    if (autoGenerate) {
      if (!tahunAjaranId) errs.push("Tahun Buku wajib dipilih saat opsi generate tagihan aktif");
      if (jenisId && !isSekali && genBulanList.length === 0) errs.push("Pilih minimal satu bulan untuk generate tagihan");
    }
    return errs;
  }, [jenisId, rows.length, errorRowCount, autoGenerate, tahunAjaranId, isSekali, genBulanList]);

  const canSave = validationErrors.length === 0;
  const isSaving = bulkMut.isPending || generateMut.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await bulkMut.mutateAsync(
        rows.map((r) => ({
          jenis_id: jenisId,
          siswa_id: r.siswa.id,
          tahun_ajaran_id: tahunAjaranId || null,
          nominal: Number(r.nominal),
          keterangan: r.keterangan || undefined,
        }))
      );

      if (autoGenerate && tahunAjaranId) {
        try {
          const params: any = {
            tahun_ajaran_id: tahunAjaranId,
            jenis_id: jenisId,
            siswa_ids: rows.map((r) => r.siswa.id),
          };
          if (!isSekali && genBulanList.length > 0) params.bulan_list = genBulanList;
          const genResult = await generateMut.mutateAsync(params);
          if (genResult.generated === 0 && genResult.errors && genResult.errors.length > 0) {
            return; // tarif tersimpan tapi generate gagal total — biarkan dialog terbuka untuk retry
          }
        } catch (genErr: any) {
          toast.error(`Tarif tersimpan, tapi generate tagihan gagal: ${genErr.message}`);
          return;
        }
      }
      handleClose(false);
    } catch {
      // error insert sudah ditampilkan oleh toast di hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Tarif Massal (Per Siswa)</DialogTitle>
          <DialogDescription>
            Input tarif khusus untuk banyak siswa sekaligus — pilih manual atau import dari Excel.
            Semua baris disimpan dalam satu transaksi: kalau ada yang gagal, tidak ada yang tersimpan setengah.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Konteks tarif ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Lembaga (opsional)</Label>
              <Select value={deptId || "__none__"} onValueChange={(v) => {
                const newDept = v === "__none__" ? "" : v;
                setDeptId(newDept);
                const jenisTerpilih = jenisList?.find((j: any) => j.id === jenisId);
                if (newDept && jenisTerpilih?.departemen_id && jenisTerpilih.departemen_id !== newDept) {
                  setJenisId("");
                  toast.info("Pilihan Jenis Pembayaran direset karena tidak berlaku untuk lembaga yang dipilih.");
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Lembaga —</SelectItem>
                  {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Memfilter pilihan jenis pembayaran</p>
            </div>
            <div>
              <Label>Jenis Pembayaran *</Label>
              <Select value={jenisId} onValueChange={(v) => { setJenisId(v); setGenBulanList([]); }}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis pembayaran..." /></SelectTrigger>
                <SelectContent>{jenisListForForm?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(Default: ${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>)}</SelectContent>
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
            <div>
              <Label>Keterangan (untuk baris baru)</Label>
              <Input value={keteranganUmum} onChange={(e) => setKeteranganUmum(e.target.value)} placeholder="Misal: Beasiswa prestasi 50%" />
            </div>
          </div>

          <Separator />

          {/* ── Tambah siswa: manual & Excel ── */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <Label>Tambah Siswa</Label>
              <SiswaCombobox value={null} onChange={addSiswa} placeholder="Cari nama/NIS lalu pilih untuk menambah..." />
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1.5" />Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4 mr-1.5" />{importing ? "Memproses..." : "Import Excel"}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          </div>

          {importErrors.length > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    {importErrors.slice(0, 8).map((e, i) => <p key={i}>{e}</p>)}
                    {importErrors.length > 8 && <p>… dan {importErrors.length - 8} masalah lain</p>}
                  </div>
                  <button onClick={() => setImportErrors([])} aria-label="Tutup"><X className="h-3.5 w-3.5" /></button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Nominal seragam ── */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-44">
                <Label className="text-xs">Nominal seragam</Label>
                <RupiahInput value={nominalUmum} onChange={setNominalUmum} />
              </div>
              <Button variant="secondary" size="sm" onClick={applyNominalToAll} disabled={!nominalUmum}>
                Terapkan ke semua ({rows.length})
              </Button>
              {errorRowCount > 0 && (
                <Button variant="outline" size="sm" className="text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => !rowError(r)))}>
                  Hapus {errorRowCount} baris bermasalah
                </Button>
              )}
            </div>
          )}

          {/* ── Daftar siswa ── */}
          {rows.length > 0 && (
            <div className="rounded-md border">
              <div className="max-h-72 overflow-y-auto divide-y">
                {rows.map((r, i) => {
                  const err = rowError(r);
                  return (
                    <div key={r.siswa.id} className={`flex items-center gap-2 px-3 py-2 ${err ? "bg-destructive/5" : ""}`}>
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{r.siswa.nama} <span className="text-muted-foreground text-xs">({r.siswa.nis || "-"})</span></p>
                        {err && <p className="text-xs text-destructive">{err}</p>}
                      </div>
                      <div className="w-36 shrink-0">
                        <RupiahInput value={r.nominal} onChange={(v) => updateRow(r.siswa.id, { nominal: v })} />
                      </div>
                      <Input
                        className="w-44 shrink-0 text-sm"
                        value={r.keterangan}
                        onChange={(e) => updateRow(r.siswa.id, { keterangan: e.target.value })}
                        placeholder="Keterangan"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeRow(r.siswa.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t px-3 py-2 text-xs text-muted-foreground flex justify-between">
                <span>{rows.length} siswa</span>
                <span>Total nominal: <strong className="text-foreground">{formatRupiah(totalNominal)}</strong>{!isSekali && jenisId ? " /bulan" : ""}</span>
              </div>
            </div>
          )}

          {/* ── Generate tagihan ── */}
          <Separator />
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={autoGenerate} onCheckedChange={(v) => setAutoGenerate(!!v)} />
              <span className="text-sm font-medium">Generate tagihan & jurnal piutang otomatis</span>
            </label>

            {autoGenerate && (
              <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                <Alert className="py-2">
                  <Info className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    Tagihan + jurnal piutang dibuat hanya untuk <strong>{rows.length} siswa di daftar</strong>.
                    Siswa yang sudah punya tagihan akan di-skip.
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
                        id="massal-select-all-months"
                        checked={allSelected}
                        onCheckedChange={(checked) => setGenBulanList(checked ? [...allMonths] : [])}
                      />
                      <label htmlFor="massal-select-all-months" className="text-sm cursor-pointer">Pilih semua (12 bulan)</label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {allMonths.map((b) => (
                        <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <Checkbox checked={genBulanList.includes(b)} onCheckedChange={() => toggleBulan(b)} />
                          {namaBulan(b)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
          <Button variant="outline" onClick={() => handleClose(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving
              ? "Memproses..."
              : autoGenerate
                ? `Simpan ${rows.length} Tarif & Generate`
                : `Simpan ${rows.length} Tarif`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
