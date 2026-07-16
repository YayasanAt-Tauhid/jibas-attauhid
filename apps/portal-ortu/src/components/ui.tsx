import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "@/constants/theme";

// Kit UI kecil pengganti shadcn/ui di React Native — cukup untuk
// kebutuhan portal ortu, tanpa dependensi styling tambahan.

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.screenContent}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const cardStyle = [
    styles.card,
    { backgroundColor: theme.card, borderColor: theme.border },
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.title, { color: theme.text }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{children}</Text>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>
  );
}

export type BadgeTone = "primary" | "danger" | "amber" | "blue" | "neutral";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();
  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    primary: { bg: theme.primarySoft, fg: theme.primary },
    danger: { bg: theme.dangerSoft, fg: theme.danger },
    amber: { bg: theme.amberSoft, fg: theme.amber },
    blue: { bg: theme.blueSoft, fg: theme.blue },
    neutral: { bg: theme.border, fg: theme.textSecondary },
  };
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const background =
    variant === "primary" ? theme.primary : variant === "danger" ? theme.danger : "transparent";
  const foreground = variant === "outline" ? theme.text : theme.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === "outline" ? theme.border : background,
        },
        isDisabled && { opacity: 0.55 },
        pressed && !isDisabled && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={17} color={foreground} />}
          <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(!!props.secureTextEntry);
  const secure = !!props.secureTextEntry;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <View>
        <TextInput
          {...props}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: error ? theme.danger : theme.border,
              color: theme.text,
              paddingRight: secure ? 44 : 12,
            },
          ]}
        />
        {secure && (
          <Pressable style={styles.eyeButton} onPress={() => setHidden((h) => !h)}>
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        )}
      </View>
      {error && <Text style={[styles.fieldError, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

export function Spinner() {
  const theme = useTheme();
  return (
    <View style={styles.spinner}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Card>
      <Text style={[styles.empty, { color: theme.textSecondary }]}>{message}</Text>
    </Card>
  );
}

// Chip pilihan anak — pengganti dropdown Select di web.
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.primary : theme.card,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.onPrimary : theme.text,
                fontSize: 13,
                fontWeight: active ? "600" : "400",
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 46,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldError: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  spinner: {
    paddingVertical: 48,
    alignItems: "center",
  },
  empty: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
});
