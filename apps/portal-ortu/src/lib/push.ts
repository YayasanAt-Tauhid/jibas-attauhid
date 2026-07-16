// Push notification (fase 2) — registrasi Expo push token ke Supabase.
//
// Token disimpan di tabel `perangkat_push_ortu` lewat RPC `daftarkan_push_token`
// (SECURITY DEFINER, atomik saat token berpindah akun). Server mengirim pesan
// via Expo Push API — lihat src/server/push.ts di root repo.
//
// Catatan penting:
// - Butuh EAS projectId (jalankan `eas init` sekali; nilainya masuk ke
//   app.json → extra.eas.projectId). Tanpa itu registrasi dilewati diam-diam.
// - Expo Go SDK 53+ tidak mendukung remote push — uji dengan development
//   build / APK EAS, bukan Expo Go.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Tampilkan notifikasi juga saat app sedang di foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  );
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // emulator/simulator tidak dapat token
  const projectId = getProjectId();
  if (!projectId) {
    console.warn("Push dilewati: EAS projectId belum diset (jalankan `eas init`).");
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/** Dipanggil setelah login/restore sesi ortu. Best-effort — tidak melempar. */
export async function daftarkanPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notifikasi Portal",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = await getExpoPushToken();
    if (!token) return;

    const { error } = await supabase.rpc("daftarkan_push_token", {
      p_token: token,
      p_platform: Platform.OS,
      p_device_name: Device.modelName ?? undefined,
    });
    if (error) console.warn("Gagal mendaftarkan push token:", error.message);
  } catch (err) {
    console.warn("Gagal mendaftarkan push token:", err);
  }
}

/** Dipanggil sebelum logout agar akun lama berhenti menerima notifikasi. */
export async function hapusPushToken(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const token = await getExpoPushToken();
    if (!token) return;
    await supabase.from("perangkat_push_ortu").delete().eq("expo_push_token", token);
  } catch {
    // best-effort
  }
}
