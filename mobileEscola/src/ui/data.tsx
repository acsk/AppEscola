import React from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Dot, Icon, Tag, Txt, type IconName, type TagTone } from './primitives';
import { usePalette } from './theme';
import { font, radius, shadow, size, space, type } from './tokens';

// ── StatTile ─────────────────────────────────────────────────────────────────

export function StatTile({ label, value, hint, tone, style }: { label: string; value: string; hint?: string; tone?: 'success' | 'danger'; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[{ flex: 1, padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken }, style]}>
      <Txt variant="bodySm" tone="muted">{label}</Txt>
      <Text style={[type.title, { fontSize: 22, lineHeight: 28, ...font.extrabold, letterSpacing: -0.22, color: p.ink, marginTop: 2, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      {hint ? <Txt variant="caption" style={{ marginTop: 2, color: tone === 'success' ? p.success : tone === 'danger' ? p.dangerInk : p.inkSubtle }}>{hint}</Txt> : null}
    </View>
  );
}

// ── ProgressBar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  value, max = 100, tone = 'brand', size: sz = 'md', marker, label,
}: { value: number; max?: number; tone?: 'brand' | 'success' | 'danger' | 'ink'; size?: 'sm' | 'md'; marker?: number; label?: string }) {
  const p = usePalette();
  const v = Math.max(0, Math.min(max, value || 0));
  const fill = { brand: p.brand, success: p.success, danger: p.danger, ink: p.ink }[tone];
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: v }}
      style={{ height: sz === 'sm' ? 6 : 8, borderRadius: radius.pill, backgroundColor: p.surfaceSunken, position: 'relative' }}>
      <View style={{ width: `${max ? (v / max) * 100 : 0}%`, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
      {marker != null ? (
        <View style={{ position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, left: `${(marker / max) * 100}%`, backgroundColor: p.inkMuted }} />
      ) : null}
    </View>
  );
}

// ── SegmentedControl ─────────────────────────────────────────────────────────

export function SegmentedControl({ options, value, onChange, label }: { options: string[]; value: number; onChange: (index: number) => void; label?: string }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.md, backgroundColor: p.surfaceSunken }}>
      {options.map((option, i) => {
        const on = i === value;
        return (
          <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(i)}
            style={[{ flex: 1, minHeight: 34, paddingHorizontal: space[2], borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
              on && [{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }, shadow.card]]}>
            <Text numberOfLines={1} style={[type.label, { color: on ? p.ink : p.inkMuted }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Chip (seleção é tinta, nunca a cor da marca) ─────────────────────────────

export function Chip({ label, selected, dot, count, disabled, onPress }: { label: string; selected?: boolean; dot?: string; count?: number; disabled?: boolean; onPress?: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!selected, disabled }} disabled={disabled} onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, height: size.controlSm, paddingHorizontal: 14, borderRadius: radius.pill,
        borderWidth: 1, borderColor: selected ? p.surfaceInverse : p.lineStrong, backgroundColor: selected ? p.surfaceInverse : p.surface,
        opacity: disabled ? 0.45 : 1,
      }}>
      {selected ? <Icon name="check" size={16} strokeWidth={2.5} color={p.onInverse} /> : dot ? <Dot color={dot} /> : null}
      <Text numberOfLines={1} style={[type.label, { color: selected ? p.onInverse : p.ink }]}>{label}</Text>
      {count != null ? <Text style={[type.caption, { ...font.bold, color: selected ? p.onInverse : p.inkSubtle, opacity: selected ? 0.75 : 1 }]}>{count}</Text> : null}
    </Pressable>
  );
}

export function Chips({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{children}</View>;
}

// ── SearchField ──────────────────────────────────────────────────────────────

export function SearchField({ value, onChangeText, placeholder = 'Buscar', trailing }: { value: string; onChangeText: (v: string) => void; placeholder?: string; trailing?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: size.controlMd, paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: p.surface, borderWidth: 1, borderColor: p.lineStrong }}>
      <Icon name="search" size={20} color={p.inkSubtle} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={p.inkSubtle} accessibilityLabel={placeholder}
        style={[type.body, { flex: 1, minWidth: 0, color: p.ink, paddingVertical: 0 }]} />
      {trailing}
    </View>
  );
}

// ── WeekStrip ────────────────────────────────────────────────────────────────

export type WeekDay = { key: string; dow: string; day: number; mark?: boolean; today?: boolean };

export function WeekStrip({ days, selectedKey, onSelect }: { days: WeekDay[]; selectedKey?: string; onSelect?: (key: string) => void }) {
  const p = usePalette();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 2 }}>
      {days.map((d) => {
        const on = d.key === selectedKey;
        return (
          <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${d.dow} ${d.day}${d.mark ? ', com evento' : ''}`}
            onPress={() => onSelect?.(d.key)} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, borderRadius: radius.md }}>
            <Txt variant="caption" tone="subtle">{d.dow}</Txt>
            <View style={{
              width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? p.surfaceInverse : 'transparent', borderWidth: d.today && !on ? 1.5 : 0, borderColor: p.lineStrong,
            }}>
              <Text style={[type.titleSm, { color: on ? p.onInverse : p.ink, fontVariant: ['tabular-nums'] }]}>{d.day}</Text>
            </View>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: d.mark ? p.brand : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

// ── AnswerOption ─────────────────────────────────────────────────────────────

export type AnswerState = 'default' | 'selected' | 'correct' | 'incorrect' | 'missed' | 'dimmed';
const OPT_NOTE: Partial<Record<AnswerState, string>> = { correct: 'Sua resposta · correta', incorrect: 'Sua resposta', missed: 'Resposta correta' };

/** Alternativa: default · selected (antes de confirmar) · correct · incorrect · missed (a certa, não marcada) · dimmed. */
export function AnswerOption({
  letter, state = 'default', note, onPress, children,
}: { letter: string; state?: AnswerState; note?: string | null; onPress?: () => void; children: React.ReactNode }) {
  const p = usePalette();
  const s = {
    default: { border: p.line, bg: p.surface, letterBg: 'transparent', letterBorder: p.lineStrong, letterFg: p.inkMuted, fg: p.ink, noteFg: p.ink, dashed: false },
    selected: { border: p.brand, bg: p.brandSoft, letterBg: p.brand, letterBorder: p.brand, letterFg: p.onBrand, fg: p.ink, noteFg: p.brandInk, dashed: false },
    correct: { border: p.success, bg: p.successSoft, letterBg: p.success, letterBorder: p.success, letterFg: p.surface, fg: p.ink, noteFg: p.success, dashed: false },
    incorrect: { border: p.danger, bg: p.dangerSoft, letterBg: p.danger, letterBorder: p.danger, letterFg: p.surface, fg: p.ink, noteFg: p.dangerInk, dashed: false },
    missed: { border: p.success, bg: p.surface, letterBg: 'transparent', letterBorder: p.success, letterFg: p.success, fg: p.ink, noteFg: p.success, dashed: true },
    dimmed: { border: p.line, bg: p.surface, letterBg: 'transparent', letterBorder: p.lineStrong, letterFg: p.inkMuted, fg: p.inkMuted, noteFg: p.inkMuted, dashed: false },
  }[state];
  const shownNote = note !== undefined ? note : OPT_NOTE[state];
  const locked = ['correct', 'incorrect', 'missed', 'dimmed'].includes(state) && !onPress;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: state === 'selected' || state === 'correct' || state === 'incorrect', disabled: locked }}
      accessibilityLabel={`Alternativa ${letter}`} disabled={locked} onPress={onPress}
      style={{
        flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: 14, paddingLeft: space[3], paddingRight: space[4],
        borderRadius: radius.md, borderWidth: 1.5, borderStyle: s.dashed ? 'dashed' : 'solid', borderColor: s.border, backgroundColor: s.bg,
      }}>
      <View style={{
        width: 28, height: 28, marginTop: -3, borderRadius: 14, borderWidth: 1.5, borderColor: s.letterBorder,
        backgroundColor: s.letterBg, alignItems: 'center', justifyContent: 'center',
      }}>
        {state === 'correct' || state === 'missed' ? <Icon name="check" size={16} strokeWidth={3} color={s.letterFg} />
          : state === 'incorrect' ? <Icon name="x" size={16} strokeWidth={3} color={s.letterFg} />
          : <Text style={[type.caption, { fontSize: 13, ...font.bold, color: s.letterFg }]}>{letter}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2, opacity: state === 'dimmed' ? 0.72 : 1 }}>
        {typeof children === 'string' ? <Txt style={{ color: s.fg }}>{children}</Txt> : children}
        {shownNote ? <Txt variant="caption" style={{ ...font.bold, color: s.noteFg }}>{shownNote}</Txt> : null}
      </View>
    </Pressable>
  );
}

// ── ExamCard ─────────────────────────────────────────────────────────────────

export type ExamStatus = 'available' | 'progress' | 'done' | 'late';
const EXAM_STATUS: Record<ExamStatus, { tone: TagTone; icon: IconName; text: string }> = {
  available: { tone: 'neutral', icon: 'play', text: 'Disponível' },
  progress: { tone: 'info', icon: 'clock', text: 'Em andamento' },
  done: { tone: 'success', icon: 'check', text: 'Concluído' },
  late: { tone: 'danger', icon: 'alert', text: 'Prazo encerrado' },
};

/** Card de simulado: disciplina (ponto), status, título, meta, nota (concluído) e prazo + ação. */
export function ExamCard({
  subject, subjectColor, title, meta = [], status = 'available', statusText, deadline, urgent, score, scoreValue, minimum = 50,
  actionLabel, onPress, actionDisabled, style,
}: {
  subject: string; subjectColor?: string; title: string; meta?: string[]; status?: ExamStatus; statusText?: string; deadline?: string | null;
  urgent?: boolean; score?: string; scoreValue?: number; minimum?: number; actionLabel?: string; onPress?: () => void; actionDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const s = EXAM_STATUS[status];
  const done = status === 'done';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${statusText ?? s.text}`} onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: pressed ? p.surfaceSunken : p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.lg,
        padding: space[4], gap: space[2],
      }, shadow.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Dot color={subjectColor ?? p.inkSubtle} />
          <Text numberOfLines={1} style={[type.caption, { ...font.bold, letterSpacing: 0.48, textTransform: 'uppercase', color: p.inkMuted, flexShrink: 1 }]}>{subject}</Text>
        </View>
        <Tag tone={s.tone} icon={s.icon} label={statusText ?? s.text} />
      </View>
      <Text style={[type.title, { fontSize: 17, lineHeight: 23, color: p.ink, marginTop: 2 }]} numberOfLines={2}>{title}</Text>
      {meta.length ? <Txt variant="bodySm" tone="subtle">{meta.filter(Boolean).join('  ·  ')}</Txt> : null}
      {done && score ? (
        <View style={{ gap: 6, marginTop: space[1] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Txt variant="bodySm" tone="muted">Aproveitamento</Txt>
            <Text style={[type.title, { ...font.extrabold, color: p.ink, fontVariant: ['tabular-nums'] }]}>{score}</Text>
          </View>
          <ProgressBar value={scoreValue ?? 0} tone="success" size="sm" marker={minimum} label="Aproveitamento" />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], marginTop: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: p.line }}>
        {deadline ? <Tag tone={urgent ? 'accent' : 'neutral'} icon="calendar" label={deadline} /> : <View />}
        <Button size="sm" variant={done ? 'ghost' : status === 'late' ? 'secondary' : 'primary'} iconRight="arrow-right"
          label={actionLabel ?? (done ? 'Ver correção' : status === 'progress' ? 'Continuar' : 'Iniciar')} decorative disabled={actionDisabled} />
      </View>
    </Pressable>
  );
}

// ── QuickAction ──────────────────────────────────────────────────────────────

export function QuickAction({ icon = 'play', title, subtitle, progress, onPress }: { icon?: IconName; title: string; subtitle?: string; progress?: number; onPress?: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg,
        backgroundColor: pressed ? p.surfaceSunken : p.surface, borderWidth: 1, borderColor: p.line,
      }, shadow.card]}>
      <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: p.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={p.brandInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{title}</Txt>
        {subtitle ? <Txt variant="bodySm" tone="subtle" numberOfLines={2}>{subtitle}</Txt> : null}
        {progress != null ? <View style={{ marginTop: 6 }}><ProgressBar value={progress} size="sm" label={title} /></View> : null}
      </View>
      <Icon name="chevron-right" size={18} color={p.inkSubtle} />
    </Pressable>
  );
}

// ── QuestionRow ──────────────────────────────────────────────────────────────

const Q_STATUS = { new: { t: 'Nova', tone: 'outline' as TagTone, icon: undefined }, right: { t: 'Acertou', tone: 'success' as TagTone, icon: 'check' as IconName }, wrong: { t: 'Errou', tone: 'danger' as TagTone, icon: 'x' as IconName } };

export function QuestionRow({
  id, subject, subjectColor, topic, text, difficulty, source, rate, status = 'new', saved, onToggleSave, onPress, compact,
}: {
  id?: number | string; subject: string; subjectColor?: string; topic?: string | null; text: string; difficulty?: string | null; source?: string | null;
  rate?: number | null; status?: 'new' | 'right' | 'wrong'; saved?: boolean; onToggleSave?: () => void; onPress?: () => void;
  /** Lista do celular: padding menor e sem o assunto na linha de cima. */
  compact?: boolean;
}) {
  const p = usePalette();
  const s = Q_STATUS[status];
  // O botão de salvar fica fora do Pressable da linha (na web, botão dentro de botão é inválido).
  return (
    <View style={{ position: 'relative' }}>
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ gap: space[2], paddingVertical: compact ? space[3] : space[4], paddingHorizontal: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, backgroundColor: pressed ? p.surfaceSunken : p.surface })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingRight: onToggleSave ? 26 : 0 }}>
        <Dot color={subjectColor ?? p.inkSubtle} />
        <Text numberOfLines={1} style={[type.caption, { ...font.bold, textTransform: 'uppercase', letterSpacing: 0.48, color: p.inkMuted, flexShrink: 1 }]}>{subject}</Text>
        {topic && !compact ? <Txt variant="bodySm" tone="muted" numberOfLines={1} style={{ flexShrink: 1, ...font.semibold }}>·  {topic}</Txt> : null}
        <View style={{ flex: 1 }} />
        <Tag tone={s.tone} icon={s.icon} label={s.t} />
      </View>
      <Txt numberOfLines={2}>{text}</Txt>
      <Txt variant="bodySm" tone="subtle">{[id != null ? `#${id}` : null, difficulty, source, rate != null ? `${rate}% acertam` : null].filter(Boolean).join('  ·  ')}</Txt>
    </Pressable>
    {onToggleSave ? (
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remover dos salvos' : 'Salvar questão'} accessibilityState={{ selected: !!saved }} hitSlop={8} onPress={onToggleSave}
        style={{ position: 'absolute', right: space[4] - 4, top: (compact ? space[3] : space[4]) - 1, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="bookmark" size={18} color={saved ? p.brandInk : p.inkSubtle} />
      </Pressable>
    ) : null}
    </View>
  );
}

// ── QuestionNavigator (mapa da sessão) ───────────────────────────────────────

export function QuestionNavigator({
  total, current, answered = [], flagged = [], right = [], wrong = [], onSelect, legend = true,
}: { total: number; current?: number; answered?: number[]; flagged?: number[]; right?: number[]; wrong?: number[]; onSelect?: (n: number) => void; legend?: boolean }) {
  const p = usePalette();
  const cells = Array.from({ length: total }, (_, i) => i + 1);
  const styleFor = (n: number) => {
    if (n === current) return { bg: p.surfaceInverse, fg: p.onInverse, border: p.surfaceInverse };
    if (right.includes(n)) return { bg: p.successSoft, fg: p.success, border: p.success };
    if (wrong.includes(n)) return { bg: p.dangerSoft, fg: p.dangerInk, border: p.danger };
    if (answered.includes(n)) return { bg: p.brandSoft, fg: p.brandInk, border: p.brand };
    return { bg: p.surface, fg: p.inkMuted, border: p.lineStrong };
  };
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {cells.map((n) => {
          const c = styleFor(n);
          return (
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Questão ${n}`} onPress={() => onSelect?.(n)}
              style={{ width: 44, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type.label, { color: c.fg, fontVariant: ['tabular-nums'] }]}>{n}</Text>
              {flagged.includes(n) ? <View style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: p.accent }} /> : null}
            </Pressable>
          );
        })}
      </View>
      {legend ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
          {(right.length || wrong.length
            ? [['Certa', p.successSoft, p.success], ['Errada', p.dangerSoft, p.danger], ['Atual', p.surfaceInverse, p.surfaceInverse], ['Sem resposta', p.surface, p.lineStrong]]
            : [['Respondida', p.brandSoft, p.brand], ['Atual', p.surfaceInverse, p.surfaceInverse], ['Em branco', p.surface, p.lineStrong]]).map(([l, bg, b]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: bg, borderWidth: 1.5, borderColor: b }} />
              <Txt variant="bodySm" tone="subtle">{l}</Txt>
            </View>
          ))}
          {flagged.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={p.accent} size={6} /><Txt variant="bodySm" tone="subtle">Revisar</Txt>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
