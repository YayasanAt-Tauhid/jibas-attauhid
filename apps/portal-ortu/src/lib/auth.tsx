import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Portal ortu hanya mengenal satu role, tapi tipenya disamakan dengan
// users_profile.role di database agar hasil query tidak perlu di-cast.
export type UserRole =
  | "admin"
  | "kepala_sekolah"
  | "guru"
  | "keuangan"
  | "siswa"
  | "pustakawan"
  | "kasir"
  | "ortu";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  // true selama sesi tersimpan + role masih dimuat — guard rute menunggu
  // ini false sebelum memutuskan redirect, agar restore sesi tidak
  // terlempar ke halaman login.
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchRole(userId: string): Promise<UserRole | null> {
  const { data } = await supabase
    .from("users_profile")
    .select("role")
    .eq("id", userId)
    .single();
  return (data?.role as UserRole) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = async (session: Session | null) => {
      const nextRole = session?.user ? await fetchRole(session.user.id) : null;
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setRole(nextRole);
      setIsLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const messages: Record<string, string> = {
        "Invalid login credentials": "Email atau password salah",
        "Email not confirmed": "Email belum dikonfirmasi. Periksa inbox Anda.",
      };
      return { error: messages[error.message] || error.message };
    }
    // Set state langsung dari respons sign-in tanpa menunggu event
    // onAuthStateChange, supaya pemanggil bisa langsung navigasi tanpa
    // balapan dengan guard rute yang masih melihat `user === null`.
    setSession(data.session);
    setUser(data.user);
    setRole(data.user ? await fetchRole(data.user.id) : null);
    setIsLoading(false);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
