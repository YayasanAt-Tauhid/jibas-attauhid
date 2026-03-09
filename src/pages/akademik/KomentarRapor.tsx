import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

export default function KomentarRapor() {
  const qc = useQueryClient();
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [editSiswa, setEditSiswa] = useState<any>(null);
  const [komentarWali, setKomentarWali] = useState("");
  const [komentarKepala, setKomentarKepala] = useState("");
  const [catatanPiket, setCatatanPiket] = useState("");

  const { data: kelasList } = useKelas();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["komentar_rapor", kelasId, taId, semId],
    enabled: !!kelasId && !!taId && !!semId,
    queryFn: async () => {
      const { data: ksList } = await supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama)").eq("kelas_id", kelasId).eq("aktif", true);
      const siswaList = (ksList || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));

      const { data: komentarData } = await supabase.from("komentar_rapor").select("*")
        .eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId);
      const komentarMap = new Map((komentarData || []).map((k: any) => [k.siswa_id, k]));

      return siswaList.map((s: any) => ({ ...s, komentar: komentarMap.get(s.id) || null }));
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("komentar_rapor").upsert({
        siswa_id: editSiswa.id, kelas_id: kelasId, tahun_ajaran_id: taId, semester_id: semId,
        komentar_wali: komentarWali || null, komentar_kepala: komentarKepala || null, catatan_piket: catatanPiket || null,
      }, { onConflict: "siswa_id,kelas_id,tahun_ajaran_id,semester_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["komentar_rapor"] }); toast.success("Komentar disimpan"); setEditSiswa(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (row: any) => {
    setEditSiswa(row);
    setKomentarWali(row.komentar?.komentar_wali || "");
    setKomentarKepala(row.komentar?.komentar_kepala || "");
    setCatatanPiket(row.komentar?.catatan_piket || "");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Komentar Rapor</h1>
        <p className="text-sm text-muted-foreground">Input komentar wali kelas dan kepala sekolah untuk rapor</p>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </CardContent></Card>

      {kelasId && taId && semId && (isLoading ? <Skeleton className="h-96" /> : (
        <Card><CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10">No</TableHead>
              <TableHead>NIS</TableHead><TableHead>Nama</TableHead>
              <TableHead>Komentar Wali</TableHead><TableHead>Komentar Kepala Sekolah</TableHead>
              <TableHead className="w-20">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((row: any, i: number) => (
                <TableRow key={row.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="text-xs">{row.nis || "-"}</TableCell>
                  <TableCell className="font-medium text-sm">{row.nama}</TableCell>
                  <TableCell className="text-xs max-w-48 truncate">{row.komentar?.komentar_wali || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-xs max-w-48 truncate">{row.komentar?.komentar_kepala || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}><MessageSquare className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      ))}

      <Dialog open={!!editSiswa} onOpenChange={(o) => !o && setEditSiswa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Komentar untuk {editSiswa?.nama}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Komentar Wali Kelas</Label><Textarea rows={3} value={komentarWali} onChange={(e) => setKomentarWali(e.target.value)} placeholder="Ananda menunjukkan perkembangan yang baik..." /></div>
            <div><Label>Komentar Kepala Sekolah</Label><Textarea rows={3} value={komentarKepala} onChange={(e) => setKomentarKepala(e.target.value)} placeholder="Pertahankan prestasi..." /></div>
            <div><Label>Catatan Piket/Lainnya</Label><Textarea rows={2} value={catatanPiket} onChange={(e) => setCatatanPiket(e.target.value)} placeholder="Catatan tambahan..." /></div>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="w-full">{saveMut.isPending ? "Menyimpan..." : "Simpan Komentar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
