import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
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

export default function RootLayout() {
  const theme = useTheme();
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
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
