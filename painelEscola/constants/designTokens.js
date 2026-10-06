/**
 * Tokens do design system "Cursinho Hub".
 * Fonte única: tailwind.config.js (classes), constants/theme.ts (estilos inline) e constants/themeCss.ts (variáveis CSS).
 *
 * As cores são variáveis CSS (`var(--ds-<nome>)`) com um valor por tema; trocar o tema só troca
 * o atributo `data-theme` do <html>. `palette` guarda os valores reais de cada tema.
 */

/** Valores por tema. A sidebar (`nav-*`) é invertida, em azul-tinta escuro nos dois temas. */
const palette = {
  light: {
    bg: "#f3f4f6", // fundo da página, por trás dos painéis
    surface: "#ffffff", // painéis, topbar, campos, tabelas
    "surface-sunken": "#f7f8fa", // cabeçalho de tabela, hover de linha, campo desabilitado
    border: "#d9dde3", // divisores e contornos de painéis (decorativo)
    "border-strong": "#7a8393", // borda de controles (≥3:1)
    ink: "#111722", // texto principal
    "ink-muted": "#4b5463", // texto secundário
    "ink-subtle": "#5f6878", // metadados, placeholders (AA)
    brand: "#1c3d63", // cor institucional: primário, aba ativa, link, foco
    "brand-hover": "#132c4a",
    "on-brand": "#ffffff",
    "brand-tint": "#e9eff6", // linha selecionada, badges de marca
    accent: "#b5761a", // ocre: só marcas de 2–3px, nunca texto nem área
    "accent-tint": "#faf2e3", // fundo de aviso informativo pontual
    focus: "#1c3d63",
    "nav-bg": "#13284a",
    "nav-hover": "#1c3660",
    "nav-active": "#2a4a7c",
    "nav-divider": "#2c4670",
    "nav-accent": "#e2a94c",
    "nav-ink": "#ffffff",
    "nav-ink-muted": "#c4d0e2",
    "nav-label": "#93a8c8",
    success: "#1c6a45",
    "success-tint": "#e5f1ea",
    warning: "#8a5200",
    "warning-tint": "#fbefdc",
    danger: "#b0261b",
    "danger-tint": "#fbe9e7",
    "on-danger": "#ffffff", // texto/ícone sobre fundo danger (botões de excluir)
    "danger-hover": "#8f1e15",
    overlay: "rgba(17,23,34,0.45)", // véu atrás de modais
    "shadow-overlay": "0 8px 24px rgba(17,23,34,0.14), 0 1px 2px rgba(17,23,34,0.08)",
  },
  dark: {
    bg: "#0e1116",
    surface: "#161a21",
    "surface-sunken": "#1b2029",
    border: "#2b313c",
    "border-strong": "#636c7d",
    ink: "#e7e9ee",
    "ink-muted": "#a8afbc",
    "ink-subtle": "#8f97a6",
    brand: "#8db4e8",
    "brand-hover": "#a9c7ef",
    "on-brand": "#0e1116",
    "brand-tint": "#1a2a3f",
    accent: "#e2a94c",
    "accent-tint": "#2e2412",
    focus: "#8db4e8",
    "nav-bg": "#0b1526",
    "nav-hover": "#142440",
    "nav-active": "#1f3961",
    "nav-divider": "#22344f",
    "nav-accent": "#e2a94c",
    "nav-ink": "#f1f4f9",
    "nav-ink-muted": "#b4c1d6",
    "nav-label": "#8a9dba",
    success: "#62c08f",
    "success-tint": "#13281d",
    warning: "#e6a650",
    "warning-tint": "#2c2010",
    danger: "#f0857a",
    "danger-tint": "#2e1614",
    "on-danger": "#1a0b09",
    "danger-hover": "#f5a198",
    overlay: "rgba(0,0,0,0.6)",
    "shadow-overlay": "0 8px 24px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
  },
};

const cssVar = (name) => `var(--ds-${name})`;

/** Cores para uso em classes e estilos: cada uma é a variável CSS do token. */
const color = Object.fromEntries(
  Object.keys(palette.light)
    .filter((name) => name !== "shadow-overlay")
    .map((name) => [name, cssVar(name)])
);

const radius = { 0: "0px", sm: "2px", md: "4px", lg: "6px" };

const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 8: 48 };

const size = {
  "control-sm": 32,
  "control-md": 38,
  "sidebar-width": 240,
  "topbar-height": 56,
  "content-max": 1120,
};

const font = {
  sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
};

const shadow = { overlay: cssVar("shadow-overlay") };

module.exports = { palette, color, cssVar, radius, space, size, font, shadow };
