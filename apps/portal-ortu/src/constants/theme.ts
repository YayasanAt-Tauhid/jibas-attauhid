import { useColorScheme } from "react-native";

// Palet mengikuti tema hijau (emerald) aplikasi web Keuangan At-Tauhid.
export const Colors = {
  light: {
    text: "#0f172a",
    textSecondary: "#64748b",
    background: "#f8fafc",
    card: "#ffffff",
    border: "#e2e8f0",
    primary: "#059669",
    primarySoft: "#d1fae5",
    onPrimary: "#ffffff",
    danger: "#dc2626",
    dangerSoft: "#fee2e2",
    amber: "#b45309",
    amberSoft: "#fef3c7",
    blue: "#1d4ed8",
    blueSoft: "#dbeafe",
  },
  dark: {
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    background: "#0b1120",
    card: "#151e31",
    border: "#28344d",
    primary: "#34d399",
    primarySoft: "#064e3b",
    onPrimary: "#052e21",
    danger: "#f87171",
    dangerSoft: "#450a0a",
    amber: "#fbbf24",
    amberSoft: "#451a03",
    blue: "#60a5fa",
    blueSoft: "#172554",
  },
} as const;

export type Theme = { [K in keyof (typeof Colors)["light"]]: string };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? Colors.dark : Colors.light;
}
