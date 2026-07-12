import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface DepartemenRef {
  id: string;
  nama: string;
}
interface TingkatRef {
  id: string;
  nama: string;
  departemen_id: string | null;
}
interface KelasRef {
  id: string;
  nama: string;
  tingkat_id: string | null;
  departemen_id: string | null;
}
interface TahunAjaranRef {
  id: string;
  nama: string;
}
interface AngkatanRef {
  id: string;
  nama: string;
  departemen_id: string | null;
}

interface ImportSiswaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departemenList: DepartemenRef[];
  tingkatList: TingkatRef[];
  kelasList: KelasRef[];
  tahunAjaranList: TahunAjaranRef[];
  angkatanList: AngkatanRef[];
  onImported: () => void;
}

interface SiswaImportRow {
  nis?: string;
  nama?: string;
  jenis_kelamin?: string;
  tempat_lahir?: string;
  tanggal_lahir?: string | number;
  agama?: string;
  alamat?: string;
  telepon?: string;
  email?: string;
  status?: string;
  departemen?: string;
  tingkat?: string;
  kelas?: string;
  tahun_ajaran?: string;
  angkatan?: string;
  nama_ayah?: string;
  nama_ibu?: string;
  telepon_ortu?: string;
  error?: string;
  _action?: "insert" | "update";
  _existingSiswaId?: string;
}

const STATUS_VALID = ["aktif", "alumni", "pindah", "keluar"];

function normalize(v: unknown): string {
  return (v ?? "").toString().trim();
}

function excelDateToISO(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    // Excel serial date -> JS Date
    const date = XLSX.SSF?.parse_date_code
      ? XLSX.SSF.parse_date_code(value)
      : null;
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return null;
  }
  const str = value.toString().trim();
  // Coba format dd/mm/yyyy atau yyyy-mm-dd
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function ImportSiswaDialog({
  open,
  onOpenChange,
  departemenList,
  tingkatList,
  kelasList,
  tahunAjaranList,
  angkatanList,
  onImported,
}: ImportSiswaDialogProps) {
  const [rows, setRows] = useState<SiswaImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; error: number; updated: number } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);

  const findByNama = <T extends { nama: string }>(list: T[], nama?: string): T | undefined => {
    if (!nama) return undefined;
    const target = nama.toString().trim().toLowerCase();
    return list.find((item) => item.nama.trim().toLowerCase() === target);
  };

  const validateRows = async (
    data: SiswaImportRow[],
    allowUpdate: boolean
  ): Promise<SiswaImportRow[]> => {
    // Cek NIS yang sudah terdaftar di database (satu query untuk semua baris)
    const nisList = data.map((r) => normalize(r.nis)).filter(Boolean);
    let existingByNis = new Map<string, string>(); // nis -> siswa_id
    if (allowUpdate && nisList.length > 0) {
      const { data: existing, error } = await supabase
        .from("siswa")
        .select("id, nis")
        .in("nis", nisList);
      if (!error && existing) {
        existingByNis = new Map(existing.map((s: any) => [s.nis as string, s.id as string]));
      }
    }

    return data.map((r) => {
      const errors: string[] = [];
      const nama = normalize(r.nama);
      if (!nama) errors.push("nama kosong");

      const jk = normalize(r.jenis_kelamin).toUpperCase();
      if (jk && jk !== "L" && jk !== "P") {
        errors.push(`jenis_kelamin harus L/P (ditemukan: ${r.jenis_kelamin})`);
      }

      const status = normalize(r.status).toLowerCase();
      if (status && !STATUS_VALID.includes(status)) {
        errors.push(`status invalid: ${r.status}`);
      }

      if (r.email && normalize(r.email) && !/^\S+@\S+\.\S+$/.test(normalize(r.email))) {
        errors.push(`email tidak valid: ${r.email}`);
      }

      let departemenId: string | undefined;
      if (normalize(r.departemen)) {
        const dept = findByNama(departemenList, r.departemen);
        if (!dept) errors.push(`departemen tidak ditemukan: ${r.departemen}`);
        else departemenId = dept.id;
      }

      let tingkatId: string | undefined;
      if (normalize(r.tingkat)) {
        const candidates = tingkatList.filter(
          (t) => !departemenId || t.departemen_id === departemenId
        );
        const tingkat = findByNama(candidates, r.tingkat);
        if (!tingkat) errors.push(`tingkat tidak ditemukan: ${r.tingkat}`);
        else tingkatId = tingkat.id;
      }

      let kelasId: string | undefined;
      if (normalize(r.kelas)) {
        const candidates = kelasList.filter(
          (k) => !tingkatId || k.tingkat_id === tingkatId
        );
        const kelas = findByNama(candidates, r.kelas);
        if (!kelas) errors.push(`kelas tidak ditemukan: ${r.kelas}`);
        else kelasId = kelas.id;
      }

      let tahunAjaranId: string | undefined;
      if (normalize(r.tahun_ajaran)) {
        const ta = findByNama(tahunAjaranList, r.tahun_ajaran);
        if (!ta) errors.push(`tahun ajaran tidak ditemukan: ${r.tahun_ajaran}`);
        else tahunAjaranId = ta.id;
      } else if (kelasId) {
        errors.push("tahun_ajaran wajib diisi jika kelas diisi");
      }

      let angkatanId: string | undefined;
      if (normalize(r.angkatan)) {
        const candidates = angkatanList.filter(
          (a) => !departemenId || a.departemen_id === departemenId
        );
        const angkatan = findByNama(candidates, r.angkatan);
        if (!angkatan) errors.push(`angkatan tidak ditemukan: ${r.angkatan}`);
        else angkatanId = angkatan.id;
      }

      const tanggalLahirIso =
        r.tanggal_lahir !== undefined && r.tanggal_lahir !== ""
          ? excelDateToISO(r.tanggal_lahir)
          : null;
      if (r.tanggal_lahir && normalize(r.tanggal_lahir as string) && !tanggalLahirIso) {
        errors.push(`tanggal_lahir tidak valid: ${r.tanggal_lahir}`);
      }

      const nisNorm = normalize(r.nis);
      const existingId = nisNorm ? existingByNis.get(nisNorm) : undefined;

      return {
        ...r,
        error: errors.length ? errors.join("; ") : undefined,
        _action: existingId ? "update" : "insert",
        _existingSiswaId: existingId,
      };
    });
  };

  const hasErrors = rows.some((r) => r.error);

  const [rawRows, setRawRows] = useState<SiswaImportRow[]>([]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<SiswaImportRow>(ws, { defval: "" });
        setRawRows(data);
        setValidating(true);
        validateRows(data, updateExisting)
          .then(setRows)
          .finally(() => setValidating(false));
        setResult(null);
      } catch (err) {
        toast.error("Gagal membaca file Excel. Pastikan format sesuai template.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleToggleUpdateExisting = (checked: boolean) => {
    setUpdateExisting(checked);
    if (rawRows.length > 0) {
      setValidating(true);
      validateRows(rawRows, checked)
        .then(setRows)
        .finally(() => setValidating(false));
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        nis: "",
        nama: "Ahmad Fauzan",
        jenis_kelamin: "L",
        tempat_lahir: "Surabaya",
        tanggal_lahir: "2012-05-14",
        agama: "Islam",
        alamat: "Jl. Contoh No. 1",
        telepon: "081234567890",
        email: "",
        status: "aktif",
        departemen: "",
        tingkat: "",
        kelas: "",
        tahun_ajaran: "",
        angkatan: "",
        nama_ayah: "",
        nama_ibu: "",
        telepon_ortu: "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_import_siswa.xlsx");
  };

  const handleImport = async () => {
    if (hasErrors || rows.length === 0) return;
    setImporting(true);
    setProgress(0);
    let success = 0;
    let updated = 0;
    let errorCount = 0;
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const dept = normalize(r.departemen) ? findByNama(departemenList, r.departemen) : undefined;
        const tingkatCandidates = dept
          ? tingkatList.filter((t) => t.departemen_id === dept.id)
          : tingkatList;
        const tingkat = normalize(r.tingkat) ? findByNama(tingkatCandidates, r.tingkat) : undefined;
        const kelasCandidates = tingkat
          ? kelasList.filter((k) => k.tingkat_id === tingkat.id)
          : kelasList;
        const kelas = normalize(r.kelas) ? findByNama(kelasCandidates, r.kelas) : undefined;
        const tahunAjaran = normalize(r.tahun_ajaran)
          ? findByNama(tahunAjaranList, r.tahun_ajaran)
          : undefined;
        const angkatanCandidates = dept
          ? angkatanList.filter((a) => a.departemen_id === dept.id)
          : angkatanList;
        const angkatan = normalize(r.angkatan) ? findByNama(angkatanCandidates, r.angkatan) : undefined;

        const siswaPayload: Record<string, unknown> = {
          nis: normalize(r.nis) || null,
          nama: normalize(r.nama),
          jenis_kelamin: normalize(r.jenis_kelamin).toUpperCase() || null,
          tempat_lahir: normalize(r.tempat_lahir) || null,
          tanggal_lahir: excelDateToISO(r.tanggal_lahir),
          agama: normalize(r.agama) || null,
          alamat: normalize(r.alamat) || null,
          telepon: normalize(r.telepon) || null,
          email: normalize(r.email) || null,
          status: normalize(r.status).toLowerCase() || "aktif",
          angkatan_id: angkatan?.id || null,
          departemen_id: dept?.id || null,
        };

        const isUpdate = r._action === "update" && r._existingSiswaId;
        let siswaId: string;

        if (isUpdate) {
          const { error: updateErr } = await supabase
            .from("siswa")
            .update(siswaPayload as any)
            .eq("id", r._existingSiswaId as string);
          if (updateErr) throw updateErr;
          siswaId = r._existingSiswaId as string;
        } else {
          const { data: newSiswa, error: siswaErr } = await supabase
            .from("siswa")
            .insert(siswaPayload as any)
            .select("id")
            .single();
          if (siswaErr) throw siswaErr;
          siswaId = newSiswa.id;
        }

        const hasOrtuData = normalize(r.nama_ayah) || normalize(r.nama_ibu) || normalize(r.telepon_ortu);
        if (hasOrtuData) {
          const detailPayload = {
            nama_ayah: normalize(r.nama_ayah) || null,
            nama_ibu: normalize(r.nama_ibu) || null,
            telepon_ortu: normalize(r.telepon_ortu) || null,
          };
          if (isUpdate) {
            const { data: existingDetail } = await supabase
              .from("siswa_detail")
              .select("id")
              .eq("siswa_id", siswaId)
              .maybeSingle();
            if (existingDetail) {
              const { error: detailErr } = await supabase
                .from("siswa_detail")
                .update(detailPayload as any)
                .eq("id", existingDetail.id);
              if (detailErr) throw detailErr;
            } else {
              const { error: detailErr } = await supabase
                .from("siswa_detail")
                .insert({ siswa_id: siswaId, ...detailPayload } as any);
              if (detailErr) throw detailErr;
            }
          } else {
            const { error: detailErr } = await supabase
              .from("siswa_detail")
              .insert({ siswa_id: siswaId, ...detailPayload } as any);
            if (detailErr) throw detailErr;
          }
        }

        if (kelas && tahunAjaran) {
          if (isUpdate) {
            // Nonaktifkan penempatan kelas aktif sebelumnya di tahun ajaran yang sama
            // agar tidak menumpuk baris aktif ganda, lalu catat penempatan baru.
            await supabase
              .from("kelas_siswa")
              .update({ aktif: false } as any)
              .eq("siswa_id", siswaId)
              .eq("tahun_ajaran_id", tahunAjaran.id)
              .eq("aktif", true);

            const { data: existingKelasSiswa } = await supabase
              .from("kelas_siswa")
              .select("id")
              .eq("siswa_id", siswaId)
              .eq("tahun_ajaran_id", tahunAjaran.id)
              .eq("kelas_id", kelas.id)
              .maybeSingle();

            if (existingKelasSiswa) {
              const { error: kelasErr } = await supabase
                .from("kelas_siswa")
                .update({ aktif: true } as any)
                .eq("id", existingKelasSiswa.id);
              if (kelasErr) throw kelasErr;
            } else {
              const { error: kelasErr } = await supabase.from("kelas_siswa").insert({
                siswa_id: siswaId,
                kelas_id: kelas.id,
                tahun_ajaran_id: tahunAjaran.id,
                aktif: true,
              } as any);
              if (kelasErr) throw kelasErr;
            }
          } else {
            const { error: kelasErr } = await supabase.from("kelas_siswa").insert({
              siswa_id: siswaId,
              kelas_id: kelas.id,
              tahun_ajaran_id: tahunAjaran.id,
              aktif: true,
            } as any);
            if (kelasErr) throw kelasErr;
          }
        }

        if (isUpdate) updated++;
        else success++;
      } catch (err) {
        errorCount++;
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResult({ success, error: errorCount, updated });
    setImporting(false);
    if (success > 0 || updated > 0) onImported();
    if (errorCount === 0) {
      const parts = [];
      if (success > 0) parts.push(`${success} baru`);
      if (updated > 0) parts.push(`${updated} diupdate`);
      toast.success(`Import selesai: ${parts.join(", ")}`);
    } else {
      toast.warning(`Import selesai: ${success} baru, ${updated} diupdate, ${errorCount} gagal`);
    }
  };


  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRows([]);
      setRawRows([]);
      setResult(null);
      setProgress(0);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import Data Siswa dari Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download template, isi data siswa, lalu upload kembali. Kolom{" "}
            <span className="font-medium">departemen</span>,{" "}
            <span className="font-medium">tingkat</span>,{" "}
            <span className="font-medium">kelas</span>,{" "}
            <span className="font-medium">tahun_ajaran</span>, dan{" "}
            <span className="font-medium">angkatan</span> diisi dengan nama persis
            seperti yang ada di sistem (opsional, boleh dikosongkan).
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Label htmlFor="upload-siswa" className="cursor-pointer">
              <Button variant="outline" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File Excel
                </span>
              </Button>
            </Label>
            <input
              id="upload-siswa"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="update-existing"
              checked={updateExisting}
              onCheckedChange={(checked) => handleToggleUpdateExisting(checked === true)}
            />
            <Label htmlFor="update-existing" className="text-sm cursor-pointer font-normal">
              Update data siswa jika NIS sudah terdaftar (jika tidak dicentang, baris dengan NIS yang
              sudah ada akan tetap dibuat sebagai data baru)
            </Label>
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Preview: {Math.min(10, rows.length)} dari {rows.length} baris
                {validating && " (memeriksa data yang sudah ada...)"}
              </p>
              <div className="border rounded-md overflow-auto max-h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NIS</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>JK</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Aksi</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 10).map((r, i) => (
                      <TableRow key={i} className={r.error ? "bg-destructive/10" : ""}>
                        <TableCell className="font-mono text-sm">{r.nis || "-"}</TableCell>
                        <TableCell>{r.nama}</TableCell>
                        <TableCell>{r.jenis_kelamin}</TableCell>
                        <TableCell>{r.kelas || "-"}</TableCell>
                        <TableCell>
                          {r._action === "update" ? (
                            <Badge variant="secondary">Update</Badge>
                          ) : (
                            <Badge variant="outline">Baru</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="text-destructive text-xs">{r.error}</span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {importing && <Progress value={progress} className="h-2" />}

              {result && (
                <div className="flex gap-3 text-sm">
                  {result.success > 0 && <Badge variant="outline">{result.success} baru</Badge>}
                  {result.updated > 0 && <Badge variant="secondary">{result.updated} diupdate</Badge>}
                  {result.error > 0 && (
                    <Badge variant="destructive">{result.error} gagal</Badge>
                  )}
                </div>
              )}

              {hasErrors && (
                <p className="text-xs text-destructive">
                  Perbaiki baris yang bermasalah pada file Excel lalu upload ulang.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Tutup
          </Button>
          <Button onClick={handleImport} disabled={rows.length === 0 || hasErrors || importing || validating}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengimport...
              </>
            ) : (
              "Simpan ke Database"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
