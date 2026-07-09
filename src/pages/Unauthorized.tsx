import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";

export default function Unauthorized() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
      <ShieldX className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-bold text-foreground">Akses Ditolak</h1>
      <p className="text-muted-foreground text-sm">Anda tidak memiliki izin untuk mengakses halaman ini.</p>
      <Button onClick={() => navigate("/")}>Kembali ke Dashboard</Button>
    </div>
  );
}
