/**
 * Tokens do design system do app do aluno ("Conectivo App").
 * Sóbrio no conteúdo, vivo na ação: cor viva só em botões, aba ativa, alternativa marcada e progresso.
 * As cores de marca (brand*, accent*) vêm do painel (Tema do app mobile); o resto é fixo.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type Palette = {
  bg: string;
  surface: string;
  surfaceSunken: string;
  surfaceInverse: string;
  onInverse: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandInk: string;
  onBrand: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  dangerInk: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  focus: string;
  scrim: string;
  subjects: string[];
};

export const LIGHT: Palette = {
  bg: '#F5F6F7',
  surface: '#FFFFFF',
  surfaceSunken: '#EEF0F2',
  surfaceInverse: '#121417',
  onInverse: '#FFFFFF',
  line: '#E2E5E9',
  lineStrong: '#8A929C',
  ink: '#121417',
  inkMuted: '#525A65',
  inkSubtle: '#636B77',
  brand: '#06843F',
  brandStrong: '#056B36',
  brandSoft: '#E7F5EC',
  brandInk: '#056B36',
  onBrand: '#FFFFFF',
  accent: '#FF6A1A',
  accentSoft: '#FFF0E6',
  accentInk: '#A13D06',
  onAccent: '#1C0A00',
  success: '#087A3D',
  successSoft: '#E7F5EC',
  danger: '#D12D20',
  dangerSoft: '#FDECEA',
  dangerInk: '#B42318',
  onDanger: '#FFFFFF',
  warning: '#A8480A',
  warningSoft: '#FEF4E6',
  info: '#1F5FCC',
  infoSoft: '#EBF2FD',
  focus: '#2563EB',
  scrim: 'rgba(18, 20, 23, 0.48)',
  subjects: ['#6E56CF', '#E5484D', '#0E9384', '#D97706', '#2F6FEB', '#C2298A'],
};

/** Tema escuro (o app ainda é só claro: `userInterfaceStyle: light`). */
export const DARK: Palette = {
  bg: '#0D0F12',
  surface: '#16191E',
  surfaceSunken: '#1F2329',
  surfaceInverse: '#F1F3F5',
  onInverse: '#121417',
  line: '#2A2F36',
  lineStrong: '#6B747F',
  ink: '#F1F3F5',
  inkMuted: '#A7AFBA',
  inkSubtle: '#929BA6',
  brand: '#2FD573',
  brandStrong: '#5BE394',
  brandSoft: '#0F2A1B',
  brandInk: '#5BE394',
  onBrand: '#04150B',
  accent: '#FF8A47',
  accentSoft: '#2E1607',
  accentInk: '#FFA36E',
  onAccent: '#1C0A00',
  success: '#4ADE80',
  successSoft: '#0F2A1B',
  danger: '#FF6B5E',
  dangerSoft: '#351311',
  dangerInk: '#FF8A80',
  onDanger: '#1A0503',
  warning: '#F5A65B',
  warningSoft: '#33200B',
  info: '#7EB0FF',
  infoSoft: '#12223F',
  focus: '#7EB0FF',
  scrim: 'rgba(0, 0, 0, 0.64)',
  subjects: ['#9D8CF0', '#FF7A7E', '#2CC4B2', '#F5A524', '#6E9EFF', '#F06BBE'],
};

// ── Cores de marca a partir do painel ────────────────────────────────────────

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Mistura `a` com `b` (t = peso de b). */
const mix = (a: Rgb, b: Rgb, t: number) => toHex(a.map((c, i) => c + (b[i] - c) * t));

function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return 1;
  const [l1, l2] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/**
 * Deriva brand-strong/soft/ink/on-brand de uma única cor (regra do README do design system):
 * strong = escurecer 15%; soft = 10% sobre branco; ink = strong, escurecido até 4.5:1 na superfície;
 * on-brand = branco se tiver 4.5:1 com a marca, senão quase-preto. O mesmo para o accent (opcional).
 */
export function deriveBrand(base: Palette, brand?: string | null, accent?: string | null): Palette {
  const out: Palette = { ...base };
  const rgb = brand ? parseHex(brand) : null;
  if (rgb) {
    const brandHex = toHex(rgb);
    let ink = mix(rgb, BLACK, 0.15);
    for (let t = 0.25; contrast(ink, base.surface) < 4.5 && t <= 0.8; t += 0.1) ink = mix(rgb, BLACK, t);
    Object.assign(out, {
      brand: brandHex,
      brandStrong: mix(rgb, BLACK, 0.15),
      brandSoft: mix(rgb, WHITE, 0.9),
      brandInk: ink,
      onBrand: contrast(brandHex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#04150B',
    });
  }
  const accentRgb = accent ? parseHex(accent) : null;
  if (accentRgb) {
    const accentHex = toHex(accentRgb);
    const soft = mix(accentRgb, WHITE, 0.9);
    let accentInk = mix(accentRgb, BLACK, 0.4);
    for (let t = 0.5; contrast(accentInk, soft) < 4.5 && t <= 0.8; t += 0.1) accentInk = mix(accentRgb, BLACK, t);
    Object.assign(out, {
      accent: accentHex,
      accentSoft: soft,
      accentInk,
      onAccent: contrast(accentHex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#1C0A00',
    });
  }
  return out;
}

/** Cor da disciplina: a do cadastro (se houver) ou uma das 6 do sistema, estável pelo id. */
export function subjectColor(palette: Palette, id?: number | null, custom?: string | null): string {
  if (custom && parseHex(custom)) return custom;
  const n = Math.abs(Number(id ?? 0));
  return palette.subjects[n % palette.subjects.length];
}

/** Cor com transparência (para véus e sombras). */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  return rgb ? `rgba(${rgb.join(', ')}, ${alpha})` : hex;
}

// ── Espaço, raio, tamanho, layout ────────────────────────────────────────────

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const size = { controlLg: 56, controlMd: 48, controlSm: 36, touchMin: 44, tabbarH: 64 } as const;
export const layout = {
  tablet: 768,
  desktop: 1024,
  wide: 1360,
  railW: 72,
  sidebarW: 248,
  filtersW: 264,
  asideW: 320,
  contentMax: 1200,
  readingMax: 720,
} as const;

// ── Tipografia (Figtree) ─────────────────────────────────────────────────────

export const fontFamily = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
} as const;

const t = (fontSize: number, lineHeight: number, family: string, extra: TextStyle = {}): TextStyle => ({
  fontSize,
  lineHeight,
  fontFamily: family,
  ...extra,
});

export const type = {
  display: t(40, 44, fontFamily.extrabold, { letterSpacing: -0.8, fontVariant: ['tabular-nums'] }),
  titleLg: t(24, 30, fontFamily.bold, { letterSpacing: -0.24 }),
  title: t(18, 24, fontFamily.bold),
  titleSm: t(16, 22, fontFamily.bold),
  reading: t(17, 27, fontFamily.regular),
  body: t(15, 22, fontFamily.regular),
  bodySm: t(13, 18, fontFamily.medium),
  label: t(14, 20, fontFamily.semibold),
  button: t(16, 20, fontFamily.bold),
  overline: t(11, 16, fontFamily.bold, { letterSpacing: 0.88, textTransform: 'uppercase' }),
  caption: t(12, 16, fontFamily.semibold),
} as const;

// ── Sombras ──────────────────────────────────────────────────────────────────

function shadowStyle(rgb: Rgb, y: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0px ${y}px ${blur}px rgba(${rgb.join(', ')}, ${opacity})` } as ViewStyle,
    default: {
      shadowColor: toHex(rgb),
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
      elevation,
    },
  })!;
}

export const shadow = {
  card: shadowStyle([18, 20, 23], 1, 2, 0.06, 1),
  cta: (brand: string) => shadowStyle(parseHex(brand) ?? [6, 132, 63], 6, 16, 0.28, 6),
  sheet: shadowStyle([18, 20, 23], -8, 32, 0.14, 16),
};
