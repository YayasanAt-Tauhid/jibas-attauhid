import { useEffect, useState } from "react";
import { useNavigate, Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

type Status = "memeriksa" | "sukses" | "gagal";

// Jendela waktu sejak akun auth dibuat yang masih dianggap "baru saja
// dibuat lewat sign-in Google ini" -- akun staff selalu dibuat admin lebih
// dulu lewat Manajemen Pengguna, jadi kalau akun auth ternyata baru saja
// muncul di jendela ini berarti tidak ada akun staff yang cocok dengan
// email Google tsb. dan tidak boleh otomatis dapat akses.
const JENDELA_AKUN_BARU_MS = 10 * 60 * 1000;

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const [status, setStatus] = useState<Status>("memeriksa");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setStatus("gagal");
      setError("Gagal masuk dengan Google. Silakan coba lagi.");
      return;
    }

    (async () => {
      const { data: profile } = await supabase
        .from("users_profile")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "ortu") {
        await signOut();
        setStatus("gagal");
        setError("Akun Google ini adalah akun orang tua. Gunakan Portal Orang Tua untuk masuk.");
        return;
      }

      const { data: authUser } = await supabase.auth.getUser();
      const createdAt = authUser?.user?.created_at ? new Date(authUser.user.created_at).getTime() : 0;
      const akunBaruDibuat = !createdAt || Date.now() - createdAt <= JENDELA_AKUN_BARU_MS;

      if (!profile?.role || akunBaruDibuat) {
        await signOut();
        setStatus("gagal");
        setError(
          "Akun Google ini belum terdaftar sebagai staff. Hubungi admin sekolah untuk didaftarkan lebih dulu."
        );
        return;
      }

      setStatus("sukses");
      navigate("/", { replace: true });
    })();
  }, [user, isLoading, navigate, signOut]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <h1 className="text-lg font-semibold text-foreground">Masuk dengan Google</h1>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "memeriksa" && (
              <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Memeriksa akun Anda...
              </div>
            )}

            {status === "gagal" && (
              <div className="space-y-4">
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                <Link to="/login">
                  <Button variant="outline" className="w-full">Kembali ke Login</Button>
                </Link>
              </div>
            )}

            {status === "sukses" && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <p className="text-sm text-muted-foreground">Berhasil masuk. Mengarahkan...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
