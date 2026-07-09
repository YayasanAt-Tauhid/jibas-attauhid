import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, BookOpen, BookMarked, Users, AlertTriangle, RotateCcw } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useParams } from "@/lib/router-compat";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const KATEGORI_BUKU = ["Fiksi", "Non-Fiksi", "Sains", "Agama", "Sejarah", "Referensi", "Lainnya"];

export default function Simtaka() {
  const { tab } = useParams();
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">SIMTAKA</h1>
        <p className="text-sm text-muted-foreground">Sistem Informasi Perpustakaan</p>
      </div>
      <Tabs defaultValue={tab || "katalog"}>
        <TabsList>
          <TabsTrigger value="katalog">Katalog Buku</TabsTrigger>
          <TabsTrigger value="peminjaman">Peminjaman</TabsTrigger>
          <TabsTrigger value="statistik">Statistik</TabsTrigger>
        </TabsList>
        <TabsContent value="katalog"><KatalogBuku /></TabsContent>
        <TabsContent value="peminjaman"><Peminjaman /></TabsContent>
        <TabsContent value="statistik"><StatistikPerpustakaan /></TabsContent>
      </Tabs>
    </div>
  );
}

function KatalogBuku() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "kepala_sekolah" || role === "pustakawan";
  const qc = useQueryClient();
  const [filterKategori, setFilterKategori] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ kode: "", judul: "", pengarang: "", penerbit: "", tahun_terbit: "", isbn: "", kategori: "", jumlah_total: "1", lokasi: "", deskripsi: "" });

  const { data: bukuList, isLoading } = useQuery({
    queryKey: ["koleksi_buku", filterKategori],
    queryFn: async () => {
      let q = supabase.from("koleksi_buku").select("*").eq("aktif", true).order("judul");
      if (filterKategori !== "all") q = q.eq("kategori", filterKategori);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (vals: any) => {
      if (editItem) {
        const { error } = await supabase.from("koleksi_buku").update(vals).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("koleksi_buku").insert({ ...vals, jumlah_tersedia: vals.jumlah_total });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["koleksi_buku"] }); toast.success("Buku berhasil disimpan"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditItem(null);
    setForm({ kode: "", judul: "", pengarang: "", penerbit: "", tahun_terbit: "", isbn: "", kategori: "", jumlah_total: "1", lokasi: "", deskripsi: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ kode: item.kode || "", judul: item.judul, pengarang: item.pengarang || "", penerbit: item.penerbit || "", tahun_terbit: item.tahun_terbit ? String(item.tahun_terbit) : "", isbn: item.isbn || "", kategori: item.kategori || "", jumlah_total: String(item.jumlah_total || 1), lokasi: item.lokasi || "", deskripsi: item.deskripsi || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.judul.trim()) { toast.error("Judul wajib diisi"); return; }
    saveMut.mutate({
      kode: form.kode || null, judul: form.judul, pengarang: form.pengarang || null,
      penerbit: form.penerbit || null, tahun_terbit: form.tahun_terbit ? Number(form.tahun_terbit) : null,
      isbn: form.isbn || null, kategori: form.kategori || null,
      jumlah_total: Number(form.jumlah_total) || 1, lokasi: form.lokasi || null, deskripsi: form.deskripsi || null,
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "kode", label: "Kode", render: (v) => (v as string) || "-" },
    { key: "judul", label: "Judul", sortable: true },
    { key: "pengarang", label: "Pengarang", render: (v) => (v as string) || "-" },
    { key: "kategori", label: "Kategori", render: (v) => v ? <Badge variant="secondary">{v as string}</Badge> : "-" },
    { key: "stok", label: "Tersedia/Total", render: (_, r) => <span className={r.jumlah_tersedia === 0 ? "text-destructive font-bold" : ""}>{r.jumlah_tersedia}/{r.jumlah_total}</span> },
  ];

  if (canEdit) {
    columns.push({
      key: "_aksi", label: "Aksi",
      render: (_, r) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>,
    });
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-3 items-end">
          <div><Label>Kategori</Label><Select value={filterKategori} onValueChange={setFilterKategori}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem>{KATEGORI_BUKU.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Buku</Button>}
      </div>
      <Card><CardContent className="pt-6">
        <DataTable columns={columns} data={bukuList || []} loading={isLoading} searchable searchPlaceholder="Cari judul atau pengarang..." exportable exportFilename="katalog-buku" pageSize={20} />
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit Buku" : "Tambah Buku"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Kode</Label><Input value={form.kode} onChange={e => setForm({ ...form, kode: e.target.value })} /></div>
              <div><Label>ISBN</Label><Input value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} /></div>
            </div>
            <div><Label>Judul *</Label><Input value={form.judul} onChange={e => setForm({ ...form, judul: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Pengarang</Label><Input value={form.pengarang} onChange={e => setForm({ ...form, pengarang: e.target.value })} /></div>
              <div><Label>Penerbit</Label><Input value={form.penerbit} onChange={e => setForm({ ...form, penerbit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Tahun Terbit</Label><Input type="number" value={form.tahun_terbit} onChange={e => setForm({ ...form, tahun_terbit: e.target.value })} /></div>
              <div><Label>Kategori</Label><Select value={form.kategori} onValueChange={v => setForm({ ...form, kategori: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{KATEGORI_BUKU.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Jumlah Total</Label><Input type="number" value={form.jumlah_total} onChange={e => setForm({ ...form, jumlah_total: e.target.value })} /></div>
            </div>
            <div><Label>Lokasi Rak</Label><Input value={form.lokasi} onChange={e => setForm({ ...form, lokasi: e.target.value })} /></div>
            <div><Label>Deskripsi</Label><Textarea value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMut.isPending}>{saveMut.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Peminjaman() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "kepala_sekolah" || role === "pustakawan";
  const qc = useQueryClient();
  const [searchBuku, setSearchBuku] = useState("");
  const [selectedBuku, setSelectedBuku] = useState<any>(null);
  const [peminjamTipe, setPeminjamTipe] = useState("siswa");
  const [searchPeminjam, setSearchPeminjam] = useState("");
  const [selectedPeminjam, setSelectedPeminjam] = useState<any>(null);
  const [tglPinjam, setTglPinjam] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tglKembali, setTglKembali] = useState(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnInfo, setReturnInfo] = useState<any>(null);

  const { data: bukuResults } = useQuery({
    queryKey: ["search_buku", searchBuku],
    enabled: searchBuku.length >= 2,
    queryFn: async () => { const { data } = await supabase.from("koleksi_buku").select("id, kode, judul, jumlah_tersedia").or(`judul.ilike.%${searchBuku}%,kode.ilike.%${searchBuku}%`).gt("jumlah_tersedia", 0).limit(10); return data || []; },
  });

  const { data: peminjamResults } = useQuery({
    queryKey: ["search_peminjam", searchPeminjam, peminjamTipe],
    enabled: searchPeminjam.length >= 2,
    queryFn: async () => {
      if (peminjamTipe === "siswa") {
        const { data } = await supabase.from("siswa").select("id, nis, nama").or(`nama.ilike.%${searchPeminjam}%,nis.ilike.%${searchPeminjam}%`).eq("status", "aktif").limit(10);
        return data || [];
      }
      const { data } = await supabase.from("pegawai").select("id, nip, nama").or(`nama.ilike.%${searchPeminjam}%,nip.ilike.%${searchPeminjam}%`).eq("status", "aktif").limit(10);
      return data || [];
    },
  });

  const { data: peminjamanAktif, isLoading } = useQuery({
    queryKey: ["peminjaman_aktif"],
    queryFn: async () => {
      const { data, error } = await supabase.from("peminjaman").select("*, koleksi_buku:koleksi_id(judul, kode)").eq("status", "dipinjam").order("tanggal_kembali_rencana");
      if (error) throw error;
      return data || [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("peminjaman").insert({
        koleksi_id: selectedBuku.id, peminjam_id: selectedPeminjam.id, peminjam_tipe: peminjamTipe,
        tanggal_pinjam: tglPinjam, tanggal_kembali_rencana: tglKembali,
      });
      if (error) throw error;
      await supabase.from("koleksi_buku").update({ jumlah_tersedia: selectedBuku.jumlah_tersedia - 1 }).eq("id", selectedBuku.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peminjaman_aktif"] });
      qc.invalidateQueries({ queryKey: ["koleksi_buku"] });
      toast.success("Peminjaman berhasil dicatat");
      setSelectedBuku(null); setSelectedPeminjam(null); setSearchBuku(""); setSearchPeminjam("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const returnMut = useMutation({
    mutationFn: async (id: string) => {
      const item = peminjamanAktif?.find(p => p.id === id);
      if (!item) return;
      const hariTerlambat = Math.max(0, differenceInDays(new Date(), new Date(item.tanggal_kembali_rencana)));
      const denda = hariTerlambat * 1000;
      const { error } = await supabase.from("peminjaman").update({ status: "dikembalikan", tanggal_kembali_aktual: format(new Date(), "yyyy-MM-dd"), denda }).eq("id", id);
      if (error) throw error;
      if (item.koleksi_id) {
        const { data: buku } = await supabase.from("koleksi_buku").select("jumlah_tersedia").eq("id", item.koleksi_id).single();
        if (buku) await supabase.from("koleksi_buku").update({ jumlah_tersedia: (buku.jumlah_tersedia || 0) + 1 }).eq("id", item.koleksi_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peminjaman_aktif"] });
      qc.invalidateQueries({ queryKey: ["koleksi_buku"] });
      toast.success("Buku berhasil dikembalikan");
      setReturnId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleReturn = (item: any) => {
    const hariTerlambat = Math.max(0, differenceInDays(new Date(), new Date(item.tanggal_kembali_rencana)));
    setReturnInfo({ ...item, hariTerlambat, denda: hariTerlambat * 1000 });
    setReturnId(item.id);
  };

  const columns: DataTableColumn<any>[] = [
    { key: "judul", label: "Judul Buku", render: (_, r) => r.koleksi_buku?.judul || "-" },
    { key: "peminjam_tipe", label: "Tipe", render: v => <Badge variant="secondary">{v as string}</Badge> },
    { key: "tanggal_pinjam", label: "Tgl Pinjam", render: v => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "tanggal_kembali_rencana", label: "Tgl Kembali", render: v => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    {
      key: "sisa", label: "Sisa Hari",
      render: (_, r) => {
        const sisa = differenceInDays(new Date(r.tanggal_kembali_rencana), new Date());
        return <span className={sisa < 0 ? "text-destructive font-bold" : sisa <= 2 ? "text-yellow-600" : ""}>{sisa < 0 ? `Terlambat ${Math.abs(sisa)} hari` : `${sisa} hari`}</span>;
      },
    },
  ];

  if (canEdit) {
    columns.push({
      key: "_aksi", label: "Aksi",
      render: (_, r) => <Button variant="outline" size="sm" onClick={() => handleReturn(r)}><RotateCcw className="h-4 w-4 mr-1" />Kembalikan</Button>,
    });
  }

  return (
    <div className="space-y-6 pt-4">
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Peminjaman Baru</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cari Buku</Label>
                <Input placeholder="Cari judul atau kode..." value={searchBuku} onChange={e => setSearchBuku(e.target.value)} />
                {bukuResults && searchBuku.length >= 2 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {bukuResults.map(b => (
                      <button key={b.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setSelectedBuku(b); setSearchBuku(""); }}>
                        <span className="font-medium">{b.judul}</span> <span className="text-muted-foreground">({b.jumlah_tersedia} tersedia)</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedBuku && <Badge variant="secondary">{selectedBuku.judul}</Badge>}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <Label>Peminjam</Label>
                  <Select value={peminjamTipe} onValueChange={v => { setPeminjamTipe(v); setSelectedPeminjam(null); setSearchPeminjam(""); }}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="siswa">Siswa</SelectItem><SelectItem value="pegawai">Pegawai</SelectItem></SelectContent>
                  </Select>
                </div>
                <Input placeholder={`Cari ${peminjamTipe}...`} value={searchPeminjam} onChange={e => setSearchPeminjam(e.target.value)} />
                {peminjamResults && searchPeminjam.length >= 2 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {peminjamResults.map((p: any) => (
                      <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setSelectedPeminjam(p); setSearchPeminjam(""); }}>
                        {p.nama} <span className="text-muted-foreground">({p.nis || p.nip || "-"})</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPeminjam && <Badge variant="secondary">{selectedPeminjam.nama}</Badge>}
              </div>
            </div>
            <div className="flex gap-4 items-end">
              <div><Label>Tgl Pinjam</Label><Input type="date" value={tglPinjam} onChange={e => setTglPinjam(e.target.value)} /></div>
              <div><Label>Tgl Kembali</Label><Input type="date" value={tglKembali} onChange={e => setTglKembali(e.target.value)} /></div>
              <Button onClick={() => createMut.mutate()} disabled={!selectedBuku || !selectedPeminjam || createMut.isPending}>{createMut.isPending ? "Menyimpan..." : "Catat Peminjaman"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Peminjaman Aktif</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={columns} data={peminjamanAktif || []} loading={isLoading} searchable pageSize={20} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!returnId}
        onOpenChange={() => setReturnId(null)}
        title="Kembalikan Buku"
        description={returnInfo ? `Kembalikan "${returnInfo.koleksi_buku?.judul}"?${returnInfo.hariTerlambat > 0 ? ` Terlambat ${returnInfo.hariTerlambat} hari, denda: Rp ${returnInfo.denda.toLocaleString("id-ID")}` : " Tepat waktu, tidak ada denda."}` : ""}
        onConfirm={() => { if (returnId) returnMut.mutate(returnId); }}
        loading={returnMut.isPending}
      />
    </div>
  );
}

function StatistikPerpustakaan() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["simtaka_stats"],
    queryFn: async () => {
      const [{ count: totalBuku }, { count: dipinjam }, { count: terlambat }] = await Promise.all([
        supabase.from("koleksi_buku").select("*", { count: "exact", head: true }).eq("aktif", true),
        supabase.from("peminjaman").select("*", { count: "exact", head: true }).eq("status", "dipinjam"),
        supabase.from("peminjaman").select("*", { count: "exact", head: true }).eq("status", "dipinjam").lt("tanggal_kembali_rencana", format(new Date(), "yyyy-MM-dd")),
      ]);
      return { totalBuku: totalBuku || 0, dipinjam: dipinjam || 0, terlambat: terlambat || 0 };
    },
  });

  const { data: chartData } = useQuery({
    queryKey: ["simtaka_chart"],
    queryFn: async () => {
      const months: { bulan: string; jumlah: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
        const { count } = await supabase.from("peminjaman").select("*", { count: "exact", head: true }).gte("tanggal_pinjam", start).lt("tanggal_pinjam", end);
        months.push({ bulan: format(d, "MMM", { locale: idLocale }), jumlah: count || 0 });
      }
      return months;
    },
  });

  const { data: topBuku } = useQuery({
    queryKey: ["simtaka_top_buku"],
    queryFn: async () => {
      const { data } = await supabase.from("peminjaman").select("koleksi_id, koleksi_buku:koleksi_id(judul)");
      const countMap = new Map<string, { judul: string; count: number }>();
      (data || []).forEach((p: any) => {
        const id = p.koleksi_id;
        if (!countMap.has(id)) countMap.set(id, { judul: p.koleksi_buku?.judul || "-", count: 0 });
        countMap.get(id)!.count++;
      });
      return Array.from(countMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
    },
  });

  return (
    <div className="space-y-6 pt-4">
      {isLoading ? <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard title="Total Koleksi" value={stats?.totalBuku || 0} icon={BookOpen} color="primary" />
          <StatsCard title="Sedang Dipinjam" value={stats?.dipinjam || 0} icon={BookMarked} color="info" />
          <StatsCard title="Terlambat" value={stats?.terlambat || 0} icon={AlertTriangle} color="destructive" />
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Peminjaman 6 Bulan Terakhir</CardTitle></CardHeader>
        <CardContent>
          {chartData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bulan" /><YAxis /><Tooltip /><Bar dataKey="jumlah" fill="hsl(var(--primary))" radius={[4,4,0,0]} /></BarChart>
            </ResponsiveContainer>
          ) : <Skeleton className="h-64" />}
        </CardContent>
      </Card>
      {topBuku && topBuku.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Buku Paling Sering Dipinjam</CardTitle></CardHeader>
          <CardContent>
            <DataTable columns={[
              { key: "judul", label: "Judul Buku" },
              { key: "count", label: "Jumlah Peminjaman", sortable: true },
            ]} data={topBuku} searchable={false} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
