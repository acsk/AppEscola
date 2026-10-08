import React from 'react';
import { Image, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Button, Card, Icon, IconButton, Tag, Txt, type IconName, type TagTone } from './primitives';
import { ProgressBar } from './data';
import { usePalette } from './theme';
import { font, radius, space, type } from './tokens';

// Componentes do protótipo "Conectivo App" para prática, agenda, desempenho, biblioteca e financeiro.

// ── Novidades ────────────────────────────────────────────────────────────────

/** "Novo" é sempre azul (info) e sempre escrito: "12 novas", "Nova". */
export function NewPill({ label, inverse, tone }: { label: string; inverse?: boolean; /** Sobre o fundo de cor da navegação. */ tone?: 'nav' }) {
  const p = usePalette();
  const [bg, fg] = tone === 'nav' ? [p.navNew, p.onNavNew] : inverse ? [p.onInverse, p.surfaceInverse] : [p.info, p.surface];
  return (
    <View style={{ height: 22, minWidth: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ ...font.extrabold, fontSize: 12, lineHeight: 16, color: fg, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export const newLabel = (n: number) => `${n} ${n === 1 ? 'nova' : 'novas'}`;

/** Aviso de conteúdo novo no topo da tela. */
export function NewBanner({ count, title, text, action }: { count: number; title?: string; text?: string; action?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: p.infoSoft }}>
      <View style={{ minWidth: 40, height: 40, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: p.info, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...font.extrabold, fontSize: 17, color: p.surface, fontVariant: ['tabular-nums'] }}>{count}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20 }}>{title ?? (count === 1 ? '1 questão nova chegou' : `${count} questões novas chegaram`)}</Txt>
        {text ? <Txt variant="bodySm" tone="muted">{text}</Txt> : null}
      </View>
      {action}
    </View>
  );
}

// ── Prática ──────────────────────────────────────────────────────────────────

/** Título de passo numerado ("1  Escolha a matéria"). */
export function StepHeader({ n, title, optional }: { n: number; title: string; optional?: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.surfaceInverse, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...font.extrabold, fontSize: 13, color: p.onInverse }}>{n}</Text>
      </View>
      <Text accessibilityRole="header" style={{ ...font.extrabold, fontSize: 17, lineHeight: 22, color: p.ink }}>{title}</Text>
      {optional ? <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{optional}</Txt> : null}
    </View>
  );
}

/** Cartão grande para escolher a matéria com um toque. Selecionado: contorno ink e check preenchido. */
export function SubjectTile({
  subject, dot, icon, count, newCount, selected, onPress, style,
}: { subject: string; dot?: string; icon?: IconName; count: number; newCount?: number; selected?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${subject}, ${count} questões${newCount ? `, ${newLabel(newCount)}` : ''}`}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{
        gap: 6, padding: space[4], borderRadius: radius.lg, borderWidth: selected ? 2.5 : 1.5,
        borderColor: selected ? p.ink : hovered ? p.lineStrong : p.line, backgroundColor: pressed ? p.surfaceSunken : p.surface, minHeight: 112,
      }, style] as never}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {icon ? (
          <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginVertical: -4 }}>
            <Icon name={icon} size={20} color={p.inkMuted} />
          </View>
        ) : <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: dot ?? p.inkSubtle, marginVertical: 3 }} />}
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? p.surfaceInverse : 'transparent', borderWidth: selected ? 0 : 1.5, borderColor: p.lineStrong }}>
          {selected ? <Icon name="check" size={16} strokeWidth={3} color={p.onInverse} /> : null}
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Text numberOfLines={2} style={{ ...font.extrabold, fontSize: 16, lineHeight: 21, color: p.ink }}>{subject}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{count} {count === 1 ? 'questão' : 'questões'}</Txt>
        {newCount ? <NewPill label={newLabel(newCount)} /> : null}
      </View>
    </Pressable>
  );
}

export type TopicStatus = 'reforcar' | 'atencao' | 'bom' | 'poucos' | 'nao';
const TOPIC: Record<TopicStatus, { tone: TagTone; icon?: IconName; t: string }> = {
  reforcar: { tone: 'danger', icon: 'alert', t: 'Reforçar' },
  atencao: { tone: 'warning', icon: 'flag', t: 'Atenção' },
  bom: { tone: 'success', icon: 'check', t: 'Bom' },
  poucos: { tone: 'neutral', icon: 'clock', t: 'Poucos dados' },
  nao: { tone: 'outline', t: 'Não praticado' },
};

/** Assunto no "O que estudar": situação escrita, barra de acerto e "Praticar". */
export function TopicRow({
  topic, status, right, total, available, newCount, primary, onPractice, first,
}: { topic: string; status: TopicStatus; right: number; total: number; available: number; newCount?: number; primary?: boolean; onPractice?: () => void; first?: boolean }) {
  const p = usePalette();
  const s = TOPIC[status];
  const pct = total ? Math.round((right / total) * 100) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: p.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20 }}>{topic}</Txt>
          <Tag tone={s.tone} icon={s.icon} label={s.t} />
          {newCount ? <NewPill label={newLabel(newCount)} /> : null}
        </View>
        {pct != null ? <ProgressBar value={pct} tone={status === 'reforcar' ? 'danger' : 'ink'} size="sm" label={topic} /> : null}
        <Txt variant="bodySm" tone="subtle" style={{ fontVariant: ['tabular-nums'] }}>
          {pct != null ? `${right} de ${total} certas · ${pct}%` : `${available} ${available === 1 ? 'questão para praticar' : 'questões para praticar'}`}
        </Txt>
      </View>
      <Button size="sm" variant={primary ? 'primary' : 'secondary'} icon="play" label="Praticar" disabled={!available} onPress={onPractice} />
    </View>
  );
}

/** Seta contra a foto de cerca de 24h atrás: positivo sobe, negativo desce. */
export function RankMovement({ movement }: { movement?: number | null }) {
  const p = usePalette();
  if (movement == null || movement === 0) return null;
  const up = movement > 0;
  const places = Math.abs(movement);
  return (
    <View accessibilityLabel={up ? `Subiu ${places} ${places === 1 ? 'posição' : 'posições'}` : `Caiu ${places} ${places === 1 ? 'posição' : 'posições'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} color={up ? p.success : p.danger} />
      <Text style={{ ...font.bold, fontSize: 12, color: up ? p.success : p.danger, fontVariant: ['tabular-nums'] }}>{places}</Text>
    </View>
  );
}

/** Linha do ranking. A sua linha tem contorno ink e o selo "você". */
export function RankRow({ pos, initials, name, rate, count, me, photoUrl, movement }: { pos: number; initials: string; name: string; rate: number | null; count: number; me?: boolean; photoUrl?: string | null; movement?: number | null }) {
  const p = usePalette();
  const top = pos <= 3;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, paddingHorizontal: space[4], borderRadius: radius.md,
      backgroundColor: me ? p.surfaceSunken : 'transparent', borderWidth: me ? 1.5 : 0, borderColor: p.ink,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pos === 1 ? p.surfaceInverse : me ? p.surface : top ? p.surfaceSunken : 'transparent' }}>
        {pos === 1 ? <Icon name="trophy" size={18} color={p.onInverse} />
          : <Text style={{ ...font.extrabold, fontSize: 15, color: top ? p.ink : p.inkMuted, fontVariant: ['tabular-nums'] }}>{pos}º</Text>}
      </View>
      <View style={{ width: 28, alignItems: 'flex-start' }}>
        <RankMovement movement={movement} />
      </View>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.surfaceSunken }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.surfaceSunken, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...font.extrabold, fontSize: 13, color: p.inkMuted }}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, flexShrink: 1 }}>{name}</Txt>
          {me ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: p.surfaceInverse }}>
              <Text style={{ ...font.extrabold, fontSize: 11, letterSpacing: 0.44, color: p.onInverse }}>VOCÊ</Text>
            </View>
          ) : null}
        </View>
        <Txt variant="bodySm" tone="subtle">{rate != null ? `${rate.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% de acerto` : 'Poucos dados'}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ ...font.extrabold, fontSize: 18, lineHeight: 22, color: p.ink, fontVariant: ['tabular-nums'] }}>{count}</Text>
        <Txt variant="caption" tone="subtle">{count === 1 ? 'questão' : 'questões'}</Txt>
      </View>
    </View>
  );
}

/** Mensagem da caixa de entrada. Não lida: título em negrito e ponto azul. */
export function NotificationItem({
  icon = 'bell', title, text, time, unread, isNew, action, onPress, first,
}: { icon?: IconName; title: string; text?: string | null; time: string; unread?: boolean; isNew?: boolean; action?: React.ReactNode; onPress?: () => void; first?: boolean }) {
  const p = usePalette();
  // A ação fica fora da área clicável (na web, botão dentro de botão é inválido).
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: p.line, backgroundColor: unread ? p.surface : 'transparent' }}>
      {unread ? <View style={{ position: 'absolute', top: 20, left: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: p.info, zIndex: 1 }} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${unread ? 'Não lida: ' : ''}${title}`} onPress={onPress}
        style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], padding: space[4], paddingBottom: action ? space[2] : space[4], backgroundColor: pressed ? p.surfaceSunken : 'transparent' })}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: isNew ? p.infoSoft : p.surfaceSunken }}>
          <Icon name={icon} size={20} color={isNew ? p.info : p.inkMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
            <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 20, ...(unread ? font.bold : font.semibold), color: unread ? p.ink : p.inkMuted }}>{title}</Text>
            <Txt variant="caption" tone="subtle">{time}</Txt>
          </View>
          {text ? <Txt tone="muted" numberOfLines={3} style={{ fontSize: 14, lineHeight: 20 }}>{text}</Txt> : null}
        </View>
      </Pressable>
      {action ? <View style={{ paddingLeft: space[4] + 40 + space[3], paddingBottom: space[4], alignItems: 'flex-start' }}>{action}</View> : null}
    </View>
  );
}

// ── Biblioteca e financeiro ─────────────────────────────────────────────────

/** Arquivo da biblioteca (Exercícios, Materiais, Provas anteriores). */
export function FileRow({
  fileType = 'PDF', subject, subjectDot, title, meta, isNew, primaryAction, onOpen, onDownload, compact,
}: {
  fileType?: string; subject?: string | null; subjectDot?: string; title: string; meta?: string[]; isNew?: boolean;
  primaryAction?: React.ReactNode; onOpen?: () => void; onDownload?: () => void; compact?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: space[1], paddingRight: compact ? space[2] : space[3],
      backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.lg, overflow: 'hidden',
    }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${title}`} onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: compact ? space[3] : space[4], padding: space[3], paddingLeft: compact ? space[3] : space[4], backgroundColor: pressed ? p.surfaceSunken : 'transparent' })}>
        <View style={{ width: 44, height: 48, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="file" size={22} color={p.inkMuted} />
          <View style={{ position: 'absolute', bottom: -4, right: -6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: p.surfaceInverse }}>
            <Text style={{ ...font.extrabold, fontSize: 9, lineHeight: 13, letterSpacing: 0.36, color: p.onInverse }}>{fileType}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          {subject || isNew ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              {subject ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjectDot ?? p.inkSubtle }} />
                  <Text numberOfLines={1} style={[type.caption, { ...font.bold, textTransform: 'uppercase', letterSpacing: 0.48, color: p.inkMuted, flexShrink: 1 }]}>{subject}</Text>
                </View>
              ) : null}
              {isNew ? <Tag tone="info" label="Novo" /> : null}
            </View>
          ) : null}
          <Txt variant="titleSm" numberOfLines={compact ? 2 : 1} style={{ fontSize: 15, lineHeight: 20 }}>{title}</Txt>
          {meta?.length ? <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{meta.join('  ·  ')}</Txt> : null}
        </View>
      </Pressable>
      {primaryAction}
      {!compact && onOpen ? <Button variant={primaryAction ? 'ghost' : 'secondary'} size="sm" icon="eye" label="Abrir" onPress={onOpen} /> : null}
      {onDownload ? <IconButton icon="download" label={`Baixar ${title}`} onPress={onDownload} /> : null}
    </View>
  );
}

export type InvoiceStatus = 'paid' | 'open' | 'late';
const INV: Record<InvoiceStatus, { tone: TagTone; icon: IconName; t: string }> = {
  paid: { tone: 'success', icon: 'check', t: 'Pago' },
  open: { tone: 'neutral', icon: 'clock', t: 'Em aberto' },
  late: { tone: 'danger', icon: 'alert', t: 'Atrasado' },
};

/** Cobrança: descrição, vencimento, situação, valor e ação. No celular quebra em duas linhas. */
export function InvoiceRow({
  title, due, paidAt, status, amount, onPay, onReceipt, wide, first,
}: { title: string; due: string; paidAt?: string | null; status: InvoiceStatus; amount: string; onPay?: () => void; onReceipt?: () => void; wide?: boolean; first?: boolean }) {
  const p = usePalette();
  const s = INV[status];
  const meta = status === 'paid' && paidAt ? `Pago em ${paidAt} · venceu ${due}` : `Vence ${due}`;
  const icon = (
    <View style={{ width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: status === 'late' ? p.dangerSoft : p.surfaceSunken }}>
      <Icon name="receipt" size={20} color={status === 'late' ? p.dangerInk : p.inkMuted} />
    </View>
  );
  const action = status === 'paid'
    ? (onReceipt ? <Button variant="ghost" size="sm" icon="download" label="Recibo" onPress={onReceipt} /> : null)
    : (onPay ? <Button variant={status === 'late' ? 'danger' : 'primary'} size="sm" label="Pagar" onPress={onPay} /> : null);
  const amountText = <Text style={{ ...font.extrabold, fontSize: 16, color: p.ink, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{amount}</Text>;
  const border = { borderTopWidth: first ? 0 : 1, borderTopColor: p.line };
  if (wide) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[3], paddingHorizontal: space[4] }, border]}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{title}</Txt>
          <Txt variant="bodySm" tone="subtle">{meta}</Txt>
        </View>
        <Tag tone={s.tone} icon={s.icon} label={s.t} />
        <View style={{ width: 104 }}>{amountText}</View>
        <View style={{ width: 96, alignItems: 'flex-end' }}>{action}</View>
      </View>
    );
  }
  return (
    <View style={[{ flexDirection: 'row', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[4] }, border]}>
      {icon}
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="titleSm" numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>{title}</Txt>
            <Txt variant="bodySm" tone="subtle">{meta}</Txt>
          </View>
          {amountText}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Tag tone={s.tone} icon={s.icon} label={s.t} />
          {action}
        </View>
      </View>
    </View>
  );
}

/** Pacote/matrícula: tipo, código, nome, cobrança e turmas. */
export function PlanCard({ kind = 'Pacote', code, name, billing, classes }: { kind?: string; code?: string | null; name: string; billing?: string | null; classes?: string[] }) {
  const p = usePalette();
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Tag label={kind} />
        {code ? <Txt variant="caption" tone="subtle" style={{ fontVariant: ['tabular-nums'] }}>{code}</Txt> : null}
      </View>
      <Text style={{ ...font.extrabold, fontSize: 17, lineHeight: 22, color: p.ink }}>{name}</Text>
      {billing ? <Txt variant="bodySm" tone="subtle">{billing}</Txt> : null}
      {classes?.length ? (
        <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: p.line, gap: 6 }}>
          {classes.map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="users" size={16} color={p.inkSubtle} />
              <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20, ...font.medium, flex: 1 }}>{c}</Txt>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// ── Agenda ───────────────────────────────────────────────────────────────────

export type EventKind = 'simulado' | 'presencial' | 'tarefa' | 'cobranca' | 'aula' | 'evento' | 'geral';
/** Ponto accent = pede ação até uma data; neutro = informativo. */
export const EVENT_KIND: Record<EventKind, { icon: IconName; label: string; act: boolean }> = {
  simulado: { icon: 'clipboard', label: 'Simulado', act: true },
  presencial: { icon: 'clipboard', label: 'Simulado presencial', act: true },
  tarefa: { icon: 'edit', label: 'Tarefa', act: true },
  cobranca: { icon: 'receipt', label: 'Cobrança', act: true },
  aula: { icon: 'users', label: 'Aula', act: false },
  evento: { icon: 'flag', label: 'Evento da escola', act: false },
  geral: { icon: 'calendar', label: 'Geral', act: false },
};

export type CalendarDayEvents = { kind: EventKind; label: string }[];

/** Mês em grade (Seg→Dom). Compacto (celular): pontos; completo (desktop): até 2 nomes + "+N mais". */
export function MonthCalendar({
  year, month, events, selected, today, onSelect, compact,
}: { year: number; month: number; events: Record<number, CalendarDayEvents>; selected: number | null; today?: number | null; onSelect: (day: number) => void; compact?: boolean }) {
  const p = usePalette();
  const total = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const dows = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {dows.map((w) => <Txt key={w} variant="caption" tone="subtle" style={{ flex: 1, textAlign: 'center' }}>{compact ? w.charAt(0) : w}</Txt>)}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: compact ? 0 : 4 }}>
          {row.map((d, i) => {
            if (d == null) return <View key={`b${i}`} style={{ flex: 1, minWidth: 0, minHeight: compact ? 44 : 92, borderWidth: compact ? 0 : 1, borderColor: 'transparent' }} />;
            const list = events[d] ?? [];
            const on = d === selected;
            const isToday = d === today;
            const past = today != null && d < today;
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${d}${list.length ? `, ${list.length} ${list.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                onPress={() => onSelect(d)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({
                  flex: 1, minWidth: 0, minHeight: compact ? 44 : 92, borderRadius: radius.sm, padding: compact ? 0 : 6,
                  alignItems: compact ? 'center' : 'stretch', justifyContent: compact ? 'center' : 'flex-start', gap: compact ? 3 : 4,
                  backgroundColor: compact ? 'transparent' : on ? p.surfaceSunken : hovered ? p.bg : p.surface,
                  borderWidth: compact ? 0 : 1, borderColor: on ? p.ink : p.line,
                }) as never}>
                <View style={{
                  minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: compact ? 'center' : 'flex-start',
                  backgroundColor: compact && on ? p.surfaceInverse : 'transparent', borderWidth: isToday && !(compact && on) ? 1.5 : 0, borderColor: p.ink,
                }}>
                  <Text style={{ ...(on || isToday ? font.extrabold : font.semibold), fontSize: 14, color: compact && on ? p.onInverse : past ? p.inkSubtle : p.ink, fontVariant: ['tabular-nums'] }}>{d}</Text>
                </View>
                {compact ? (
                  <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                    {list.slice(0, 3).map((e, k) => <View key={k} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: EVENT_KIND[e.kind].act ? p.accent : p.inkSubtle }} />)}
                  </View>
                ) : (
                  <View style={{ gap: 2 }}>
                    {list.slice(0, 2).map((e, k) => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: EVENT_KIND[e.kind].act ? p.accent : p.inkSubtle }} />
                        <Text numberOfLines={1} style={{ ...font.semibold, fontSize: 11, lineHeight: 15, color: p.inkMuted, flex: 1 }}>{e.label}</Text>
                      </View>
                    ))}
                    {list.length > 2 ? <Text style={{ ...font.bold, fontSize: 11, color: p.inkSubtle }}>+{list.length - 2} mais</Text> : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Evento na agenda: hora, ícone pelo tipo, título e ação direta. */
export function EventItem({
  kind, kindLabel, start, end, title, subtitle, action, first,
}: { kind: EventKind; kindLabel?: string; start?: string | null; end?: string | null; title: string; subtitle?: string | null; action?: React.ReactNode; first?: boolean }) {
  const p = usePalette();
  const k = EVENT_KIND[kind];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3], borderTopWidth: first ? 0 : 1, borderTopColor: p.line }}>
      <View style={{ width: 52, paddingTop: 2 }}>
        <Text style={{ ...font.bold, fontSize: 14, lineHeight: 20, color: p.ink, fontVariant: ['tabular-nums'] }}>{start || 'Dia todo'}</Text>
        {end ? <Txt variant="caption" tone="subtle" style={{ fontVariant: ['tabular-nums'] }}>{end}</Txt> : null}
      </View>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: k.act ? p.accentSoft : p.surfaceSunken }}>
        <Icon name={k.icon} size={18} color={k.act ? p.accentInk : p.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt variant="caption" tone="subtle">{kindLabel ?? k.label}</Txt>
        <Txt variant="titleSm" numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>{title}</Txt>
        {subtitle ? <Txt variant="bodySm" tone="subtle" numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {action ? <View style={{ alignSelf: 'center' }}>{action}</View> : null}
    </View>
  );
}

// ── Desempenho ───────────────────────────────────────────────────────────────

export type MonthBar = { label: string; value: number | null; count?: number; current?: boolean };

/** Média por mês: uma série em tinta, valor acima de cada barra e mínimo tracejado. */
export function MonthBars({ data, minimum, height = 160, max = 100 }: { data: MonthBar[]; minimum?: number | null; height?: number; max?: number }) {
  const p = usePalette();
  const plot = height - 22;
  return (
    <View accessibilityRole="image" accessibilityLabel={`Média por mês: ${data.map((m) => `${m.label} ${m.value != null ? `${Math.round(m.value)}%` : 'sem simulado'}`).join(', ')}`} style={{ gap: space[2] }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: space[3], borderBottomWidth: 1, borderBottomColor: p.lineStrong, paddingTop: 22 }}>
        {minimum != null ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: (minimum / max) * plot, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: p.lineStrong, zIndex: 1 }} />
        ) : null}
        {data.map((m, i) => {
          const has = m.value != null;
          return (
            <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
              <Text style={{ ...(has ? font.bold : font.semibold), fontSize: 12, lineHeight: 16, color: has ? p.ink : p.inkSubtle, fontVariant: ['tabular-nums'] }}>{has ? `${Math.round(m.value as number)}%` : '—'}</Text>
              <View style={{
                width: '100%', maxWidth: 48, height: has ? Math.max(2, ((m.value as number) / max) * plot) : 2,
                borderTopLeftRadius: has ? 4 : 1, borderTopRightRadius: has ? 4 : 1, backgroundColor: has ? (m.current ? p.ink : p.inkMuted) : p.line,
              }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        {data.map((m, i) => <Txt key={i} variant="caption" tone={m.current ? 'ink' : 'subtle'} style={{ flex: 1, textAlign: 'center' }}>{m.label}</Txt>)}
      </View>
      {minimum != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 4 }}>
          <View style={{ width: 20, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: p.lineStrong }} />
          <Txt variant="caption" tone="subtle">Mínimo exigido: {minimum}%</Txt>
        </View>
      ) : null}
    </View>
  );
}

/** Disciplina no desempenho: média contra o mínimo e o último simulado. */
export function SubjectScore({
  subject, dot, count, average, last, minimum = 50, first,
}: { subject: string; dot?: string; count: number; average: number; last?: number | null; minimum?: number; first?: boolean }) {
  const p = usePalette();
  const below = average < minimum;
  const up = last != null && last >= average;
  const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d === 1 ? 1 : 0, maximumFractionDigits: d });
  return (
    <View style={{ gap: 10, paddingVertical: space[4], borderTopWidth: first ? 0 : 1, borderTopColor: p.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot ?? p.inkSubtle }} />
          <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>{subject}</Txt>
        </View>
        <Txt variant="bodySm" tone="subtle">{count} {count === 1 ? 'simulado' : 'simulados'}</Txt>
        <View style={{ flex: 1 }} />
        <Text style={{ ...font.extrabold, fontSize: 20, color: p.ink, fontVariant: ['tabular-nums'] }}>{fmt(average)}%</Text>
      </View>
      <ProgressBar value={average} tone={below ? 'danger' : 'ink'} size="sm" marker={minimum} label={`Média ${subject}`} />
      {last != null ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
          <Txt variant="bodySm" tone="muted">Último simulado: <Txt variant="bodySm" style={{ ...font.bold }}>{fmt(last, 1)}%</Txt></Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={up ? 'trend-up' : 'trend-down'} size={16} color={up ? p.success : p.warning} />
            <Txt variant="bodySm" style={{ ...font.semibold, color: up ? p.success : p.warning }}>{up ? 'acima da sua média' : 'abaixo da sua média'}</Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Formulários ─────────────────────────────────────────────────────────────

/** Campo com rótulo sempre visível, 48px, fonte 16px (evita zoom no iPhone). Senha com botão de mostrar; erro em danger. */
export function TextField({
  label, value, onChangeText, placeholder, password, hint, error, icon, autoComplete, keyboardType, onSubmitEditing, returnKeyType, autoFocus,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; password?: boolean; hint?: string | null; error?: string | null;
  icon?: IconName; autoComplete?: TextInputProps['autoComplete']; keyboardType?: TextInputProps['keyboardType'];
  onSubmitEditing?: () => void; returnKeyType?: TextInputProps['returnKeyType']; autoFocus?: boolean;
}) {
  const p = usePalette();
  const [show, setShow] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ ...font.bold, fontSize: 14, lineHeight: 20, color: p.ink }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space[2], height: 48, paddingLeft: space[3], paddingRight: 6, borderRadius: radius.md,
        borderWidth: error || focused ? 2 : 1, borderColor: error ? p.danger : focused ? p.ink : p.lineStrong, backgroundColor: p.surface,
      }}>
        {icon ? <Icon name={icon} size={20} color={p.inkSubtle} /> : null}
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={p.inkSubtle} accessibilityLabel={label}
          secureTextEntry={password && !show} autoCapitalize="none" autoCorrect={false} autoComplete={autoComplete} keyboardType={keyboardType}
          onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType} autoFocus={autoFocus}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[{ flex: 1, minWidth: 0, height: '100%', fontSize: 16, color: p.ink, paddingVertical: 0, ...font.regular }, { outlineStyle: 'none' } as never]} />
        {password ? <IconButton icon="eye" label={show ? 'Esconder senha' : 'Mostrar senha'} color={p.inkMuted} onPress={() => setShow((v) => !v)} style={{ width: 40, height: 40 }} /> : null}
      </View>
      {error || hint ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {error ? <Icon name="alert" size={16} color={p.dangerInk} /> : null}
          <Txt variant="bodySm" style={{ color: error ? p.dangerInk : p.inkSubtle, ...(error ? font.semibold : {}) , flexShrink: 1 }}>{error || hint}</Txt>
        </View>
      ) : null}
    </View>
  );
}

// ── Sessão de prática ───────────────────────────────────────────────────────

export type SessionItemStatus = 'right' | 'wrong' | 'current' | 'skipped' | 'pending';
export type SessionItem = { topic: string; dot?: string; text: string; status: SessionItemStatus; isNew?: boolean; flagged?: boolean };

/** Lista das questões da sessão (Praticar no desktop): assunto, começo do enunciado, "Nova", revisar e o resultado (✓ / ✗). */
export function SessionList({ items, onSelect }: { items: (SessionItem & { index: number })[]; onSelect: (index: number) => void }) {
  const p = usePalette();
  const LABEL: Record<SessionItemStatus, string> = { right: 'Acertou', wrong: 'Errou', current: 'Atual', skipped: 'Pulada', pending: 'A responder' };
  return (
    <View accessibilityLabel="Questões desta sessão" style={{ gap: 2 }}>
      {items.map((q) => {
        const n = q.status === 'right' ? { bg: p.success, fg: p.surface, icon: 'check' as IconName }
          : q.status === 'wrong' ? { bg: p.danger, fg: p.surface, icon: 'x' as IconName }
          : q.status === 'current' ? { bg: p.surfaceInverse, fg: p.onInverse }
          : { bg: 'transparent', fg: p.inkMuted };
        const active = q.status === 'current';
        return (
          <Pressable key={q.index} accessibilityRole="button" accessibilityLabel={`Questão ${q.index + 1}, ${LABEL[q.status]}`} accessibilityState={{ selected: active }}
            onPress={() => onSelect(q.index)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: radius.md,
              backgroundColor: active || hovered || pressed ? p.surfaceSunken : 'transparent', borderWidth: 1.5, borderColor: active ? p.ink : 'transparent',
            }) as never}>
            <View style={{
              width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: n.bg,
              borderWidth: n.bg === 'transparent' ? 1.5 : 0, borderColor: p.lineStrong, borderStyle: q.status === 'skipped' ? 'dashed' : 'solid',
            }}>
              {'icon' in n && n.icon ? <Icon name={n.icon} size={15} strokeWidth={3} color={n.fg} />
                : <Text style={{ ...font.extrabold, fontSize: 12, color: n.fg, fontVariant: ['tabular-nums'] }}>{q.index + 1}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: q.dot ?? p.inkSubtle }} />
                <Text numberOfLines={1} style={{ ...font.bold, fontSize: 13, lineHeight: 18, color: p.ink, flexShrink: 1 }}>{q.topic}</Text>
                {q.isNew ? (
                  <View style={{ height: 18, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: p.info, justifyContent: 'center' }}>
                    <Text style={{ ...font.extrabold, fontSize: 11, color: p.surface }}>Nova</Text>
                  </View>
                ) : null}
                {q.flagged ? <Icon name="flag" size={14} color={p.accentInk} /> : null}
              </View>
              <Text numberOfLines={1} style={{ ...font.regular, fontSize: 13, lineHeight: 18, color: p.inkSubtle }}>{q.text}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
