/**
 * Tokens do design system "Cursinho Hub" (tema claro).
 * Fonte única: usado pelo tailwind.config.js (classes) e por constants/theme.ts (estilos inline).
 * O tema escuro entra depois trocando estes valores por variáveis CSS, sem mudar os nomes.
 */

const color = {
  bg: "#f3f4f6", // fundo da página, por trás dos painéis
  surface: "#ffffff", // painéis, sidebar, topbar, campos, tabelas
  "surface-sunken": "#f7f8fa", // cabeçalho de tabela, hover de linha, campo desabilitado
  border: "#d9dde3", // divisores e contornos de painéis (decorativo)
  "border-strong": "#7a8393", // borda de controles (≥3:1)
  ink: "#111722", // texto principal
  "ink-muted": "#4b5463", // texto secundário, labels de navegação
  "ink-subtle": "#5f6878", // metadados, placeholders (AA)
  brand: "#1c3d63", // cor institucional: primário, aba ativa, link, foco
  "brand-hover": "#132c4a",
  "on-brand": "#ffffff",
  "brand-tint": "#e9eff6", // item de navegação ativo, linha selecionada
  accent: "#b5761a", // ocre: só marcas de 2–3px, nunca texto nem área
  "accent-tint": "#faf2e3", // fundo de aviso informativo pontual
  success: "#1c6a45",
  "success-tint": "#e5f1ea",
  warning: "#8a5200",
  "warning-tint": "#fbefdc",
  danger: "#b0261b",
  "danger-tint": "#fbe9e7",
};
color.focus = color.brand;

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

const shadow = {
  overlay: "0 8px 24px rgba(17,23,34,0.14), 0 1px 2px rgba(17,23,34,0.08)",
};

module.exports = { color, radius, space, size, font, shadow };
