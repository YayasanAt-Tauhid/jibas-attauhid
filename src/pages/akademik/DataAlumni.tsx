import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { useAngkatan } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Users } from "lucide-react";

export default function DataAlumni() {
  const [angkatanId, setAngkatanId] = useState("");
  const { data: angkatanList } = useAngkatan();

  const { data: alumniData, isLoading } = useQuery({
    queryKey: ["alumni", angkatanId],
    queryFn: async () => {
      let q = supabase.from("siswa")
        .select("id, nis, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, angkatan:angkatan_id(nama), status, telepon, email, alamat")
        .eq("status", "lulus")
        .order("nama");
      if (angkatanId) q = q.eq("angkatan_id", angkatanId);
      const { data } = await q;
      return (data || []).map((s: any) => ({ ...s, angkatan_nama: s.angkatan?.nama || "-" }));
    },
  });

  const columns: DataTableColumn<any>[] = [
    { key: "nis", label: "NIS", sortable: true },
    { key: "nama", label: "Nama", sortable: true },
    { key: "jenis_kelamin", label: "L/P", render: (v) => v === "L" ? "L" : v === "P" ? "P" : "-" },
    { key: "angkatan_nama", label: "Angkatan", sortable: true },
    { key: "tempat_lahir", label: "Tempat Lahir" },
    { key: "telepon", label: "Telepon", render: (v) => String(v || "-") },
    { key: "email", label: "Email", render: (v) => String(v || "-") },
  ];

  const totalAlumni = alumniData?.length || 0;
  const alumniL = alumniData?.filter((a: any) => a.jenis_kelamin === "L").length || 0;
  const alumniP = alumniData?.filter((a: any) => a.jenis_kelamin === "P").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Alumni</h1>
        <p className="text-sm text-muted-foreground">Data siswa yang telah lulus</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard title="Total Alumni" value={totalAlumni} icon={GraduationCap} color="primary" />
        <StatsCard title="Laki-laki" value={alumniL} icon={Users} color="info" />
        <StatsCard title="Perempuan" value={alumniP} icon={Users} color="success" />
      </div>

      <div className="flex gap-3">
        <div><Label>Angkatan</Label><Select value={angkatanId} onValueChange={(v) => setAngkatanId(v === "__all__" ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="Semua" /></SelectTrigger><SelectContent><SelectItem value="__all__">Semua</SelectItem>{angkatanList?.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nama}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <DataTable columns={columns} data={alumniData || []} loading={isLoading} searchable exportable exportFilename="data-alumni" searchPlaceholder="Cari alumni..." />
    </div>
  );
}
