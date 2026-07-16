import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, Text, View } from "react-native";
import { z } from "zod";
import { Button, Card, Screen, SectionTitle, TextField, Title } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const passwordSchema = z
  .object({
    password_lama: z.string().min(1, "Password lama wajib diisi"),
    password_baru: z.string().min(8, "Password minimal 8 karakter"),
    konfirmasi: z.string(),
  })
  .refine((data) => data.password_baru === data.konfirmasi, {
    message: "Konfirmasi password tidak cocok",
    path: ["konfirmasi"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["portal-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("users_profile")
        .select("*")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: anakList = [] } = useQuery({
    queryKey: ["portal-anak-profil", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select(
          `
          hubungan,
          siswa:siswa_id (
            nama, nis,
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
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password_lama: "", password_baru: "", konfirmasi: "" },
  });

  const onChangePassword = async (data: PasswordForm) => {
    setChangingPassword(true);
    try {
      // Verifikasi password lama dengan sign-in ulang (pola sama dengan web).
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: data.password_lama,
      });
      if (signInError) {
        Alert.alert("Gagal", "Password lama salah");
        setChangingPassword(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password_baru,
      });
      if (updateError) {
        Alert.alert("Gagal", "Gagal ganti password: " + updateError.message);
        setChangingPassword(false);
        return;
      }

      Alert.alert("Berhasil", "Password berhasil diubah. Silakan login ulang.");
      await signOut();
      router.replace("/login");
    } catch (err: any) {
      Alert.alert("Gagal", err.message);
      setChangingPassword(false);
    }
  };

  const onLogout = () => {
    Alert.alert("Keluar", "Yakin ingin keluar dari portal?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <Screen>
      <Title>Profil Saya</Title>

      <Card style={{ gap: 12 }}>
        <SectionTitle>Informasi Akun</SectionTitle>
        <View>
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}>
            Email
          </Text>
          <Text style={{ color: theme.text, fontSize: 14, marginTop: 2 }}>
            {(profile as any)?.email || user?.email}
          </Text>
        </View>
        <View>
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}>
            Role
          </Text>
          <Text style={{ color: theme.text, fontSize: 14, marginTop: 2, textTransform: "capitalize" }}>
            {(profile as any)?.role || "-"}
          </Text>
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionTitle>Anak yang Terhubung</SectionTitle>
        {anakList.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            Belum ada anak yang terhubung
          </Text>
        ) : (
          (anakList as any[]).map((item, idx) => {
            const siswa = item.siswa;
            const ak = siswa?.kelas_siswa?.find((ks: any) => ks.aktif);
            return (
              <View
                key={idx}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>
                    {siswa?.nama}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                    NIS: {siswa?.nis || "-"} • {ak?.kelas?.departemen?.nama || "-"} —{" "}
                    {ak?.kelas?.nama || "-"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    textTransform: "capitalize",
                  }}
                >
                  {item.hubungan}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <SectionTitle>Ganti Password</SectionTitle>
        <Controller
          control={passwordForm.control}
          name="password_lama"
          render={({ field, fieldState }) => (
            <TextField
              label="Password Lama"
              placeholder="Masukkan password lama"
              secureTextEntry
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={passwordForm.control}
          name="password_baru"
          render={({ field, fieldState }) => (
            <TextField
              label="Password Baru"
              placeholder="Minimal 8 karakter"
              secureTextEntry
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={passwordForm.control}
          name="konfirmasi"
          render={({ field, fieldState }) => (
            <TextField
              label="Konfirmasi Password Baru"
              placeholder="Ketik ulang password baru"
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
          title={changingPassword ? "Menyimpan..." : "Ganti Password"}
          icon="save-outline"
          loading={changingPassword}
          onPress={passwordForm.handleSubmit(onChangePassword)}
        />
      </Card>

      <Button title="Keluar" icon="log-out-outline" variant="danger" onPress={onLogout} />
    </Screen>
  );
}
