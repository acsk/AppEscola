/** Ícones de traço do protótipo (24×24, `currentColor`). Decorativos: `aria-hidden`. */
type Props = { size?: number; strokeWidth?: number };

function Stroke({ d, size = 16, strokeWidth = 2 }: Props & { d: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <path d={d}></path>
    </svg>
  );
}

export const ICON = {
  check: "M5 12l5 5 9-10",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  questions: "M4 5h16v14H4zM8 9h8M8 13h5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  home: "M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  wallet: "M3 6h18v12H3zM3 10h18M7 15h4",
} as const;

export function Icon({ name, ...props }: Props & { name: keyof typeof ICON }) {
  return <Stroke d={ICON[name]} {...props} />;
}

/** Marca de item da lista de vantagens de cada funcionalidade. */
export function CheckMark() {
  return (
    <span className="ck">
      <Icon name="check" strokeWidth={2.4} />
    </span>
  );
}
