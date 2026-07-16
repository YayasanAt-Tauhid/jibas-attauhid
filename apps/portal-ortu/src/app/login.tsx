import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";
import { Button, Card, TextField } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, signOut, user, role } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && role === "ortu") {
      router.replace("/(tabs)");
    }
  }, [user, role, router]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);

    const { error: signInError } = await signIn(data.email, data.password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
      return;
    }

    // Cek role — akun non-ortu tidak boleh masuk portal (sama seperti web).
    const {
      data: { user: signedInUser },
    } = await supabase.auth.getUser();
    if (!signedInUser) {
      setError("Gagal mendapatkan data user");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("id", signedInUser.id)
      .single();

    if (profile?.role !== "ortu") {
      await signOut();
      setError("Akun ini bukan akun orang tua. Gunakan aplikasi/halaman admin.");
      setLoading(false);
      return;
    }

    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: theme.primary }]}>
            <Text style={[styles.logoText, { color: theme.onPrimary }]}>H</Text>
          </View>
          <Text style={[styles.appTitle, { color: theme.text }]}>Portal Orang Tua</Text>
          <Text style={[styles.appSubtitle, { color: theme.textSecondary }]}>
            Hijrah At-Tauhid — Sistem Manajemen Sekolah Islam
          </Text>
        </View>

        <Card style={{ gap: 14 }}>
          <View>
            <Text style={[styles.formTitle, { color: theme.text }]}>Masuk ke Portal</Text>
            <Text style={[styles.formSubtitle, { color: theme.textSecondary }]}>
              Gunakan akun orang tua yang terdaftar
            </Text>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: theme.dangerSoft }]}>
              <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label="Email"
                placeholder="email@contoh.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label="Password"
                placeholder="Masukkan password"
                secureTextEntry
                autoCapitalize="none"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          <Button
            title="Masuk"
            icon="log-in-outline"
            loading={loading}
            onPress={form.handleSubmit(onSubmit)}
          />
        </Card>

        <Text style={[styles.footer, { color: theme.textSecondary }]}>
          Pendaftaran siswa baru dan login admin tersedia di portal web sekolah.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    gap: 24,
  },
  header: {
    alignItems: "center",
    gap: 4,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoText: {
    fontSize: 28,
    fontWeight: "700",
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  appSubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  formSubtitle: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  errorBox: {
    borderRadius: 8,
    padding: 12,
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
  },
});
