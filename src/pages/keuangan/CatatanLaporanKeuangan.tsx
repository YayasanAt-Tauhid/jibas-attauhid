import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KopLaporan from "@/components/keuangan/KopLaporan";
import { Printer } from "lucide-react";
import { useTahunAjaran, formatRupiah } from "@/hooks/useKeuangan";
import { useLaporanPosisiKeuangan, useLaporanKomprehensif, useDepartemenGroups, PeriodeFilter, periodeLabel, posisiLabel } from "@/hooks/useISAK35";

export default function CatatanLaporanKeuangan() {
  const currentYear = new Date().getFullYear();
  const [modePeriode, setModePeriode] = useState<"tahun" | "range">("tahun");
  const [tahun, setTahun] = useState(currentYear);
  const [tglAwal, setTglAwal] = useState(`${currentYear}-01-01`);
  const [tglAkhir, setTglAkhir] = useState(`${currentYear}-12-31`);
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

  const filter: PeriodeFilter = modePeriode === "tahun"
    ? { type: "tahun", tahun }
    : { type: "range", tglAwal, tglAkhir };

  const { data: posisi } = useLaporanPosisiKeuangan(filter, departemenIds);
  const { data: kompr } = useLaporanKomprehensif(filter, departemenIds);

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/); return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  const labelUnit =
    filterUnit === "semua" ? "Gabungan Semua Unit" :
    filterUnit === "pendidikan" ? "Unit Pendidikan (Gabungan)" :
    filterUnit === "usaha" ? "Unit Usaha & Dana (Gabungan)" :
    allDepts.find(d => d.id === filterUnit)?.nama ?? filterUnit;

  const tahunLabel = modePeriode === "tahun" ? tahun : parseInt(tglAkhir.substring(0, 4));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Catatan atas Laporan Keuangan (CaLK)</h1>
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
            <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
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

      <Card className="print:border-0 print:shadow-none">
        <KopLaporan />
        <CardHeader className="text-center">
          <CardTitle className="text-lg">CATATAN ATAS LAPORAN KEUANGAN</CardTitle>
          <p className="text-sm text-muted-foreground">{labelUnit} — {periodeLabel(filter)}</p>
          <p className="text-xs text-muted-foreground">Sesuai ISAK 35 Paragraf 19</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-3xl mx-auto space-y-6">
          <section>
            <h3 className="font-bold">1. Informasi Umum Entitas</h3>
            <p>Yayasan merupakan entitas berorientasi nonlaba yang bergerak di bidang pendidikan. Laporan keuangan ini disusun sesuai dengan <strong>ISAK 35 — Penyajian Laporan Keuangan Entitas Berorientasi Nonlaba</strong>.</p>
          </section>

          <section>
            <h3 className="font-bold">2. Dasar Penyusunan Laporan Keuangan</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Laporan keuangan disusun atas dasar <strong>akrual</strong> dan menggunakan konsep <strong>biaya historis</strong>, kecuali dinyatakan lain.</li>
              <li>Mata uang pelaporan adalah Rupiah (Rp).</li>
              <li>Periode pelaporan: <strong>{periodeLabel(filter)}</strong>.</li>
              <li>Komponen laporan keuangan terdiri dari: Laporan Posisi Keuangan, Laporan Penghasilan Komprehensif, Laporan Perubahan Aset Neto, Laporan Arus Kas (metode langsung), dan Catatan atas Laporan Keuangan.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold">3. Ikhtisar Kebijakan Akuntansi Signifikan</h3>
            <h4 className="font-semibold mt-2">3.1 Klasifikasi Aset Neto</h4>
            <p>Aset neto diklasifikasikan menjadi:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Aset Neto Tanpa Pembatasan</strong> — sumber daya yang penggunaannya tidak dibatasi oleh pemberi sumber daya.</li>
              <li><strong>Aset Neto Dengan Pembatasan Temporer</strong> — penggunaannya dibatasi sampai periode/tujuan tertentu terpenuhi.</li>
              <li><strong>Aset Neto Dengan Pembatasan Permanen</strong> — pokok dana harus dipertahankan secara permanen.</li>
            </ul>

            <h4 className="font-semibold mt-2">3.2 Pengakuan Pendapatan</h4>
            <p>Pendapatan diakui pada saat hak untuk menerima sumber daya telah terpenuhi. Pendapatan diterima di muka (mis. SPP yang dibayar lebih awal) dicatat sebagai <strong>liabilitas</strong> dan diakui sebagai pendapatan secara proporsional pada periode jasa diberikan.</p>

            <h4 className="font-semibold mt-2">3.3 Aset Tetap dan Depresiasi</h4>
            <p>Aset tetap dicatat sebesar harga perolehan dan disusutkan dengan metode <strong>garis lurus</strong> selama umur ekonomis. Beban depresiasi periode ini sebesar <strong>{formatRupiah(Math.round((kompr?.beban || []).filter(a => a.nama.toLowerCase().includes('penyusutan')).reduce((s, a) => s + a.saldo, 0)))}</strong>.</p>

            <h4 className="font-semibold mt-2">3.4 Kas dan Setara Kas</h4>
            <p>Kas dan setara kas mencakup kas di tangan dan saldo bank yang dapat segera digunakan. Laporan arus kas disusun dengan <strong>metode langsung</strong>.</p>
          </section>

          <section>
            <h3 className="font-bold">4. Pengungkapan atas Pos-Pos Signifikan</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b"><td className="py-1">Total Aset</td><td className="text-right">{formatRupiah(Math.round(posisi?.totalAset || 0))}</td></tr>
                <tr className="border-b"><td className="py-1">Total Liabilitas</td><td className="text-right">{formatRupiah(Math.round(posisi?.totalLiabilitas || 0))}</td></tr>
                <tr className="border-b"><td className="py-1">Saldo Aset Neto (akun ekuitas)</td><td className="text-right">{formatRupiah(Math.round(posisi?.totalAsetNetoSaldo || 0))}</td></tr>
                <tr className="border-b"><td className="py-1">Surplus/(Defisit) Periode Berjalan — Tidak Terikat</td><td className="text-right">{formatRupiah(Math.round(kompr?.surplusDefisit || 0))}</td></tr>
                <tr className="border-b"><td className="py-1">Surplus/(Defisit) Periode Berjalan — Terikat</td><td className="text-right">{formatRupiah(Math.round(kompr?.surplusTerbatas || 0))}</td></tr>
                <tr className="border-b"><td className="py-1">Penghasilan Komprehensif Lain</td><td className="text-right">{formatRupiah(Math.round(kompr?.pkl || 0))}</td></tr>
                <tr className="font-semibold"><td className="py-1">Total Penghasilan Komprehensif</td><td className="text-right">{formatRupiah(Math.round(kompr?.totalKomprehensif || 0))}</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="font-bold">5. Peristiwa Setelah Periode Pelaporan</h3>
            <p className="text-muted-foreground italic">Tidak terdapat peristiwa material setelah tanggal pelaporan yang memerlukan penyesuaian atau pengungkapan tambahan, kecuali yang telah diungkapkan di atas.</p>
          </section>

          <section className="text-xs text-muted-foreground border-t pt-3">
            <p>* CaLK ini bersifat ringkas. Pengungkapan tambahan (rincian piutang, kewajiban, komitmen, transaksi pihak berelasi, dsb.) dapat dilengkapi sesuai kebutuhan entitas.</p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
