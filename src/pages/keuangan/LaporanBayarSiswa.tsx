import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { useLembaga, formatRupiah, namaBulanTahun } from "@/hooks/useKeuangan";
import { useTahunAjaran } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Search, Wallet, Calendar, Hash, Clock } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function LaporanBayarSiswa() {
  const [searchTerm, setSearchTerm] = useState("");
  const [departemenId, setDepartemenId] = useState("");
  const [selectedSiswa, setSelectedSiswa] = useState<any>(null);
  const [filterTaId, setFilterTaId] = useState("all");

  const { data: lembagaList } = useLembaga();
  const { data: taList } = useTahunAjaran();

  const { data: searchResults } = useQuery({
    queryKey: ["search_siswa_laporan", searchTerm, departemenId],
    enabled: searchTerm.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("siswa").select("id, nis, nama, foto_url, kelas_siswa(aktif, kelas(nama))").or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`).eq("status", "aktif").limit(10);
      return data || [];
    },
  });

  const { data: riwayat, isLoading } = useQuery({
    queryKey: ["laporan_bayar_siswa", selectedSiswa?.id, filterTaId],
    enabled: !!selectedSiswa,
    queryFn: async () => {
      let q = supabase.from("pembayaran").select("*, jenis_pembayaran:jenis_id(nama, tipe), tahun_ajaran:tahun_ajaran_id(nama)").eq("siswa_id", selectedSiswa.id).order("tanggal_bayar", { ascending: false });
      if (filterTaId && filterTaId !== "all") q = q.eq("tahun_ajaran_id", filterTaId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const totalSemua = riwayat?.reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;
  const tahunIni = new Date().getFullYear();
  const totalTahunIni = riwayat?.filter(r => r.tanggal_bayar && new Date(r.tanggal_bayar).getFullYear() === tahunIni).reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;
  const terakhirBayar = riwayat?.[0]?.tanggal_bayar;

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal_bayar", label: "Tanggal", render: v => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pembayaran?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v, r) => {
      const tipe = (r as any).jenis_pembayaran?.tipe;
      if (tipe === "sekali" || v === 0) return "Sekali Bayar";
      return namaBulanTahun(v as number, { tanggalTransaksi: r.tanggal_bayar });
    }},
    { key: "ta", label: "Tahun Ajaran", render: (_, r) => r.tahun_ajaran?.nama || "-" },
    { key: "jumlah", label: "Jumlah", render: v => formatRupiah(Number(v)) },
  ];

  const kelasNama = (selectedSiswa?.kelas_siswa?.find((ks: any) => ks.aktif) ?? selectedSiswa?.kelas_siswa?.[0])?.kelas?.nama || "-";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Pembayaran Per Siswa</h1>
        <p className="text-sm text-muted-foreground">Riwayat pembayaran lengkap per siswa</p>
      </div>

      <Card><CardContent className="pt-6 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Lembaga</Label><Select value={departemenId} onValueChange={v => { setDepartemenId(v); setSelectedSiswa(null); }}><SelectTrigger className="w-48"><SelectValue placeholder="Pilih lembaga" /></SelectTrigger><SelectContent>{lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}</SelectContent></Select></div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari siswa (NIS atau nama)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            {searchResults && searchTerm.length >= 2 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s: any) => (
                  <button key={s.id} className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3" onClick={() => { setSelectedSiswa(s); setSearchTerm(""); }}>
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{s.nama?.[0]}</div>
                    <div><p className="text-sm font-medium">{s.nama}</p><p className="text-xs text-muted-foreground">NIS: {s.nis || "-"}</p></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent></Card>

      {selectedSiswa && (
        <>
          <Card><CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                {selectedSiswa.foto_url && <AvatarImage src={selectedSiswa.foto_url} />}
                <AvatarFallback className="bg-primary/10 text-primary text-lg">{selectedSiswa.nama?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{selectedSiswa.nama}</h3>
                <p className="text-sm text-muted-foreground">NIS: {selectedSiswa.nis || "-"} • Kelas: {kelasNama}</p>
              </div>
            </div>
          </CardContent></Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="Total Dibayar" value={formatRupiah(totalSemua)} icon={Wallet} color="primary" />
            <StatsCard title="Total Tahun Ini" value={formatRupiah(totalTahunIni)} icon={Calendar} color="success" />
            <StatsCard title="Jumlah Transaksi" value={riwayat?.length || 0} icon={Hash} color="info" />
            <StatsCard title="Terakhir Bayar" value={terakhirBayar ? format(new Date(terakhirBayar), "dd MMM yyyy", { locale: idLocale }) : "-"} icon={Clock} color="warning" />
          </div>

          <div className="flex gap-3 items-end">
            <div><Label>Filter Tahun Ajaran</Label><Select value={filterTaId} onValueChange={setFilterTaId}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <Card><CardContent className="pt-6">
            <DataTable columns={columns} data={riwayat || []} loading={isLoading} exportable exportFilename={`laporan-bayar-${selectedSiswa.nama}`} pageSize={20} />
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
