import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RichText from '../../../components/RichText';
import type { AttemptQuestion, PracticeFeedback } from '../../../services/practice.service';
import { PracticeQuestionView } from './PracticeQuestionView';
import {
  Button, Card, Icon, IconButton, Kbd, ProgressBar, SegmentedControl, SessionList, Tag, Txt, font, layout, radius, space, subjectColor,
  useLayoutMode, usePalette, type IconName, type SessionItemStatus,
} from '../../../ui';

const LETTERS = 'ABCDEFGHIJ';
const LEFT_W = 300;
const RIGHT_W = 320;

export type PracticePrimary = { label: string; icon?: IconName; iconRight?: IconName; onPress: () => void; loading?: boolean; disabled?: boolean };

type Props = {
  attemptId: number;
  title: string;
  questions: AttemptQuestion[];
  index: number;
  onGoTo: (i: number) => void;
  answers: Record<number, number>;
  feedbacks: Record<number, PracticeFeedback>;
  onSelect: (questionId: number, optionId: number) => void;
  /** Questões marcadas para revisar (1 = primeira). */
  flagged: number[];
  onToggleFlag: () => void;
  saved: boolean;
  onToggleSave: () => void;
  primary: PracticePrimary | null;
  canSkip: boolean;
  onLeave: () => void;
  onFinish: () => void;
  finishing: boolean;
  /** Tempo gasto na sessão (s) e, se houver cronômetro, o que falta. */
  elapsed: number | null;
  remaining: number | null;
  busy: boolean;
  error?: React.ReactNode;
};

function clock(total: number) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
const plain = (html: string | null | undefined) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Calculadora simples (+ − × ÷) sem eval: respeita a precedência de × e ÷. */
function calculate(expr: string): string {
  const tokens = expr.match(/(\d+[.,]?\d*|[+\-×÷])/g);
  if (!tokens) return '';
  const nums: number[] = [];
  const ops: string[] = [];
  tokens.forEach((t) => (/[+\-×÷]/.test(t) && t.length === 1 ? ops.push(t) : nums.push(parseFloat(t.replace(',', '.')))));
  if (nums.length !== ops.length + 1 || nums.some(Number.isNaN)) return 'Erro';
  for (let i = 0; i < ops.length;) {
    if (ops[i] === '×' || ops[i] === '÷') {
      if (ops[i] === '÷' && nums[i + 1] === 0) return 'Erro';
      nums.splice(i, 2, ops[i] === '×' ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1]);
      ops.splice(i, 1);
    } else i++;
  }
  const result = ops.reduce((acc, op, i) => (op === '+' ? acc + nums[i + 1] : acc - nums[i + 1]), nums[0]);
  return Number.isFinite(result) ? String(Math.round(result * 1e8) / 1e8).replace('.', ',') : 'Erro';
}

function Calculator({ onClose }: { onClose: () => void }) {
  const p = usePalette();
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const press = (k: string) => {
    if (k === 'C') { setExpr(''); setResult(''); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); return; }
    if (k === '=') { setResult(calculate(expr)); return; }
    setExpr((e) => (result && !/[+\-×÷]/.test(k) ? k : (result ? result + k : e + k)));
    setResult('');
  };
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', ',', '=', '+'];
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="calc" size={18} color={p.inkMuted} /><Txt variant="label" style={{ ...font.extrabold }}>Calculadora</Txt></View>
        <IconButton icon="x" label="Fechar calculadora" onPress={onClose} />
      </View>
      <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken, minHeight: 60, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{expr || '0'}</Txt>
        <Text style={{ ...font.extrabold, fontSize: 22, color: p.ink, fontVariant: ['tabular-nums'] }}>{result || ' '}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}><Button size="sm" variant="secondary" block label="C" onPress={() => press('C')} /></View>
        <View style={{ flex: 1 }}><Button size="sm" variant="secondary" block label="⌫" onPress={() => press('⌫')} /></View>
      </View>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
          {keys.slice(r * 4, r * 4 + 4).map((k) => (
            <View key={k} style={{ flex: 1 }}>
              <Button size="sm" block variant={k === '=' ? 'primary' : 'secondary'} label={k} onPress={() => press(k === '−' ? '-' : k)} />
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

/**
 * Praticar no desktop (protótipo "DesktopPraticar"): sessão à esquerda, questão no meio, ajuda à direita.
 * Abaixo de 1360px a coluna da direita vira a aba "Ajuda" na coluna da questão.
 */
export function PracticeDesktop(props: Props) {
  const {
    attemptId, title, questions, index, onGoTo, answers, feedbacks, onSelect, flagged, onToggleFlag, saved, onToggleSave,
    primary, canSkip, onLeave, onFinish, finishing, elapsed, remaining, busy, error,
  } = props;
  const p = usePalette();
  const { isWide } = useLayoutMode();
  const current = questions[index];
  const feedback = current ? feedbacks[current.id] ?? null : null;

  const [filter, setFilter] = useState<'all' | 'open' | 'review'>('all');
  const [tab, setTab] = useState<'question' | 'help'>('question');
  const [eliminated, setEliminated] = useState<Record<number, number[]>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [bigText, setBigText] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const draftKey = `banco_sessao_rascunho_${attemptId}`;

  // Rascunho: salvo no aparelho, por questão desta sessão.
  useEffect(() => {
    AsyncStorage.getItem(draftKey).then((raw) => { if (raw) setDrafts(JSON.parse(raw)); }).catch(() => undefined);
  }, [draftKey]);
  const setDraft = (text: string) => {
    if (!current) return;
    setDrafts((prev) => {
      const next = { ...prev, [current.id]: text };
      AsyncStorage.setItem(draftKey, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };
  const toggleEliminated = (optionId: number) => {
    if (!current) return;
    setEliminated((prev) => {
      const list = prev[current.id] ?? [];
      return { ...prev, [current.id]: list.includes(optionId) ? list.filter((x) => x !== optionId) : [...list, optionId] };
    });
  };

  // X risca a alternativa marcada.
  useEffect(() => {
    if (Platform.OS !== 'web' || !current) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((event.key === 'x' || event.key === 'X') && !feedback && answers[current.id] != null) toggleEliminated(answers[current.id]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { setTab('question'); }, [index]);

  const statusOf = (q: AttemptQuestion, i: number): SessionItemStatus => {
    const f = feedbacks[q.id];
    if (f) return f.is_correct ? 'right' : 'wrong';
    if (i === index) return 'current';
    return i < index ? 'skipped' : 'pending';
  };
  const items = useMemo(() => questions.map((q, i) => ({
    index: i, topic: q.topics[0] ?? q.subject?.name ?? 'Questão', dot: q.subject ? subjectColor(p, q.subject.id) : undefined,
    text: plain(q.question_text) || 'Questão com imagem', status: statusOf(q, i), isNew: !!q.is_new && !feedbacks[q.id], flagged: flagged.includes(i + 1),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statusOf depende de index/feedbacks
  })), [questions, feedbacks, index, flagged, p]);
  const visible = items.filter((it) => filter === 'all' || (filter === 'open' ? it.status !== 'right' && it.status !== 'wrong' : it.flagged));
  const right = items.filter((i) => i.status === 'right').length;
  const wrong = items.filter((i) => i.status === 'wrong').length;
  const done = right + wrong;
  const subjectDot = current?.subject ? subjectColor(p, current.subject.id) : p.inkSubtle;
  const origin = [current?.exam_title || current?.source_exam_name, current?.year].filter(Boolean).join(' · ');
  const lastLetter = LETTERS[Math.max(0, (current?.options.length ?? 4) - 1)];
  const isFlagged = flagged.includes(index + 1);

  const row = (k: string, v: string) => (
    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
      <Txt tone="muted" style={{ fontSize: 14 }}>{k}</Txt>
      <Txt variant="label" numberOfLines={2} style={{ flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</Txt>
    </View>
  );
  const cardHead = (icon: IconName, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon name={icon} size={18} color={p.inkMuted} />
      <Txt variant="label" style={{ ...font.extrabold }}>{label}</Txt>
    </View>
  );

  const help = current ? (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 10 }}>
        {cardHead('alert', 'Sobre esta questão')}
        {row('Turma que acerta', current.class_rate != null ? `${current.class_rate}%` : 'Poucos dados')}
        {row('Seu acerto no assunto', current.topic_score && current.topic_score.total ? `${current.topic_score.right} de ${current.topic_score.total}` : 'Ainda sem respostas')}
        {row('Dificuldade', current.difficulty ?? '—')}
        {row('Origem', origin || '—')}
      </Card>
      <Card style={{ gap: 10 }}>
        {cardHead('message', 'Resolução comentada')}
        {feedback ? (
          feedback.explanation
            ? <Txt tone="muted" style={{ fontSize: 14, lineHeight: 21 }}><RichText value={feedback.explanation} /></Txt>
            : <Txt tone="subtle" style={{ fontSize: 14 }}>O professor ainda não comentou esta questão.</Txt>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: space[3], borderRadius: 10, backgroundColor: p.surfaceSunken }}>
            <Icon name="key" size={18} color={p.inkSubtle} />
            <Txt tone="muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>Aparece aqui assim que você responder. Tente primeiro sozinho!</Txt>
          </View>
        )}
      </Card>
      <Card style={{ gap: 10 }}>
        {cardHead('edit', 'Rascunho')}
        <TextInput multiline value={drafts[current.id] ?? ''} onChangeText={setDraft} placeholder="Faça as contas aqui. Ex.: 4 + 5 + 3…"
          placeholderTextColor={p.inkSubtle} accessibilityLabel="Rascunho" textAlignVertical="top"
          style={{ minHeight: 110, borderWidth: 1, borderColor: p.lineStrong, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, lineHeight: 20, color: p.ink, backgroundColor: p.surface, ...font.regular }} />
        <Txt variant="caption" tone="subtle" style={{ ...font.medium }}>Fica salvo só nesta questão, neste aparelho.</Txt>
      </Card>
      <Card style={{ gap: 10 }}>
        {cardHead('sparkle', 'Ferramentas')}
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant={calcOpen ? 'primary' : 'secondary'} size="sm" icon="calc" label="Calculadora" onPress={() => setCalcOpen((v) => !v)} />
          <Button variant={bigText ? 'primary' : 'secondary'} size="sm" icon="zoom" label={bigText ? 'Letra normal' : 'Letra maior'} onPress={() => setBigText((v) => !v)} />
        </View>
      </Card>
      {calcOpen ? <Calculator onClose={() => setCalcOpen(false)} /> : null}
    </View>
  ) : null;

  const question = current ? (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Txt variant="caption" tone="subtle" style={{ fontSize: 13, ...font.extrabold, letterSpacing: 0.52, textTransform: 'uppercase' }}>Questão {index + 1} de {questions.length}</Txt>
          <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{[`#${current.id}`, origin].filter(Boolean).join(' · ')}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <IconButton icon="flag" label={isFlagged ? 'Desmarcar revisão' : 'Marcar para revisar'} color={isFlagged ? p.accentInk : undefined}
            style={isFlagged ? { backgroundColor: p.accentSoft } : undefined} onPress={onToggleFlag} />
          <IconButton icon="bookmark" label={saved ? 'Remover das salvas' : 'Salvar questão'} color={saved ? p.brandInk : undefined} onPress={onToggleSave} />
        </View>
      </View>
      <PracticeQuestionView question={current} selectedId={answers[current.id] ?? null} onSelect={(optionId) => onSelect(current.id, optionId)}
        feedback={feedback} disabled={busy} isNew={!!current.is_new && !feedback} hideHeader hideExplanation={isWide}
        eliminated={eliminated[current.id] ?? []} onEliminate={toggleEliminated} textScale={bigText ? 1.2 : 1} onZoomImage={setZoom} />
      {error}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 6, paddingTop: space[4], borderTopWidth: 1, borderTopColor: p.line }}>
        <Button variant="ghost" icon="arrow-left" label="Anterior" disabled={index === 0} onPress={() => onGoTo(index - 1)} />
        {canSkip ? <Button variant="ghost" label="Pular" onPress={() => onGoTo(index + 1)} /> : null}
        <View style={{ flex: 1 }} />
        {primary?.disabled ? <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>Escolha uma alternativa</Txt> : null}
        {primary ? <Button size="lg" icon={primary.icon} iconRight={primary.iconRight ?? (primary.icon ? undefined : 'arrow-right')} label={primary.label}
          loading={primary.loading} disabled={primary.disabled} onPress={primary.onPress} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Kbd>A</Kbd><Txt variant="bodySm" tone="subtle">–</Txt><Kbd>{lastLetter}</Kbd><Txt variant="bodySm" tone="subtle"> marcar   </Txt>
        <Kbd>X</Kbd><Txt variant="bodySm" tone="subtle"> riscar   </Txt>
        <Kbd>Enter</Kbd><Txt variant="bodySm" tone="subtle">{feedback ? ' próxima   ' : ' responder   '}</Txt>
        <Kbd>R</Kbd><Txt variant="bodySm" tone="subtle"> revisar depois   </Txt>
        <Kbd>←</Kbd><Kbd>→</Kbd><Txt variant="bodySm" tone="subtle"> navegar</Txt>
      </View>
    </View>
  ) : <Txt tone="subtle">Esta sessão não tem questões disponíveis no momento.</Txt>;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {/* Topo: sair · matéria e progresso · tempo e acertos */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 64, backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <View style={{ width: LEFT_W, paddingHorizontal: space[3], alignItems: 'flex-start' }}>
          <Button variant="ghost" size="sm" icon="x" label="Pausar e sair" onPress={onLeave} />
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingHorizontal: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], maxWidth: '100%' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjectDot }} />
            <Txt variant="label" numberOfLines={1} style={{ ...font.bold, flexShrink: 1 }}>Prática · {title}</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], width: '100%', maxWidth: 520 }}>
            <View style={{ flex: 1 }}><ProgressBar value={done} max={questions.length || 1} size="sm" label="Progresso" /></View>
            <Txt variant="caption" tone="subtle" style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{done} de {questions.length}</Txt>
          </View>
        </View>
        <View style={{ width: RIGHT_W, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space[3], paddingHorizontal: 20 }}>
          {remaining != null || elapsed != null ? (
            <View accessibilityLabel={remaining != null ? 'Tempo restante' : 'Tempo nesta sessão'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={18} color={remaining != null && remaining <= 60 ? p.dangerInk : p.inkMuted} />
              <Txt variant="label" style={{ ...font.bold, color: remaining != null && remaining <= 60 ? p.dangerInk : p.inkMuted, fontVariant: ['tabular-nums'] }}>
                {clock(remaining ?? elapsed ?? 0)}
              </Txt>
            </View>
          ) : null}
          <Tag tone="success" icon="check" label={`${right} ${right === 1 ? 'acerto' : 'acertos'}`} />
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        {/* Esquerda: a sessão */}
        <View style={{ width: LEFT_W, backgroundColor: p.surface, borderRightWidth: 1, borderRightColor: p.line }}>
          <View style={{ padding: space[4], paddingBottom: space[3], gap: 10, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Txt variant="titleSm" style={{ fontSize: 15 }}>Sua sessão</Txt>
              <Txt variant="caption" tone="subtle" style={{ ...font.medium }}>{done} de {questions.length} respondidas</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone="success" icon="check" label={`${right} ${right === 1 ? 'certa' : 'certas'}`} />
              <Tag icon="x" label={`${wrong} ${wrong === 1 ? 'errada' : 'erradas'}`} />
              <Tag tone="outline" icon="flag" label={`${flagged.length} para revisar`} />
            </View>
            <SegmentedControl label="Filtrar lista" options={['Todas', 'A fazer', 'Revisar']} value={['all', 'open', 'review'].indexOf(filter)}
              onChange={(i) => setFilter((['all', 'open', 'review'] as const)[i])} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[2] }}>
            {visible.length ? <SessionList items={visible} onSelect={onGoTo} />
              : <Txt variant="bodySm" tone="subtle" style={{ padding: space[3] }}>{filter === 'review' ? 'Nenhuma questão marcada para revisar.' : 'Você respondeu todas.'}</Txt>}
          </ScrollView>
          <View style={{ padding: space[3], paddingHorizontal: space[4], borderTopWidth: 1, borderTopColor: p.line }}>
            <Button variant="secondary" block icon="check" label="Finalizar sessão" loading={finishing} onPress={onFinish} />
          </View>
        </View>

        {/* Meio: a questão (e a aba Ajuda abaixo de 1360px) */}
        <ScrollView style={{ flex: 1, minWidth: 0 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingTop: 28, paddingHorizontal: space[8], paddingBottom: 40, gap: space[4] }}>
            {!isWide ? (
              <View style={{ maxWidth: 280 }}>
                <SegmentedControl label="Questão ou ajuda" options={['Questão', 'Ajuda']} value={tab === 'question' ? 0 : 1} onChange={(i) => setTab(i ? 'help' : 'question')} />
              </View>
            ) : null}
            {isWide || tab === 'question' ? question : help}
          </View>
        </ScrollView>

        {/* Direita: ajuda e ferramentas */}
        {isWide ? (
          <ScrollView style={{ width: RIGHT_W, flexGrow: 0, borderLeftWidth: 1, borderLeftColor: p.line }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
            {help}
          </ScrollView>
        ) : null}
      </View>

      {/* Imagem ampliada */}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable accessibilityLabel="Fechar imagem" onPress={() => setZoom(null)} style={{ flex: 1, backgroundColor: p.scrim, alignItems: 'center', justifyContent: 'center', padding: space[8] }}>
          {zoom ? <Image source={{ uri: zoom }} resizeMode="contain" accessibilityLabel="Imagem do enunciado ampliada" style={{ width: '100%', height: '100%', maxWidth: 1100, borderRadius: radius.md, backgroundColor: p.surface }} /> : null}
          <View style={{ position: 'absolute', top: space[4], right: space[4] }}><IconButton icon="x" label="Fechar imagem" variant="outline" style={{ backgroundColor: p.surface }} onPress={() => setZoom(null)} /></View>
        </Pressable>
      </Modal>
    </View>
  );
}
