import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import Icon from "./Icon";
import { color, size as dsSize } from "../../constants/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  /** Rótulo em caixa de frase: "Salvar alterações", "Nova turma". */
  label?: string;
  onPress?: () => void;
  /** Um `primary` por área (painel ou página); `danger` é contornado, nunca cheio. */
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  /** Só ícone: exige `accessibilityLabel`. */
  iconOnly?: boolean;
  accessibilityLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: color.brand, fg: color["on-brand"], border: color.brand },
  secondary: { bg: color.surface, fg: color.ink, border: color["border-strong"] },
  ghost: { bg: "transparent", fg: color["ink-muted"], border: "transparent" },
  danger: { bg: color.surface, fg: color.danger, border: color.danger },
};

/** Botão do design system: retangular (raio 4px); só o primário tem cor cheia. */
export default function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  accessibilityLabel,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const v = VARIANTS[variant];
  const height = size === "sm" ? dsSize["control-sm"] : dsSize["control-md"];
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      role="button"
      aria-label={accessibilityLabel ?? (iconOnly ? label : undefined)}
      aria-disabled={inactive}
      aria-busy={loading}
      activeOpacity={0.8}
      className="rounded-ds-md"
      style={[
        {
          height,
          width: iconOnly ? height : undefined,
          paddingHorizontal: iconOnly ? 0 : size === "sm" ? 12 : 16,
          backgroundColor: v.bg,
          borderWidth: 1,
          borderColor: v.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: inactive ? 0.45 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : icon ? (
        <Icon icon={icon} color={v.fg} />
      ) : null}
      {!iconOnly && !!label && (
        <Text className="font-medium" style={{ color: v.fg, fontSize: size === "sm" ? 13 : 14 }} numberOfLines={1}>
          {label}
        </Text>
      )}
      {iconOnly && !icon && <View />}
    </TouchableOpacity>
  );
}
