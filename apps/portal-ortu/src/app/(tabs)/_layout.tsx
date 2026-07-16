import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { daftarkanPushToken } from "@/lib/push";

export default function TabsLayout() {
  const theme = useTheme();
  const { user, role, isLoading } = useAuth();

  // Daftarkan token push setelah login/restore sesi ortu — layout ini hanya
  // ter-mount saat guard di bawah lolos, jadi cukup dipicu dari sini.
  const sudahLogin = !!user && role === "ortu";
  useEffect(() => {
    if (sudahLogin) daftarkanPushToken();
  }, [sudahLogin]);

  if (isLoading) {
    return <Spinner />;
  }
  if (!user || role !== "ortu") {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Beranda",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tagihan"
        options={{
          title: "Tagihan",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="presensi"
        options={{
          title: "Presensi",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nilai"
        options={{
          title: "Nilai",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
