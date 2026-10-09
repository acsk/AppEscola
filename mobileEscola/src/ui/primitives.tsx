import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  Archive, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Bell, Book, Bookmark, Calendar, Camera, ChartNoAxesColumn, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, CircleX, Clipboard, Clock, Download, Eye, Flag, Folder, Funnel, House, Info,
  KeyRound, LayoutGrid, Library, Lightbulb, ListFilter, LogOut, Menu, MessageSquare, PanelLeft, Pause, PenLine, Play,
  Minus, Plus, RefreshCw, Search, SlidersHorizontal, Target, TriangleAlert, Trophy, Wallet, X, GraduationCap, Sparkles, FileText,
  Receipt, Users, TrendingUp, TrendingDown, Strikethrough, ZoomIn, Calculator, Undo2,
  type LucideIcon,
} from 'lucide-react-native';
import { usePalette } from './theme';
import { font, radius, shadow, size, space, type, type Palette } from './tokens';

// ── Ícones (Lucide, traço 2) ─────────────────────────────────────────────────

export const ICONS = {
  menu: Menu, bell: Bell, home: House, chart: ChartNoAxesColumn, clipboard: Clipboard, wallet: Wallet,
  'chevron-right': ChevronRight, 'chevron-left': ChevronLeft, 'chevron-down': ChevronDown, check: Check, x: X,
  search: Search, sliders: SlidersHorizontal, book: Book, library: Library, calendar: Calendar, clock: Clock,
  target: Target, bookmark: Bookmark, logout: LogOut, key: KeyRound, folder: Folder, archive: Archive, edit: PenLine,
  'arrow-right': ArrowRight, 'arrow-left': ArrowLeft, 'arrow-up': ArrowUp, 'arrow-down': ArrowDown, play: Play, pause: Pause, download: Download, plus: Plus, minus: Minus, eye: Eye,
  message: MessageSquare, trophy: Trophy, alert: CircleAlert, warning: TriangleAlert, info: Info, refresh: RefreshCw,
  flag: Flag, sort: ListFilter, filter: Funnel, grid: LayoutGrid, 'panel-left': PanelLeft, 'circle-check': CircleCheck,
  'circle-x': CircleX, lightbulb: Lightbulb, graduation: GraduationCap, camera: Camera, sparkle: Sparkles, file: FileText,
  receipt: Receipt, users: Users, 'trend-up': TrendingUp, 'trend-down': TrendingDown,
  strike: Strikethrough, zoom: ZoomIn, calc: Calculator, undo: Undo2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size: s = 20, color, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const palette = usePalette();
  const Cmp = ICONS[name];
  return <Cmp size={s} color={color ?? palette.ink} strokeWidth={strokeWidth} />;
}

// ── Texto ────────────────────────────────────────────────────────────────────

export type TextVariant = keyof typeof type;
type Tone = 'ink' | 'muted' | 'subtle' | 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'onBrand' | 'onInverse';

export function toneColor(p: Palette, tone: Tone): string {
  return {
    ink: p.ink, muted: p.inkMuted, subtle: p.inkSubtle, brand: p.brandInk, success: p.success, danger: p.dangerInk,
    warning: p.warning, info: p.info, accent: p.accentInk, onBrand: p.onBrand, onInverse: p.onInverse,
  }[tone];
}

export function Txt({ variant = 'body', tone = 'ink', style, ...rest }: TextProps & { variant?: TextVariant; tone?: Tone }) {
  const p = usePalette();
  return <Text {...rest} style={[type[variant], { color: toneColor(p, tone) }, style]} />;
}

// ── Botões ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Sombra colorida: só o CTA fixo no rodapé. */
  cta?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** Só visual (dentro de um card já clicável): evita botão dentro de botão. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Botão: a única coisa colorida e viva da interface. Um primary/accent por tela. */
export function Button({ label, variant = 'primary', size: sz = 'md', block, cta, icon, iconRight, loading, disabled, decorative, style, ...rest }: ButtonProps) {
  const p = usePalette();
  const off = disabled || loading;
  const colors = {
    primary: { bg: p.brand, fg: p.onBrand, border: p.brand, pressed: p.brandStrong },
    accent: { bg: p.accent, fg: p.onAccent, border: p.accent, pressed: p.accent },
    secondary: { bg: p.surface, fg: p.ink, border: p.lineStrong, pressed: p.surfaceSunken },
    ghost: { bg: 'transparent', fg: p.ink, border: 'transparent', pressed: p.surfaceSunken },
    danger: { bg: p.danger, fg: p.onDanger, border: p.danger, pressed: p.danger },
  }[variant];
  const height = sz === 'sm' ? size.controlSm : sz === 'lg' ? size.controlLg : size.controlMd;
  const fg = off ? p.inkSubtle : colors.fg;
  const iconSize = sz === 'sm' ? 18 : 20;
  const content = (
    <>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={iconSize} color={fg} /> : null}
      <Text numberOfLines={1} style={[type.button, { fontSize: sz === 'sm' ? 14 : sz === 'lg' ? 17 : 16, color: fg }]}>{label}</Text>
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} color={fg} /> : null}
    </>
  );
  const boxStyle = (pressed: boolean): StyleProp<ViewStyle> => [
    {
      height,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: sz === 'sm' ? 6 : space[2],
      paddingHorizontal: sz === 'sm' ? space[3] : variant === 'ghost' ? space[3] : sz === 'lg' ? space[6] : space[5],
      borderRadius: sz === 'sm' ? radius.sm : radius.md,
      borderWidth: 1.5,
      borderColor: off ? 'transparent' : colors.border,
      backgroundColor: off ? p.surfaceSunken : pressed ? colors.pressed : colors.bg,
      alignSelf: block ? 'stretch' : 'auto',
      transform: [{ scale: pressed && !off ? 0.98 : 1 }],
    },
    block && { flexGrow: 1 },
    cta && !off && shadow.cta(p.brand),
    style,
  ];
  if (decorative) return <View pointerEvents="none" style={boxStyle(false)}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      {...rest}
      style={({ pressed }) => boxStyle(pressed)}
    >
      {content}
    </Pressable>
  );
}

export function IconButton({
  icon, label, variant = 'plain', badge, iconSize = 22, color, style, ...rest
}: Omit<PressableProps, 'style'> & { icon: IconName; label: string; variant?: 'plain' | 'outline' | 'primary'; badge?: boolean; iconSize?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const fg = color ?? (variant === 'primary' ? p.onBrand : p.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      {...rest}
      style={({ pressed }) => [
        {
          width: size.touchMin,
          height: size.touchMin,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: variant === 'primary' ? p.brand : variant === 'outline' ? p.surface : pressed ? p.surfaceSunken : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: p.line,
        },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={fg} />
      {badge ? (
        <View style={{ position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: p.danger, borderWidth: 2, borderColor: p.surface }} />
      ) : null}
    </Pressable>
  );
}

/** Link de seção ("Ver todos"): texto em brand-ink. */
export function LinkButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Txt variant="label" tone="brand" style={{ ...font.bold }}>{label}</Txt>
    </Pressable>
  );
}

// ── Tag, Card, Seção, Vazio ──────────────────────────────────────────────────

export type TagTone = 'neutral' | 'outline' | 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

export function Tag({ label, tone = 'neutral', dot, icon }: { label: string; tone?: TagTone; dot?: string; icon?: IconName }) {
  const p = usePalette();
  const c = {
    neutral: [p.surfaceSunken, p.inkMuted], outline: ['transparent', p.inkMuted], brand: [p.brandSoft, p.brandInk],
    success: [p.successSoft, p.success], danger: [p.dangerSoft, p.dangerInk], warning: [p.warningSoft, p.warning],
    info: [p.infoSoft, p.info], accent: [p.accentSoft, p.accentInk],
  }[tone];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radius.pill,
      backgroundColor: c[0], borderWidth: tone === 'outline' ? 1 : 0, borderColor: p.line, alignSelf: 'flex-start',
    }}>
      {dot ? <Dot color={dot} /> : null}
      {icon ? <Icon name={icon} size={14} strokeWidth={2.25} color={c[1]} /> : null}
      <Text numberOfLines={1} style={[type.caption, { color: c[1] }]}>{label}</Text>
    </View>
  );
}

/** Disciplina é um ponto de 8px, nunca fundo de card. */
export function Dot({ color, size: s = 8 }: { color: string; size?: number }) {
  return <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color }} />;
}

export function Card({
  children, padding = 'md', onPress, style, accessibilityLabel, ...rest
}: ViewProps & { padding?: 'none' | 'md' | 'lg'; onPress?: () => void; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const p = usePalette();
  const base: ViewStyle = {
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.lg,
    padding: padding === 'none' ? 0 : padding === 'lg' ? space[5] : space[4], ...shadow.card,
  };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
        style={({ pressed }) => [base, pressed && { backgroundColor: p.surfaceSunken }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View {...rest} style={[base, style]}>{children}</View>;
}

export function Section({ title, action, children, style }: { title: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space[3] }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="titleSm" accessibilityRole="header">{title}</Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Overline({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Txt variant="overline" tone="subtle" style={style}>{children}</Txt>;
}

export function EmptyState({ icon = 'archive', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{
      alignItems: 'center', gap: 6, paddingVertical: space[6], paddingHorizontal: space[4],
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.lineStrong, borderRadius: radius.lg,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={22} color={p.inkMuted} />
      </View>
      <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20, textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center', maxWidth: 260, ...font.regular }}>{text}</Txt> : null}
      {action}
    </View>
  );
}

/** Aviso em bloco (info / atenção / erro), sempre com ícone e título. */
export function Notice({ tone = 'info', icon, title, text }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; title: string; text?: string }) {
  const p = usePalette();
  const [bg, fg] = { info: [p.infoSoft, p.info], warning: [p.warningSoft, p.warning], danger: [p.dangerSoft, p.dangerInk], success: [p.successSoft, p.success] }[tone];
  const fallbackIcon: IconName = tone === 'warning' ? 'alert' : tone === 'danger' ? 'circle-x' : tone === 'success' ? 'circle-check' : 'info';
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: bg }}>
      <Icon name={icon ?? fallbackIcon} size={20} color={fg} />
      <View style={{ flex: 1 }}>
        <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20, color: tone === 'danger' ? fg : p.ink }}>{title}</Txt>
        {text ? <Txt variant="bodySm" tone="muted">{text}</Txt> : null}
      </View>
    </View>
  );
}
