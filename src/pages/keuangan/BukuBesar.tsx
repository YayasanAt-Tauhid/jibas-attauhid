import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { useAkunRekening, useBukuBesar } from "@/hooks/useJurnal";
import { useDepartemenGroups } from "@/hooks/useISAK35";
import { formatRupiah, BULAN_ORDER_AKADEMIK, namaBulan } from "@/hooks/useKeuangan";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const currentYear = new Date().getFullYear();

function akhirBulan(tahun: number, bulan: number): string {
  const lastDay = new Date(tahun, bulan, 0).getDate();
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export default function BukuBesar() {
  const [akunId, setAkunId] = useState<string>("");
  const [bulanDari, setBulanDari] = useState(1);
  const [bulanSampai, setBulanSampai] = useState(12);
  const [tahun, setTahun] = useState(currentYear);
  const [filterUnit, setFilterUnit] = useState("semua");
  const [tampilkanPenutup, setTampilkanPenutup] = useState(false);

  const { data: akunList } = useAkunRekening();
  const { data: deptGroups } = useDepartemenGroups();

  const allDepts = [...(deptGroups?.pendidikanDepts ?? []), ...(deptGroups?.usahaDepts ?? [])];
  const departemenIds =
    filterUnit === "semua" ? undefined :
    filterUnit === "pendidikan" ? deptGroups?.pendidikanIds :
    filterUnit === "usaha" ? deptGroups?.usahaIds :
    allDepts.some(d => d.id === filterUnit) ? [filterUnit] :
    undefined;

  const labelUnit =
    filterUnit === "semua" ? "Semua Unit" :
    filterUnit === "pendidikan" ? "Gabungan Pendidikan" :
    filterUnit === "usaha" ? "Gabungan Usaha & Dana" :
    allDepts.find(d => d.id === filterUnit)?.nama ?? filterUnit;

  const tglAwal = `${tahun}-${String(bulanDari).padStart(2, "0")}-01`;
  const tglAkhir = akhirBulan(tahun, bulanSampai);

  const selectedAkun = akunList?.find((a: any) => a.id === akunId);
  const { data, isLoading } = useBukuBesar(akunId || undefined, tglAwal, tglAkhir, departemenIds, tampilkanPenutup);

  const computedData = useMemo(() => {
    if (!data || !selectedAkun) return [];
    const isDebitNormal = selectedAkun.saldo_normal !== "K";
    let saldo = data.saldoAwal;

    return data.mutasi.map((d) => {
      saldo += isDebitNormal ? (d.debit - d.kredit) : (d.kredit - d.debit);
      return {
        tanggal: d.tanggal,
        nomor: d.nomor,
        lembaga: d.lembaga,
        keterangan: d.keterangan,
        debit: d.debit,
        kredit: d.kredit,
        saldo,
        tipe: d.tipe,
      };
    });
  }, [data, selectedAkun]);

  const saldoAwal = data?.saldoAwal ?? 0;
  const totalDebit = computedData.reduce((s, r) => s + r.debit, 0);
  const totalKredit = computedData.reduce((s, r) => s + r.kredit, 0);
  const saldoAkhir = computedData.length > 0 ? computedData[computedData.length - 1].saldo : saldoAwal;

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "d MMM yyyy", { locale: idLocale }) : "-" },
    { key: "nomor", label: "No. Jurnal", render: (v, row) => (
      <span>{v as string}{row.tipe !== "normal" ? <span className="ml-1 text-xs text-muted-foreground">({row.tipe})</span> : null}</span>
    ) },
    { key: "lembaga", label: "Lembaga" },
    { key: "keterangan", label: "Keterangan" },
    { key: "debit", label: "Debit", render: (v) => Number(v) > 0 ? formatRupiah(Number(v)) : "-" },
    { key: "kredit", label: "Kredit", render: (v) => Number(v) > 0 ? formatRupiah(Number(v)) : "-" },
    { key: "saldo", label: "Saldo", render: (v) => formatRupiah(Math.round(Number(v))) },
  ];

  const jenisLabel: Record<string, string> = { aset: "Aset", liabilitas: "Liabilitas", ekuitas: "Ekuitas", pendapatan: "Pendapatan", beban: "Beban" };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buku Besar</h1>
        <p className="text-sm text-muted-foreground">Mutasi per akun rekening dari jurnal yang sudah diposting, dengan saldo awal periode</p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="min-w-[250px]">
          <Label>Akun Rekening</Label>
          <Select value={akunId} onValueChange={setAkunId}>
            <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
            <SelectContent>
              {akunList?.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Label>Unit / Lembaga</Label>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Unit</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Unit Pendidikan</SelectLabel>
                <SelectItem value="pendidikan">— Gabungan Pendidikan</SelectItem>
                {deptGroups?.pendidikanDepts?.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Unit Usaha & Dana</SelectLabel>
                <SelectItem value="usaha">— Gabungan Usaha & Dana</SelectItem>
                {deptGroups?.usahaDepts?.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bulan Dari</Label>
          <Select value={String(bulanDari)} onValueChange={v => setBulanDari(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bulan Sampai</Label>
          <Select value={String(bulanSampai)} onValueChange={v => setBulanSampai(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-28" value={tahun} onChange={e => setTahun(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox id="penutup" checked={tampilkanPenutup} onCheckedChange={(v) => setTampilkanPenutup(v === true)} />
          <Label htmlFor="penutup" className="font-normal text-sm cursor-pointer">Tampilkan jurnal penutup</Label>
        </div>
      </div>

      {bulanDari > bulanSampai && (
        <p className="text-sm text-destructive">Bulan Dari harus sebelum atau sama dengan Bulan Sampai (dalam tahun yang sama).</p>
      )}

      {selectedAkun && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div><span className="text-muted-foreground">Kode:</span> <span className="font-semibold">{selectedAkun.kode}</span></div>
              <div><span className="text-muted-foreground">Nama:</span> <span className="font-semibold">{selectedAkun.nama}</span></div>
              <div><span className="text-muted-foreground">Jenis:</span> <span className="font-semibold">{jenisLabel[selectedAkun.jenis] || selectedAkun.jenis}</span></div>
              <div><span className="text-muted-foreground">Saldo Normal:</span> <span className="font-semibold">{selectedAkun.saldo_normal === "K" ? "Kredit" : "Debit"}</span></div>
              <div><span className="text-muted-foreground">Unit:</span> <span className="font-semibold">{labelUnit}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {akunId && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 p-3 bg-muted/50 rounded-md flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Saldo Awal per {format(new Date(tglAwal), "d MMM yyyy", { locale: idLocale })} ({labelUnit})
              </span>
              <span className="font-semibold">{formatRupiah(Math.round(saldoAwal))}</span>
            </div>
            <DataTable
              columns={columns}
              data={computedData}
              loading={isLoading}
              pageSize={50}
              actions={
                computedData.length > 0 ? (
                  <ExportButton data={computedData} filename={`buku-besar-${selectedAkun?.kode}`} />
                ) : undefined
              }
            />
            {computedData.length > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md grid grid-cols-1 md:grid-cols-3 gap-2 text-right">
                <div>
                  <span className="text-sm text-muted-foreground mr-2">Total Debit:</span>
                  <span className="font-bold">{formatRupiah(Math.round(totalDebit))}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground mr-2">Total Kredit:</span>
                  <span className="font-bold">{formatRupiah(Math.round(totalKredit))}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground mr-2">Saldo Akhir:</span>
                  <span className="text-lg font-bold">{formatRupiah(Math.round(saldoAkhir))}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!akunId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Pilih akun rekening untuk melihat buku besar
          </CardContent>
        </Card>
      )}
    </div>
  );
}
