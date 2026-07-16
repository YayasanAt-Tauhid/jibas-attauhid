import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth";
import { useTheme } from "@/constants/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data portal jarang berubah dalam satu sesi; kurangi refetch agresif
      // di jaringan seluler.
      staleTime: 60_000,
      retry: 1,
    },
  },
});

// Saat notifikasi di-tap, arahkan ke layar yang disebut di data.url
// (mis. "/riwayat" dari push pembayaran berhasil). Mencakup app yang
// sedang berjalan maupun cold start (useLastNotificationResponse).
function usePushNavigasi() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  // Cold start: tunggu navigator siap sebelum push, kalau tidak expo-router
  // melempar "attempted to navigate before mounting the Root Layout".
  const navSiap = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!navSiap) return;
    const bukaUrl = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as never);
      }
    };
    bukaUrl(lastResponse ?? null);
    const sub = Notifications.addNotificationResponseReceivedListener(bukaUrl);
    return () => sub.remove();
  }, [navSiap, lastResponse, router]);
}

export default function RootLayout() {
  const theme = useTheme();
  usePushNavigasi();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.card },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="riwayat" options={{ title: "Riwayat Pembayaran" }} />
          <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
