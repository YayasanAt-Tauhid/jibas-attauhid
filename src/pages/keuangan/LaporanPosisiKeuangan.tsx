import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLaporanPosisiKeuangan, useDepartemenGroups, PeriodeFilter, posisiLabel } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer, AlertTriangle } from "lucide-react";

function Row({ label, value, bold, indent, contraAsset }: { label: string; value: number; bold?: boolean; indent?: boolean; contraAsset?: boolean }) {
  const neg = value < 0;
  const display = neg ? `(${formatRupiah(Math.abs(Math.round(value)))})` : formatRupiah(Math.round(value));
  const colorClass = neg && !contraAsset ? "text-destructive" : "";
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold" : ""} ${indent ? "pl-4" : ""} ${colorClass}`}>
      <span>{label}</span><span>{display}</span>
    </div>
  );
}

function Divider() { return <div className="border-t my-1" />; }
function DoubleDivider() { return <div className="border-t-2 border-foreground my-2" />; }

export default function LaporanPosisiKeuangan() {
  const currentYear = new Date().getFullYear();
  const [modePeriode, setModePeriode] = useState<"tahun" | "range">("tahun");
  const [selectedNama, setSelectedNama] = useState("");
  const [tglAwal, setTglAwal] = useState(`${currentYear}-01-01`);
  const [tglAkhir, setTglAkhir] = useState(`${currentYear}-12-31`);
  const [filterUnit, setFilterUnit] = useState("semua");
  const { data: taList = [] } = useTahunAjaran();
  const { data: deptGroups } = useDepartemenGroups();

  const taOptions = taList
    .filter((t: any) => t.tanggal_selesai)
    .sort((a: any, b: any) => b.tanggal_selesai.localeCompare(a.tanggal_selesai));

  const selectedTA = taOptions.find((t: any) => t.nama === selectedNama) ?? taOptions[0];
  const namaTampil = selectedTA?.nama ?? String(currentYear);

  const allDepts = [...(deptGroups?.pendidikanDepts ?? []), ...(deptGroups?.usahaDepts ?? [])];
  const departemenIds =
    filterUnit === "semua" ? undefined :
    filterUnit === "pendidikan" ? deptGroups?.pendidikanIds :
    filterUnit === "usaha" ? deptGroups?.usahaIds :
    allDepts.some(d => d.id === filterUnit) ? [filterUnit] :
    undefined;

  const filter: PeriodeFilter = modePeriode === "tahun" && selectedTA
    ? { type: "range", tglAwal: selectedTA.tanggal_mulai, tglAkhir: selectedTA.tanggal_selesai }
    : { type: "range", tglAwal, tglAkhir };

  const { data, isLoading, isError, error } = useLaporanPosisiKeuangan(filter, departemenIds);

  const labelUnit =
    filterUnit === "semua" ? "Gabungan Semua Unit" :
    filterUnit === "pendidikan" ? "Unit Pendidikan (Gabungan)" :
    filterUnit === "usaha" ? "Unit Usaha & Dana (Gabungan)" :
    allDepts.find(d => d.id === filterUnit)?.nama ?? filterUnit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Posisi Keuangan</h1>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Toggle mode periode */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 ${modePeriode === "tahun" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setModePeriode("tahun")}>Per Tahun</button>
            <button
              className={`px-3 py-1.5 ${modePeriode === "range" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setModePeriode("range")}>Rentang Tanggal</button>
          </div>

          {modePeriode === "tahun" ? (
            <Select value={selectedTA?.nama ?? ""} onValueChange={setSelectedNama}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{taOptions.map((t: any) => <SelectItem key={t.id} value={t.nama}>{t.nama}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-1">
              <Input type="date" className="w-36 h-9" value={tglAwal} onChange={e => setTglAwal(e.target.value)} />
              <span className="text-muted-foreground text-sm">s.d.</span>
              <Input type="date" className="w-36 h-9" value={tglAkhir} onChange={e => setTglAkhir(e.target.value)} />
            </div>
          )}

          <Select value={filterUnit} onValueChange={v => setFilterUnit(v)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Gabungan Semua Unit</SelectItem>
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
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN POSISI KEUANGAN</CardTitle>
          <p className="text-sm text-muted-foreground">{labelUnit} — {modePeriode === "tahun" ? namaTampil : posisiLabel(filter)}</p>
        </CardHeader>
        <CardContent>
          {isError ? <p className="text-destructive text-sm">Gagal memuat data: {(error as any)?.message}</p> : isLoading || !data ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-4 max-w-2xl mx-auto">
              <h3 className="font-bold text-sm uppercase tracking-wider">ASET</h3>
              <div className="space-y-1">
                <p className="font-medium text-sm">Aset Lancar:</p>
                {data.asetLancarItems.filter(a => a.saldo !== 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                <Divider />
                <Row label="Total Aset Lancar" value={data.totalAL} bold />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Aset Tidak Lancar:</p>
                {data.asetTidakLancarItems.filter(a => a.saldo > 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                {data.asetTidakLancarItems.filter(a => a.saldo < 0).map(a => (
                  <Row key={a.akun_id} label={`Dikurangi: ${a.nama}`} value={a.saldo} indent contraAsset />
                ))}
                <Divider />
                <Row label="Total Aset Tidak Lancar (Nilai Buku)" value={data.totalATL} bold />
              </div>
              <DoubleDivider />
              <Row label="TOTAL ASET" value={data.totalAset} bold />

              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">LIABILITAS</h3>
              <div className="space-y-1">
                <p className="font-medium text-sm">Liabilitas Jangka Pendek:</p>
                {data.liabJPItems.filter(a => a.saldo !== 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                <Divider />
                <Row label="Total Liabilitas Jangka Pendek" value={data.totalLJP} bold />
              </div>
              {data.liabJGItems.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-sm">Liabilitas Jangka Panjang:</p>
                  {data.liabJGItems.filter(a => a.saldo !== 0).map(a => (
                    <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                  ))}
                  <Divider />
                  <Row label="Total Liabilitas Jangka Panjang" value={data.totalLJG} bold />
                </div>
              )}
              <DoubleDivider />
              <Row label="TOTAL LIABILITAS" value={data.totalLiabilitas} bold />

              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">ASET NETO</h3>
              {data.asetNetoItems.filter(a => a.saldo !== 0).map(a => (
                <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
              ))}
              {data.asetNetoItems.filter(a => a.saldo !== 0).length === 0 && (
                <p className="text-xs text-muted-foreground pl-4 italic">Belum ada saldo akun aset neto — lakukan tutup buku untuk memindahkan surplus ke ekuitas.</p>
              )}
              <Divider />
              <Row label="Saldo Aset Neto (dari Akun Ekuitas)" value={data.totalAsetNetoSaldo} indent />
              {data.surplusBerjalan !== 0 && (
                <Row label="Surplus (Defisit) Periode Berjalan — Tidak Terikat" value={data.surplusBerjalan} indent />
              )}
              {data.surplusTerbatasBerjalan !== 0 && (
                <Row label="Surplus (Defisit) Periode Berjalan — Terikat" value={data.surplusTerbatasBerjalan} indent />
              )}
              <DoubleDivider />
              <Row label="TOTAL ASET NETO" value={data.totalAsetNeto} bold />
              <Row label="TOTAL LIABILITAS & ASET NETO" value={data.totalLiabilitas + data.totalAsetNeto} bold />

              {Math.abs(data.selisih) > 1 && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Perhatian: neraca tidak seimbang (selisih: {formatRupiah(Math.round(Math.abs(data.selisih)))}).
                    Periksa pemetaan <code>pos_isak35</code> pada akun rekening atau lakukan koreksi jurnal.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
