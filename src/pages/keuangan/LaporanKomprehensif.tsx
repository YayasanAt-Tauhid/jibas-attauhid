import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLaporanKomprehensif, useDepartemenGroups } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer } from "lucide-react";

function Nominal({ value, bold }: { value: number; bold?: boolean }) {
  const cls = `text-right ${value < 0 ? "text-destructive" : ""} ${bold ? "font-bold text-base" : ""}`;
  return <span className={cls}>{formatRupiah(Math.round(value))}</span>;
}

export default function LaporanKomprehensif() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(currentYear);
  const [filterUnit, setFilterUnit] = useState("semua");
  const { data: taList = [] } = useTahunAjaran();
  const { data: deptGroups } = useDepartemenGroups();

  const allDepts = [...(deptGroups?.pendidikanDepts ?? []), ...(deptGroups?.usahaDepts ?? [])];
  const departemenIds =
    filterUnit === "semua" ? undefined :
    filterUnit === "pendidikan" ? deptGroups?.pendidikanIds :
    filterUnit === "usaha" ? deptGroups?.usahaIds :
    allDepts.some(d => d.id === filterUnit) ? [filterUnit] :
    undefined;

  const { data, isLoading, isError, error } = useLaporanKomprehensif(tahun, departemenIds);

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/);
    return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  const labelUnit =
    filterUnit === "semua" ? "Gabungan Semua Unit" :
    filterUnit === "pendidikan" ? "Unit Pendidikan (Gabungan)" :
    filterUnit === "usaha" ? "Unit Usaha & Dana (Gabungan)" :
    allDepts.find(d => d.id === filterUnit)?.nama ?? filterUnit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Penghasilan Komprehensif</h1>
        <div className="flex items-center gap-3">
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
          <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN PENGHASILAN KOMPREHENSIF</CardTitle>
          <p className="text-sm text-muted-foreground">{labelUnit} — Untuk Tahun yang Berakhir pada 31 Desember {tahun}</p>
        </CardHeader>
        <CardContent>
          {isError ? <p className="text-destructive text-sm">Gagal memuat data: {(error as any)?.message}</p> : isLoading || !data ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Tanpa Pembatasan */}
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">Tanpa Pembatasan dari Pemberi Sumber Daya</h3>
                <div className="space-y-1">
                  <p className="font-medium text-sm">Pendapatan:</p>
                  {data.pendapatan.map(a => (
                    <div key={a.akun_id} className="flex justify-between text-sm pl-4"><span>{a.nama}</span><Nominal value={a.saldo} /></div>
                  ))}
                  <div className="flex justify-between font-semibold text-sm border-t pt-1"><span>Total Pendapatan</span><Nominal value={data.totalPendapatan} /></div>
                </div>
                <div className="space-y-1 mt-4">
                  <p className="font-medium text-sm">Beban:</p>
                  {data.beban.map(a => (
                    <div key={a.akun_id} className="flex justify-between text-sm pl-4"><span>{a.nama}</span><Nominal value={a.saldo} /></div>
                  ))}
                  <div className="flex justify-between font-semibold text-sm border-t pt-1"><span>Total Beban</span><Nominal value={data.totalBeban} /></div>
                </div>
                <div className="flex justify-between font-bold text-sm border-t-2 border-foreground pt-2 mt-3">
                  <span>Surplus (Defisit)</span><Nominal value={data.surplusDefisit} bold />
                </div>
              </div>

              {/* Dengan Pembatasan */}
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">Dengan Pembatasan dari Pemberi Sumber Daya</h3>
                <div className="space-y-1">
                  <p className="font-medium text-sm">Pendapatan:</p>
                  {data.pendapatanTerbatas.map(a => (
                    <div key={a.akun_id} className="flex justify-between text-sm pl-4"><span>{a.nama}</span><Nominal value={a.saldo} /></div>
                  ))}
                  <div className="flex justify-between font-semibold text-sm border-t pt-1"><span>Total Pendapatan Terbatas</span><Nominal value={data.totalPT} /></div>
                </div>
                <div className="space-y-1 mt-4">
                  <p className="font-medium text-sm">Beban:</p>
                  {data.bebanTerbatas.map(a => (
                    <div key={a.akun_id} className="flex justify-between text-sm pl-4"><span>{a.nama}</span><Nominal value={a.saldo} /></div>
                  ))}
                  <div className="flex justify-between font-semibold text-sm border-t pt-1"><span>Total Beban Terbatas</span><Nominal value={data.totalBT} /></div>
                </div>
                <div className="flex justify-between font-bold text-sm border-t-2 border-foreground pt-2 mt-3">
                  <span>Surplus (Defisit) Terbatas</span><Nominal value={data.surplusTerbatas} bold />
                </div>
              </div>

              {/* PKL & Total */}
              <div className="border-t-2 border-foreground pt-3 space-y-2">
                <div className="flex justify-between text-sm"><span>Penghasilan Komprehensif Lain</span><Nominal value={data.pkl} /></div>
                <div className="flex justify-between font-bold text-lg border-t-2 border-foreground pt-2">
                  <span>TOTAL PENGHASILAN KOMPREHENSIF</span><Nominal value={data.totalKomprehensif} bold />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
