import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Dot, Icon, Tag, Txt, type IconName } from './primitives';
import type { ExamStatus } from './data';
import { usePalette } from './theme';
import { font, layout, radius, shadow, size, space, type } from './tokens';

// ── Página (desktop) ─────────────────────────────────────────────────────────

/** Cabeçalho de página do desktop (`.cx-page__head`): título 28/34 800 + subtítulo + ações à direita. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[4] }}>
      <View style={{ flexShrink: 1 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, ...font.extrabold, letterSpacing: -0.56, color: p.ink }}>{title}</Text>
        {subtitle ? <Txt tone="muted" style={{ marginTop: 4 }}>{subtitle}</Txt> : null}
      </View>
      {actions}
    </View>
  );
}

/** Conteúdo de página (`.cx-page`): largura máxima, margens 24/32 e respiro de 24 entre blocos. */
export function PageBody({ children, maxWidth = layout.contentMax, style }: { children: React.ReactNode; maxWidth?: number | 'none'; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      width: '100%', maxWidth: maxWidth === 'none' ? undefined : maxWidth, alignSelf: 'center',
      paddingTop: space[6], paddingHorizontal: space[8], paddingBottom: space[8], gap: space[6],
    }, style]}>
      {children}
    </View>
  );
}

// ── Checkbox / radio ─────────────────────────────────────────────────────────

export function Checkbox({
  label, checked, radio, dot, count, disabled, onPress,
}: { label: string; checked?: boolean; radio?: boolean; dot?: string; count?: number; disabled?: boolean; onPress?: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: !!checked, disabled }} disabled={disabled} onPress={onPress}
      style={(({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: space[2], marginHorizontal: -space[2],
        borderRadius: radius.sm, backgroundColor: hovered ? p.surfaceSunken : 'transparent', opacity: disabled ? 0.45 : 1,
      })) as never}>
      <View style={{
        width: 18, height: 18, borderRadius: radio ? 9 : 5, alignItems: 'center', justifyContent: 'center',
        borderWidth: checked ? (radio ? 5 : 0) : 1.5, borderColor: checked ? p.surfaceInverse : p.lineStrong,
        backgroundColor: checked && !radio ? p.surfaceInverse : 'transparent',
      }}>
        {checked && !radio ? <Icon name="check" size={14} strokeWidth={3} color={p.onInverse} /> : null}
      </View>
      {dot ? <Dot color={dot} /> : null}
      <Text numberOfLines={1} style={[type.label, { ...font.medium, fontSize: 14, color: p.ink, flex: 1 }]}>{label}</Text>
      {count != null ? <Text style={[type.caption, { color: p.inkSubtle, fontVariant: ['tabular-nums'] }]}>{count}</Text> : null}
    </Pressable>
  );
}

// ── FilterGroup ──────────────────────────────────────────────────────────────

export function FilterGroup({ title, selected, defaultOpen = true, children }: { title: string; selected?: number; defaultOpen?: boolean; children?: React.ReactNode }) {
  const p = usePalette();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: p.line, paddingTop: space[2], paddingBottom: space[3] }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text style={[type.label, { ...font.bold, color: p.ink }]}>{title}</Text>
          {selected ? (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: p.surfaceInverse, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, ...font.bold, color: p.onInverse }}>{selected}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}><Icon name="chevron-down" size={18} color={p.inkSubtle} /></View>
      </Pressable>
      {open ? <View style={{ gap: 2 }}>{children}</View> : null}
    </View>
  );
}

// ── SelectButton (com lista) ─────────────────────────────────────────────────

export function SelectButton<T extends string | number>({
  label, value, options, onChange, icon,
}: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; icon?: IconName }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? ''} ${current?.label ?? ''}`} onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: size.controlSm, paddingLeft: 12, paddingRight: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: p.lineStrong, backgroundColor: p.surface }}>
        {icon ? <Icon name={icon} size={18} color={p.ink} /> : null}
        {label ? <Text style={[type.label, { ...font.medium, color: p.inkSubtle }]}>{label}</Text> : null}
        <Text numberOfLines={1} style={[type.label, { color: p.ink }]}>{current?.label ?? ''}</Text>
        <Icon name="chevron-down" size={16} color={p.inkSubtle} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: p.scrim, alignItems: 'center', justifyContent: 'center', padding: space[4] }}>
          <View style={[{ width: 320, maxWidth: '100%', maxHeight: 420, backgroundColor: p.surface, borderRadius: radius.lg, paddingVertical: space[2] }, shadow.sheet]}>
            <ScrollView>
              {options.map((o) => (
                <Pressable key={String(o.value)} accessibilityRole="menuitem" accessibilityState={{ selected: o.value === value }}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  style={(({ hovered }: { hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], height: 44, backgroundColor: hovered ? p.surfaceSunken : 'transparent' })) as never}>
                  <Text style={[type.label, { flex: 1, color: p.ink }]}>{o.label}</Text>
                  {o.value === value ? <Icon name="check" size={18} color={p.brandInk} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── FilterPill (filtro ativo, removível) ─────────────────────────────────────

export function FilterPill({ label, dot, onRemove }: { label: string; dot?: string; onRemove: () => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 4, borderRadius: radius.pill, backgroundColor: p.surface, borderWidth: 1, borderColor: p.lineStrong }}>
      {dot ? <Dot color={dot} /> : null}
      <Text numberOfLines={1} style={[type.label, { fontSize: 13, color: p.ink }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remover filtro ${label}`} hitSlop={8} onPress={onRemove}
        style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" size={14} strokeWidth={2.5} color={p.inkMuted} />
      </Pressable>
    </View>
  );
}

// ── Kbd ──────────────────────────────────────────────────────────────────────

export function Kbd({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text style={{
      ...font.bold, fontSize: 11, lineHeight: 14, color: p.inkMuted, backgroundColor: p.surface,
      borderWidth: 1, borderBottomWidth: 2, borderColor: p.lineStrong, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
    }}>{children}</Text>
  );
}

// ── ExamRow (tabela de simulados no desktop) ─────────────────────────────────

const EXAM_STATUS: Record<ExamStatus, { tone: 'neutral' | 'info' | 'success' | 'danger'; icon: IconName; text: string }> = {
  available: { tone: 'neutral', icon: 'play', text: 'Disponível' },
  progress: { tone: 'info', icon: 'clock', text: 'Em andamento' },
  done: { tone: 'success', icon: 'check', text: 'Concluído' },
  late: { tone: 'danger', icon: 'alert', text: 'Prazo encerrado' },
};
export const EXAM_TABLE_COLUMNS = { due: 150, score: 72, action: 128 } as const;

export function ExamTableHead() {
  const p = usePalette();
  const cell = [type.overline, { color: p.inkSubtle }];
  return (
    <View style={{ flexDirection: 'row', gap: space[4], paddingHorizontal: space[4], paddingBottom: space[2], borderBottomWidth: 1, borderBottomColor: p.line }}>
      <Text style={[cell, { flex: 1 }]}>Simulado</Text>
      <Text style={[cell, { width: EXAM_TABLE_COLUMNS.due }]}>Prazo</Text>
      <Text style={[cell, { width: EXAM_TABLE_COLUMNS.score }]}>Nota</Text>
      <View style={{ width: EXAM_TABLE_COLUMNS.action }} />
    </View>
  );
}

export function ExamRow({
  subject, subjectColor, title, meta = [], status = 'available', statusText, deadline, urgent, score, actionLabel, selected, onPress, onAction, first,
}: {
  subject: string; subjectColor?: string; title: string; meta?: string[]; status?: ExamStatus; statusText?: string; deadline?: string | null; urgent?: boolean;
  score?: string; actionLabel?: string; selected?: boolean; onPress?: () => void; onAction?: () => void; first?: boolean;
}) {
  const p = usePalette();
  const s = EXAM_STATUS[status];
  const done = status === 'done';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={title} onPress={onPress}
      style={(({ hovered }: { hovered?: boolean }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.md,
        backgroundColor: selected || hovered ? p.surfaceSunken : 'transparent', borderTopWidth: first || selected ? 0 : 1, borderTopColor: p.line,
      })) as never}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dot color={subjectColor ?? p.inkSubtle} />
          <Text numberOfLines={1} style={[type.caption, { ...font.bold, letterSpacing: 0.48, textTransform: 'uppercase', color: p.inkMuted }]}>{subject}</Text>
        </View>
        <Txt variant="titleSm" numberOfLines={1}>{title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Tag tone={s.tone} icon={s.icon} label={statusText ?? s.text} />
          {meta.length ? <Txt variant="bodySm" tone="subtle">{meta.join('  ·  ')}</Txt> : null}
        </View>
      </View>
      <View style={{ width: EXAM_TABLE_COLUMNS.due }}>
        {deadline ? <Tag tone={urgent ? 'accent' : 'neutral'} icon="calendar" label={deadline} /> : <Txt tone="subtle">—</Txt>}
      </View>
      <View style={{ width: EXAM_TABLE_COLUMNS.score }}>
        {done && score ? <Txt variant="titleSm" style={{ fontVariant: ['tabular-nums'] }}>{score}</Txt> : <Txt tone="subtle">—</Txt>}
      </View>
      <View style={{ width: EXAM_TABLE_COLUMNS.action, alignItems: 'flex-end' }}>
        <Button size="sm" variant={done ? 'ghost' : status === 'late' ? 'secondary' : 'primary'}
          label={actionLabel ?? (done ? 'Ver correção' : status === 'progress' ? 'Continuar' : 'Iniciar')} onPress={onAction ?? onPress} />
      </View>
    </Pressable>
  );
}
