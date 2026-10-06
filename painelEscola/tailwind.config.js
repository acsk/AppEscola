const ds = require("./constants/designTokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Design system "Cursinho Hub" — ver constants/designTokens.js e painel-escola.md.
      colors: {
        bg: ds.color.bg,
        surface: { DEFAULT: ds.color.surface, sunken: ds.color["surface-sunken"] },
        border: { DEFAULT: ds.color.border, strong: ds.color["border-strong"] },
        ink: { DEFAULT: ds.color.ink, muted: ds.color["ink-muted"], subtle: ds.color["ink-subtle"] },
        brand: {
          DEFAULT: ds.color.brand,
          hover: ds.color["brand-hover"],
          tint: ds.color["brand-tint"],
        },
        "on-brand": ds.color["on-brand"],
        accent: { DEFAULT: ds.color.accent, tint: ds.color["accent-tint"] },
        success: { DEFAULT: ds.color.success, tint: ds.color["success-tint"] },
        warning: { DEFAULT: ds.color.warning, tint: ds.color["warning-tint"] },
        danger: { DEFAULT: ds.color.danger, tint: ds.color["danger-tint"], hover: ds.color["danger-hover"] },
        "on-danger": ds.color["on-danger"],
        nav: {
          bg: ds.color["nav-bg"],
          hover: ds.color["nav-hover"],
          active: ds.color["nav-active"],
          divider: ds.color["nav-divider"],
          accent: ds.color["nav-accent"],
          ink: ds.color["nav-ink"],
          "ink-muted": ds.color["nav-ink-muted"],
          label: ds.color["nav-label"],
        },
      },
      borderRadius: {
        "ds-sm": ds.radius.sm,
        "ds-md": ds.radius.md,
        "ds-lg": ds.radius.lg,
      },
      fontFamily: {
        sans: [ds.font.sans],
        mono: [ds.font.mono],
      },
      height: {
        "control-sm": `${ds.size["control-sm"]}px`,
        "control-md": `${ds.size["control-md"]}px`,
      },
      minHeight: {
        "control-sm": `${ds.size["control-sm"]}px`,
        "control-md": `${ds.size["control-md"]}px`,
      },
    },
  },
  plugins: [],
};
