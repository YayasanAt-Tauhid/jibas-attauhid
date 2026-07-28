import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, UserPlus, X, Link as LinkIcon, Info, ShieldCheck } from "lucide-react";

export default function ManajemenOrtu() {
  const queryClient = useQueryClient();
  const [selectedOrtu, setSelectedOrtu] = useState<any>(null);
  const [searchSiswa, setSearchSiswa] = useState("");
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [emailJadikanOrtu, setEmailJadikanOrtu] = useState("");
  const [hasilPencarianAkun, setHasilPencarianAkun] = useState<
    { id: string; email: string; role: string } | null | "not_found"
  >(null);
  const [mencariAkun, setMencariAkun] = useState(false);

  // Tab 1: Fetch ortu users
  const { data: ortuList = [], isLoading: loadingOrtu } = useQuery({
    queryKey: ["admin-ortu-list"],
    queryFn: async () => {
      // Get ortu users
      const { data: profiles } = await supabase
        .from("users_profile")
        .select("id, email, aktif, role")
        .eq("role", "ortu");

      if (!profiles) return [];

      // Get child counts
      const userIds = profiles.map((p) => p.id);
      const { data: links } = await supabase
        .from("ortu_siswa")
        .select("user_id")
        .in("user_id", userIds);

      const countMap = new Map<string, number>();
      (links || []).forEach((l: any) => {
        countMap.set(l.user_id, (countMap.get(l.user_id) || 0) + 1);
      });

      return profiles.map((p) => ({
        ...p,
        jumlah_anak: countMap.get(p.id) || 0,
      }));
    },
  });

  // Fetch linked children for selected ortu
  const { data: linkedChildren = [] } = useQuery({
    queryKey: ["admin-ortu-children", selectedOrtu?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select(
          `
          id, hubungan,
          siswa:siswa_id (
            id, nama, nis,
            kelas_siswa (
              aktif,
              kelas:kelas_id (
                nama,
                departemen:departemen_id (nama)
              )
            )
          )
        `
        )
        .eq("user_id", selectedOrtu!.id);
      return data || [];
    },
    enabled: !!selectedOrtu,
  });

  // Search siswa for linking
  const { data: siswaResults = [] } = useQuery({
    queryKey: ["admin-search-siswa", searchSiswa],
    queryFn: async () => {
      if (searchSiswa.length < 2) return [];
      const { data } = await supabase
        .from("siswa")
        .select(
          `
          id, nama, nis,
          kelas_siswa (
            aktif,
            kelas:kelas_id (
              nama,
              departemen:departemen_id (nama)
            )
          )
        `
        )
        .or(`nama.ilike.%${searchSiswa}%,nis.ilike.%${searchSiswa}%`)
        .eq("status", "aktif")
        .limit(20);
      return data || [];
    },
    enabled: searchSiswa.length >= 2,
  });

  // Link siswa to ortu
  const linkMutation = useMutation({
    mutationFn: async (siswaId: string) => {
      const { error } = await supabase.from("ortu_siswa").insert({
        user_id: selectedOrtu!.id,
        siswa_id: siswaId,
        hubungan: "ortu",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Siswa berhasil dihubungkan");
      queryClient.invalidateQueries({ queryKey: ["admin-ortu-children"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ortu-list"] });
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.info("Siswa sudah terhubung");
      } else {
        toast.error(err.message);
      }
    },
  });

  // Unlink
  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("ortu_siswa")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hubungan dihapus");
      queryClient.invalidateQueries({ queryKey: ["admin-ortu-children"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ortu-list"] });
    },
  });

  const cariAkunUntukDijadikanOrtu = async () => {
    const email = emailJadikanOrtu.trim().toLowerCase();
    if (!email) return;
    setMencariAkun(true);
    setHasilPencarianAkun(null);
    const { data } = await supabase
      .from("users_profile")
      .select("id, email, role")
      .eq("email", email)
      .maybeSingle();
    setHasilPencarianAkun(data ? (data as any) : "not_found");
    setMencariAkun(false);
  };

  const jadikanOrtuMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("users_profile")
        .update({ role: "ortu" })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Akun berhasil dijadikan akun orang tua");
      setHasilPencarianAkun(null);
      setEmailJadikanOrtu("");
      queryClient.invalidateQueries({ queryKey: ["admin-ortu-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openManage = (ortu: any) => {
    setSelectedOrtu(ortu);
    setShowManageDialog(true);
    setSearchSiswa("");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Manajemen Orang Tua
        </h1>
        <p className="text-sm text-muted-foreground">
          Kelola akun orang tua dan hubungkan ke data siswa
        </p>
      </div>

      <Tabs defaultValue="akun">
        <TabsList>
          <TabsTrigger value="akun">Akun Orang Tua</TabsTrigger>
          <TabsTrigger value="hubungkan">Hubungkan Siswa</TabsTrigger>
        </TabsList>

        {/* Tab 1: Akun Orang Tua */}
        <TabsContent value="akun" className="space-y-4 mt-4">
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Untuk membuat akun orang tua, buka{" "}
                <a
                  href="https://supabase.com/dashboard/project/jywjiivyvohojveoecat/auth/users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline font-medium"
                >
                  Supabase Dashboard → Authentication → Users
                </a>
                , klik "Add user", masukkan email dan password. Setelah akun
                terbuat, cari akunnya di bawah untuk mengubah role menjadi 'ortu'.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Jadikan Akun Orang Tua
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Email akun yang sudah dibuat di Supabase..."
                  value={emailJadikanOrtu}
                  onChange={(e) => { setEmailJadikanOrtu(e.target.value); setHasilPencarianAkun(null); }}
                  onKeyDown={(e) => e.key === "Enter" && cariAkunUntukDijadikanOrtu()}
                />
                <Button variant="outline" onClick={cariAkunUntukDijadikanOrtu} disabled={mencariAkun}>
                  <Search className="h-4 w-4 mr-1" /> Cari
                </Button>
              </div>
              {hasilPencarianAkun === "not_found" && (
                <p className="text-sm text-muted-foreground">
                  Akun dengan email ini belum ada. Buat dulu lewat Supabase Dashboard.
                </p>
              )}
              {hasilPencarianAkun && hasilPencarianAkun !== "not_found" && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{hasilPencarianAkun.email}</p>
                    <p className="text-xs text-muted-foreground">Role saat ini: {hasilPencarianAkun.role}</p>
                  </div>
                  {hasilPencarianAkun.role === "ortu" ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Sudah Ortu</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => jadikanOrtuMutation.mutate(hasilPencarianAkun.id)}
                      disabled={jadikanOrtuMutation.isPending}
                    >
                      Jadikan Orang Tua
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Jumlah Anak</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOrtu ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Memuat...
                      </TableCell>
                    </TableRow>
                  ) : ortuList.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Belum ada akun orang tua
                      </TableCell>
                    </TableRow>
                  ) : (
                    ortuList.map((ortu: any) => (
                      <TableRow key={ortu.id}>
                        <TableCell className="font-medium">
                          {ortu.email}
                        </TableCell>
                        <TableCell>{ortu.jumlah_anak}</TableCell>
                        <TableCell>
                          <Badge
                            variant={ortu.aktif ? "default" : "secondary"}
                            className={
                              ortu.aktif
                                ? "bg-emerald-100 text-emerald-800"
                                : ""
                            }
                          >
                            {ortu.aktif ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openManage(ortu)}
                          >
                            <LinkIcon className="h-3.5 w-3.5 mr-1" />
                            Kelola Anak
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Hubungkan */}
        <TabsContent value="hubungkan" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Cari Orang Tua & Hubungkan Siswa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Pilih Orang Tua</label>
                <div className="grid gap-2 mt-2">
                  {ortuList.map((ortu: any) => (
                    <div
                      key={ortu.id}
                      className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 ${
                        selectedOrtu?.id === ortu.id
                          ? "border-emerald-500 bg-emerald-50"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedOrtu(ortu);
                        setSearchSiswa("");
                      }}
                    >
                      <span className="text-sm font-medium">{ortu.email}</span>
                      <Badge variant="outline">{ortu.jumlah_anak} anak</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrtu && (
                <>
                  {/* Linked children */}
                  <div>
                    <label className="text-sm font-medium">
                      Anak Terhubung
                    </label>
                    {linkedChildren.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        Belum ada anak yang terhubung
                      </p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {linkedChildren.map((link: any) => {
                          const siswa = link.siswa;
                          const ak = siswa?.kelas_siswa?.find(
                            (ks: any) => ks.aktif
                          );
                          return (
                            <div
                              key={link.id}
                              className="flex items-center justify-between rounded-lg border p-3"
                            >
                              <div>
                                <p className="font-medium text-sm">
                                  {siswa?.nama}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  NIS: {siswa?.nis || "-"} •{" "}
                                  {ak?.kelas?.departemen?.nama || "-"} —{" "}
                                  {ak?.kelas?.nama || "-"}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => unlinkMutation.mutate(link.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Search & add siswa */}
                  <div>
                    <label className="text-sm font-medium">
                      Tambah Anak Baru
                    </label>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cari siswa berdasarkan nama atau NIS..."
                        className="pl-9"
                        value={searchSiswa}
                        onChange={(e) => setSearchSiswa(e.target.value)}
                      />
                    </div>
                    {siswaResults.length > 0 && (
                      <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto">
                        {siswaResults.map((siswa: any) => {
                          const ak = siswa.kelas_siswa?.find(
                            (ks: any) => ks.aktif
                          );
                          const alreadyLinked = linkedChildren.some(
                            (lc: any) => lc.siswa?.id === siswa.id
                          );
                          return (
                            <div
                              key={siswa.id}
                              className="flex items-center justify-between p-3 border-b last:border-b-0"
                            >
                              <div>
                                <p className="text-sm font-medium">
                                  {siswa.nama}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  NIS: {siswa.nis || "-"} •{" "}
                                  {ak?.kelas?.departemen?.nama || "-"} —{" "}
                                  {ak?.kelas?.nama || "-"}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant={alreadyLinked ? "secondary" : "default"}
                                disabled={alreadyLinked}
                                onClick={() => linkMutation.mutate(siswa.id)}
                                className={
                                  !alreadyLinked
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : ""
                                }
                              >
                                {alreadyLinked ? "Terhubung" : "Tambahkan"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manage Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Kelola Anak — {selectedOrtu?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current children */}
            {linkedChildren.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada anak yang terhubung
              </p>
            ) : (
              linkedChildren.map((link: any) => {
                const siswa = link.siswa;
                const ak = siswa?.kelas_siswa?.find((ks: any) => ks.aktif);
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">{siswa?.nama}</p>
                      <p className="text-xs text-muted-foreground">
                        NIS: {siswa?.nis || "-"} •{" "}
                        {ak?.kelas?.departemen?.nama || "-"} —{" "}
                        {ak?.kelas?.nama || "-"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => unlinkMutation.mutate(link.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Hapus
                    </Button>
                  </div>
                );
              })
            )}

            {/* Quick add */}
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa..."
                  className="pl-9"
                  value={searchSiswa}
                  onChange={(e) => setSearchSiswa(e.target.value)}
                />
              </div>
              {siswaResults.length > 0 && (
                <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto">
                  {siswaResults.map((siswa: any) => {
                    const alreadyLinked = linkedChildren.some(
                      (lc: any) => lc.siswa?.id === siswa.id
                    );
                    return (
                      <div
                        key={siswa.id}
                        className="flex items-center justify-between p-2 border-b last:border-b-0"
                      >
                        <span className="text-sm">{siswa.nama}</span>
                        <Button
                          size="sm"
                          variant={alreadyLinked ? "secondary" : "default"}
                          disabled={alreadyLinked}
                          onClick={() => linkMutation.mutate(siswa.id)}
                        >
                          {alreadyLinked ? "✓" : "+"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
