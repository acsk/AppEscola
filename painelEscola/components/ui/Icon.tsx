import React from "react";
import type { LucideIcon } from "lucide-react-native";
import { color as dsColor } from "../../constants/theme";

type Props = {
  icon: LucideIcon;
  /** 16 em controles e navegação; 20 em destaque. */
  size?: 16 | 20 | 24;
  color?: string;
  /** Ícone com significado próprio (sem texto ao lado) precisa de rótulo. */
  label?: string;
};

/** Ícone de linha do design system: traço 1,5px, pontas e cantos retos. */
export default function Icon({ icon: Glyph, size = 16, color = dsColor["ink-muted"], label }: Props) {
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
