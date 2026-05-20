import { useState, useEffect } from "react";
import { Bell, User, LogOut, CheckCheck, FileText, CreditCard, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { useNotifikasi, NotifikasiItem } from "@/hooks/useNotifikasi";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  kepala_sekolah: "Kepala Sekolah",
  guru: "Guru",
  keuangan: "Staff Keuangan",
  siswa: "Siswa",
  pustakawan: "Pustakawan",
  kasir: "Kasir",
};

const tipeIcon: Record<NotifikasiItem["tipe"], React.ReactNode> = {
  jurnal_draft: <FileText className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />,
  tagihan_belum_lunas: <CreditCard className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />,
  pengumuman: <Megaphone className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />,
};

export function TopNavbar() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [namaSekolah, setNamaSekolah] = useState("");
  const { items, loading, unreadCount, tandaiBaca, tandaiBacaSemua } = useNotifikasi();

  useEffect(() => {
    supabase.from("sekolah").select("nama").maybeSingle().then(({ data }) => {
      if (data?.nama) setNamaSekolah(data.nama);
    });
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleClickItem = (item: NotifikasiItem) => {
    tandaiBaca(item.id);
    if (item.url) navigate(item.url);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />

      <div className="flex-1 flex flex-col justify-center min-w-0">
        <AppBreadcrumb />
        <p className="text-[11px] text-muted-foreground leading-tight truncate">
          {namaSekolah || "Sistem Manajemen Sekolah"} · Tahun Ajaran 2025/2026
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Bell Notifikasi */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground pointer-events-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Notifikasi</span>
              {unreadCount > 0 && (
                <button
                  onClick={tandaiBacaSemua}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  Tandai semua dibaca
                </button>
              )}
            </div>

            {/* List */}
            <ScrollArea className="max-h-[360px]">
              {loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Memuat…</div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Tidak ada notifikasi
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleClickItem(item)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex gap-2.5 border-b last:border-0",
                      "hover:bg-muted/60 transition-colors",
                      !item.dibaca && "bg-primary/5"
                    )}
                  >
                    {tipeIcon[item.tipe]}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs leading-snug truncate", !item.dibaca && "font-semibold")}>
                        {item.judul}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
                        {item.pesan}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: localeId })}
                      </p>
                    </div>
                    {!item.dibaca && (
                      <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                    )}
                  </button>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 border-b mb-1">
              <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">{role ? roleLabels[role] : "—"}</p>
            </div>
            <DropdownMenuItem>Profil Saya</DropdownMenuItem>
            <DropdownMenuItem>Ubah Password</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
