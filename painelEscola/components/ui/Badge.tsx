import React from "react";
import { View, Text } from "react-native";
import { tone as tones, type Tone } from "../../constants/theme";

type Variant = "success" | "warning" | "error" | "info" | "default" | "secondary";

/** Variantes antigas → tons do design system. */
const VARIANT_TONE: Record<Variant, Tone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  info: "brand",
  default: "neutral",
  secondary: "neutral",
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
  /** Tom direto do design system (tem prioridade sobre `variant`/`slug`). */
  tone?: Tone;
  /** Ponto quadrado que reforça o tom (a palavra continua sendo a pista principal). */
  dot?: boolean;
};

/** Etiqueta de status: 22px, raio 2px, sempre com palavra. Tons semânticos só para estado. */
export default function Badge({ label, slug, variant, tone, dot = false }: Props) {
  const v = variant ?? (slug ? (SLUG_MAP[slug] ?? "default") : "default");
  const t = tones[tone ?? VARIANT_TONE[v]];

  return (
    <View
      className="rounded-ds-sm"
      style={{
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.border,
        height: 22,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
      }}
    >
      {dot && <View style={{ width: 6, height: 6, backgroundColor: t.fg }} />}
      <Text style={{ color: t.fg, fontSize: 12, lineHeight: 16 }} className="font-medium" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
