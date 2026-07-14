import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { useTabunganSiswa, useTransaksiTabunganList, useTransaksiTabungan, formatRupiah } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Search, PiggyBank } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function TabunganSiswa() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSiswa, setSelectedSiswa] = useState<any>(null);

  const [jenis, setJenis] = useState<"setor" | "ambil">("setor");
  const [jumlah, setJumlah] = useState("");
  const [tanggal, setTanggal] = useState(format(new Date(), "yyyy-MM-dd"));
  const [keterangan, setKeterangan] = useState("");

  const { data: tabungan } = useTabunganSiswa(selectedSiswa?.id);
  const { data: transaksiList, isLoading } = useTransaksiTabunganList(selectedSiswa?.id);
  const transaksiMut = useTransaksiTabungan();

  const { data: searchResults } = useQuery({
    queryKey: ["search_siswa_tab", searchTerm],
    enabled: searchTerm.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("siswa")
        .select("id, nis, nama, foto_url, kelas_siswa(aktif, kelas(nama))")
        .or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`)
        .eq("status", "aktif")
        .limit(10);
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!selectedSiswa || !jumlah) return;
    await transaksiMut.mutateAsync({
      siswa_id: selectedSiswa.id,
      jenis,
      jumlah: Number(jumlah),
      tanggal,
      keterangan: keterangan || undefined,
    });
    setJumlah("");
    setKeterangan("");
  };

  const saldo = Number(tabungan?.saldo || 0);
  const kelasNama = (selectedSiswa?.kelas_siswa?.find((ks: any) => ks.aktif) ?? selectedSiswa?.kelas_siswa?.[0])?.kelas?.nama || "-";

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    {
      key: "jenis", label: "Jenis",
      render: (v) => (
        <span className={v === "setor" ? "text-success font-medium" : "text-destructive font-medium"}>
          {v === "setor" ? "Setor" : "Ambil"}
        </span>
      ),
    },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "saldo_sesudah", label: "Saldo", render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tabungan Siswa</h1>
        <p className="text-sm text-muted-foreground">Kelola tabungan siswa</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari siswa (NIS atau nama)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            {searchResults && searchResults.length > 0 && searchTerm.length >= 2 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s: any) => (
                  <button
                    key={s.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3"
                    onClick={() => { setSelectedSiswa(s); setSearchTerm(""); }}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{s.nama?.[0]}</div>
                    <div>
                      <p className="text-sm font-medium">{s.nama}</p>
                      <p className="text-xs text-muted-foreground">NIS: {s.nis || "-"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSiswa && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Student info + balance */}
          <Card className="lg:col-span-1">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">{selectedSiswa.nama?.[0]}</div>
                <div>
                  <h3 className="font-semibold">{selectedSiswa.nama}</h3>
                  <p className="text-xs text-muted-foreground">NIS: {selectedSiswa.nis || "-"} • {kelasNama}</p>
                </div>
              </div>
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <PiggyBank className="h-8 w-8 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Saldo Tabungan</p>
                <p className="text-2xl font-bold text-primary">{formatRupiah(saldo)}</p>
              </div>

              {/* Transaction form */}
              <div className="space-y-3 pt-2">
                <div>
                  <Label>Jenis Transaksi</Label>
                  <Select value={jenis} onValueChange={(v) => setJenis(v as "setor" | "ambil")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="setor">Setor</SelectItem>
                      <SelectItem value="ambil">Ambil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jumlah (Rp)</Label>
                  <Input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Tanggal</Label>
                  <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
                </div>
                <div>
                  <Label>Keterangan</Label>
                  <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional" rows={2} />
                </div>
                <Button onClick={handleSubmit} disabled={!jumlah || transaksiMut.isPending} className="w-full">
                  {transaksiMut.isPending ? "Memproses..." : jenis === "setor" ? "Setor" : "Ambil"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transaction history */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Riwayat Transaksi</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={transaksiList || []}
                loading={isLoading}
                searchable={false}
                pageSize={15}
                emptyMessage="Belum ada transaksi tabungan"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
