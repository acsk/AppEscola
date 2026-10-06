/**
 * Tokens do design system para estilos inline (style={...}). Para classes, use os nomes no Tailwind.
 * Cada cor é uma variável CSS (`var(--ds-ink)`) que acompanha o tema claro/escuro.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tokens = require("./designTokens") as {
  color: Record<
    | "bg"
    | "surface"
    | "surface-sunken"
    | "border"
    | "border-strong"
    | "ink"
    | "ink-muted"
    | "ink-subtle"
    | "brand"
    | "brand-hover"
    | "on-brand"
    | "brand-tint"
    | "accent"
    | "accent-tint"
    | "success"
    | "success-tint"
    | "warning"
    | "warning-tint"
    | "danger"
    | "danger-tint"
    | "on-danger"
    | "danger-hover"
    | "focus"
    | "nav-bg"
    | "nav-hover"
    | "nav-active"
    | "nav-divider"
    | "nav-accent"
    | "nav-ink"
    | "nav-ink-muted"
    | "nav-label"
    | "overlay",
    string
  >;
  radius: Record<"0" | "sm" | "md" | "lg", string>;
  space: Record<1 | 2 | 3 | 4 | 5 | 6 | 8, number>;
  size: Record<"control-sm" | "control-md" | "sidebar-width" | "topbar-height" | "content-max", number>;
  font: Record<"sans" | "mono", string>;
  shadow: Record<"overlay", string>;
};

export const color = tokens.color;
export const space = tokens.space;
export const size = tokens.size;
export const font = tokens.font;
export const shadow = tokens.shadow;
export const radius = { 0: 0, sm: 2, md: 4, lg: 6 } as const;

/** Tons de status (badge, aviso): texto + fundo. */
export const tone = {
  neutral: { fg: tokens.color["ink-muted"], bg: tokens.color["surface-sunken"], border: tokens.color.border },
  brand: { fg: tokens.color.brand, bg: tokens.color["brand-tint"], border: "transparent" },
  success: { fg: tokens.color.success, bg: tokens.color["success-tint"], border: "transparent" },
  warning: { fg: tokens.color.warning, bg: tokens.color["warning-tint"], border: "transparent" },
  danger: { fg: tokens.color.danger, bg: tokens.color["danger-tint"], border: "transparent" },
} as const;

export type Tone = keyof typeof tone;
