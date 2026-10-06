/**
 * Tema claro/escuro do painel (web).
 * Gera as variáveis CSS a partir de constants/designTokens.js e aplica a preferência salva
 * ("light" | "dark" | "system") no atributo `data-theme` do <html>.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { palette } = require("./designTokens") as { palette: Record<"light" | "dark", Record<string, string>> };

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "ds_theme";
const STYLE_ID = "ds-theme-vars";

const declarations = (theme: "light" | "dark") =>
  Object.entries(palette[theme])
    .map(([name, value]) => `--ds-${name}: ${value};`)
    .join(" ");

/** CSS: claro por padrão; escuro quando escolhido ou quando "sistema" e o SO está escuro. */
export function themeCss(): string {
  return [
    `:root { ${declarations("light")} color-scheme: light; }`,
    `:root[data-theme="dark"] { ${declarations("dark")} color-scheme: dark; }`,
    `@media (prefers-color-scheme: dark) { :root[data-theme="system"] { ${declarations("dark")} color-scheme: dark; } }`,
  ].join("\n");
}

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Sem armazenamento: o tema vale só para esta aba.
  }
}

/** Injeta as variáveis e aplica a preferência salva. Chamado antes de montar o app (evita piscar). */
export function installTheme(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = themeCss();
    document.head.appendChild(style);
  }
  document.documentElement.setAttribute("data-theme", readThemePreference());
}
