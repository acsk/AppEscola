import React from "react";
import { View, Text } from "react-native";

type Variant = "success" | "warning" | "error" | "info" | "default";

const VARIANTS: Record<Variant, { bg: string; text: string }> = {
  success: { bg: "#ECFDF5", text: "#065F46" },
  warning: { bg: "#FFFBEB", text: "#92400E" },
  error: { bg: "#FEF2F2", text: "#991B1B" },
  info: { bg: "#EFF6FF", text: "#1E40AF" },
  default: { bg: "#F3F4F6", text: "#374151" },
};

const SLUG_MAP: Record<string, Variant> = {
  active: "success",
  inactive: "default",
  paid: "success",
  pending: "warning",
  overdue: "error",
  cancelled: "error",
  concluded: "info",
  published: "success",
  draft: "default",
  archived: "info",
  in_progress: "warning",
  completed: "success",
};

type Props = {
  label: string;
  slug?: string;
  variant?: Variant;
};

export default function Badge({ label, slug, variant }: Props) {
  const v = variant ?? (slug ? (SLUG_MAP[slug] ?? "default") : "default");
  const style = VARIANTS[v];

  return (
    <View
      style={{
        backgroundColor: style.bg,
        borderRadius: 100,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: style.text, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}
