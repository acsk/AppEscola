import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import ConfirmModal from '../../../components/ConfirmModal';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { PracticeFeedback } from '../../../services/practice.service';
import { useAnswerInAttempt, useFinishAttempt, usePracticeAttempt, useStartQuestionSet, useToggleSavedQuestion } from '../hooks';
import { PracticeQuestionView } from '../components/PracticeQuestionView';
import { formatPercent } from '../lib/format';
import { font,
  BottomBar, Button, Card, Icon, IconButton, Kbd, Notice, Overline, ProgressBar, QuestionNavigator, ScreenBody, Sheet, Txt,
  layout, space, type, useLayoutMode, usePalette, Tag, subjectColor, type IconName,
} from '../../../ui';

type Props = NativeStackScreenProps<QuestoesStackParamList, 'BancoSimulado'>;

const LETTERS = 'ABCDEFGHIJ';
const timerKey = (attemptId: number) => `banco_sessao_tempo_${attemptId}`;

function formatClock(total: number) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * Sessão do banco e simulado do banco (protótipos "TelaResponderQuestao" e "DesktopResponder").
 * Correção a cada questão (confirma e vê o gabarito) ou no final; cronômetro opcional que só corre com a tela aberta.
 */
export function BancoSimuladoScreen({ route, navigation }: Props) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useLayoutMode();
  const [attemptId, setAttemptId] = useState<number | null>(route.params.attemptId ?? null);
  const start = useStartQuestionSet();
  const attempt = usePracticeAttempt(attemptId);
  const answer = useAnswerInAttempt(attemptId ?? 0);
  const finish = useFinishAttempt(attemptId ?? 0);
  const toggleSaved = useToggleSavedQuestion();

  /** Alternativa marcada (no modo "a cada questão", ainda não confirmada até ter feedback). */
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, PracticeFeedback>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const timeUpRef = useRef(false);

  useEffect(() => {
    if (attemptId == null && route.params.setId) {
      start.mutate(route.params.setId, {
        onSuccess: (payload) => setAttemptId(payload.attempt.id),
        onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível abrir o simulado.')),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inicia uma vez ao abrir
  }, []);

  const payload = attempt.data;
  const questions = payload?.questions ?? [];
  const finished = !!payload?.attempt.finished_at;
  const eachMode = payload?.attempt.correction_mode === 'each';
  const limit = payload?.attempt.seconds_per_question ? payload.attempt.seconds_per_question * (payload.attempt.question_count || questions.length) : null;
  const title = payload?.attempt.title ?? payload?.question_set?.title ?? route.params.title ?? 'Sessão de questões';

  // Sincroniza respostas, correções e salvas com o que veio da API.
  useEffect(() => {
    if (!payload) return;
    setAnswers(Object.fromEntries(payload.questions.filter((q) => q.selected_option_id != null).map((q) => [q.id, q.selected_option_id as number])));
    setFeedbacks(Object.fromEntries(payload.questions.filter((q) => q.correct_option_id != null).map((q) => [q.id, {
      is_correct: q.is_correct ?? null, correct_option_id: q.correct_option_id ?? null, explanation: q.explanation ?? null,
    }])));
    setSaved(Object.fromEntries(payload.questions.map((q) => [q.id, !!q.saved])));
  }, [payload]);

  // Retoma na primeira questão sem resposta.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!payload || resumedRef.current) return;
    resumedRef.current = true;
    if (payload.attempt.finished_at) return;
    const firstOpen = payload.questions.findIndex((q) => q.selected_option_id == null);
    if (firstOpen > 0) setIndex(firstOpen);
  }, [payload]);

  // Cronômetro: tempo gasto fica salvo por tentativa, então pausar de fato pausa.
  useEffect(() => {
    if (!limit || finished || attemptId == null) return;
    AsyncStorage.getItem(timerKey(attemptId)).then((raw) => setElapsed(Number(raw) || 0)).catch(() => setElapsed(0));
  }, [limit, finished, attemptId]);
  useEffect(() => {
    if (!limit || finished || elapsed == null || attemptId == null) return;
    if (elapsed >= limit) {
      if (!timeUpRef.current) {
        timeUpRef.current = true;
        doFinish();
      }
      return;
    }
    const id = setTimeout(() => {
      const next = elapsed + 1;
      setElapsed(next);
      if (next % 5 === 0) AsyncStorage.setItem(timerKey(attemptId), String(next)).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doFinish usa o estado atual
  }, [elapsed, limit, finished, attemptId]);

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    setError(null);
    (scrollRef.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void })?.scrollTo?.({ y: 0, animated: false });
  };

  const current = questions[Math.min(index, Math.max(0, questions.length - 1))];
  const currentFeedback = current ? (feedbacks[current.id] ?? null) : null;
  const isLast = index >= questions.length - 1;

  /** Correção no final: grava assim que marca. A cada questão: só marca; grava ao confirmar. */
  const select = (questionId: number, optionId: number) => {
    if (finished || feedbacks[questionId]) return;
    const previous = answers[questionId];
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setError(null);
    if (eachMode) return;
    answer.mutate({ questionId, optionId }, {
      onError: (cause) => {
        setAnswers((prev) => {
          const next = { ...prev };
          if (previous == null) delete next[questionId];
          else next[questionId] = previous;
          return next;
        });
        setError(getApiErrorMessage(cause, 'Não foi possível salvar a resposta. Tente de novo.'));
      },
    });
  };

  const confirmAnswer = () => {
    if (!current || answers[current.id] == null) return;
    const questionId = current.id;
    answer.mutate({ questionId, optionId: answers[questionId] }, {
      onSuccess: (res) => { if (res.feedback) setFeedbacks((prev) => ({ ...prev, [questionId]: res.feedback as PracticeFeedback })); },
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível confirmar a resposta. Tente de novo.')),
    });
  };

  function doFinish() {
    setConfirmFinish(false);
    setMapOpen(false);
    finish.mutate(undefined, {
      onSuccess: () => {
        setIndex(0);
        if (attemptId != null) AsyncStorage.removeItem(timerKey(attemptId)).catch(() => undefined);
      },
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível finalizar.')),
    });
  }

  const toggleSave = () => {
    if (!current) return;
    const next = !saved[current.id];
    setSaved((prev) => ({ ...prev, [current.id]: next }));
    toggleSaved.mutate({ questionId: current.id, saved: next }, {
      onError: () => setSaved((prev) => ({ ...prev, [current.id]: !next })),
    });
  };
  const toggleFlag = () => setFlagged((prev) => (prev.includes(index + 1) ? prev.filter((n) => n !== index + 1) : [...prev, index + 1]));

  const leave = () => {
    if (attemptId != null && elapsed != null) AsyncStorage.setItem(timerKey(attemptId), String(elapsed)).catch(() => undefined);
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('BancoQuestoes');
  };

  const answeredCount = questions.filter((q) => (eachMode ? !!feedbacks[q.id] : answers[q.id] != null)).length;
  const waitingConfirm = !!current && eachMode && !finished && answers[current.id] != null && !currentFeedback;

  /** Ação principal: confirmar → próxima → finalizar. */
  type Primary = { label: string; icon?: IconName; iconRight?: IconName; onPress: () => void; loading?: boolean; disabled?: boolean };
  const primary: Primary | null = (() => {
    if (!current) return null;
    if (finished) return isLast ? { label: 'Concluir revisão', icon: 'check', onPress: leave } : { label: 'Próxima questão', iconRight: 'arrow-right', onPress: () => goTo(index + 1) };
    if (eachMode) {
      // Protótipo "Praticar": responde, vê a correção e segue; o botão fica desabilitado até escolher.
      if (!currentFeedback) return { label: isDesktop ? 'Responder' : 'Confirmar resposta', onPress: confirmAnswer, loading: answer.isPending, disabled: answers[current.id] == null };
      if (isLast) return { label: 'Ver resultado', icon: 'check', onPress: () => (answeredCount < questions.length ? setConfirmFinish(true) : doFinish()), loading: finish.isPending };
      return { label: 'Próxima questão', iconRight: 'arrow-right', onPress: () => goTo(index + 1) };
    }
    if (isLast) return { label: 'Finalizar e ver correção', icon: 'check', onPress: () => setConfirmFinish(true), loading: finish.isPending };
    return { label: answers[current.id] != null ? 'Próxima questão' : 'Pular', iconRight: 'arrow-right', onPress: () => goTo(index + 1) };
  })();
  /** "Pular" ao lado do botão principal enquanto a questão não foi respondida (sessões). */
  const canSkip = !!current && eachMode && !finished && !currentFeedback && !isLast;
  /** Sessão de prática em andamento (correção a cada questão): layout "Praticar", sem mapa. */
  const practicing = eachMode && !finished;

  // Teclado (web): A–E marca, Enter confirma/avança, ←/→ navega, R revisar depois, S salvar.
  useEffect(() => {
    if (Platform.OS !== 'web' || !current) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight') goTo(index + 1);
      else if (event.key === 'ArrowLeft') goTo(index - 1);
      else if (event.key === 'Enter') { if (primary && !primary.disabled) primary.onPress(); }
      else if (event.key === 'r' || event.key === 'R') toggleFlag();
      else if (event.key === 's' || event.key === 'S') toggleSave();
      else {
        const op = current.options[LETTERS.indexOf(event.key.toUpperCase())];
        if (op) select(current.id, op.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Abrindo / erro ──
  if ((attemptId == null && !error) || (attempt.isLoading && attemptId != null)) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        <ActivityIndicator size="large" color={p.brand} />
        <Txt tone="subtle">Abrindo questões…</Txt>
      </View>
    );
  }
  if (!payload) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + space[2] }}>
        <View style={{ paddingHorizontal: space[2] }}><IconButton icon="x" label="Fechar" onPress={leave} /></View>
        <ScreenBody gap={space[3]}>
          <Notice tone="danger" title="Não foi possível abrir" text={error ?? getApiErrorMessage(attempt.error, 'Tente de novo.')} />
          {attemptId != null ? <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => attempt.refetch()} /> : null}
        </ScreenBody>
      </View>
    );
  }

  const total = payload.attempt.question_count || questions.length;
  const correct = payload.attempt.correct_count ?? 0;
  const remaining = limit != null && elapsed != null ? limit - elapsed : null;
  const urgent = remaining != null && remaining <= 60;
  const answeredIdx = questions.map((q, i) => (answers[q.id] != null ? i + 1 : 0)).filter(Boolean);
  const rightIdx = questions.map((q, i) => (feedbacks[q.id]?.is_correct ? i + 1 : 0)).filter(Boolean);
  const wrongIdx = questions.map((q, i) => (feedbacks[q.id] && !feedbacks[q.id].is_correct ? i + 1 : 0)).filter(Boolean);
  const isSaved = current ? !!saved[current.id] : false;
  const lastLetter = LETTERS[Math.max(0, (current?.options.length ?? 4) - 1)];

  const resultCard = finished ? (
    <Card padding="lg" style={{ gap: space[2] }}>
      <Txt variant="bodySm" tone="muted">Resultado</Txt>
      <Text style={[type.display, { color: p.ink }]}>{correct} de {total}</Text>
      <ProgressBar value={total ? (correct / total) * 100 : 0} tone={total && correct / total >= 0.7 ? 'success' : 'danger'} label="Acertos" />
      <Txt variant="bodySm" tone="subtle">{formatPercent(total ? (correct / total) * 100 : null)} de acerto · revise cada questão abaixo</Txt>
    </Card>
  ) : null;

  const questionView = current ? (
    <PracticeQuestionView question={current} selectedId={answers[current.id] ?? null} onSelect={(optionId) => select(current.id, optionId)}
      feedback={finished || eachMode ? currentFeedback : null} disabled={finish.isPending || (eachMode && answer.isPending)} isNew={!!current.is_new && !currentFeedback} />
  ) : <Txt tone="subtle">Esta sessão não tem questões disponíveis no momento.</Txt>;

  const errorNotice = error ? <Notice tone="danger" title="Algo deu errado" text={error} /> : null;
  const navigator = (
    <QuestionNavigator total={questions.length} current={index + 1} flagged={flagged}
      answered={finished || eachMode ? [] : answeredIdx} right={finished || eachMode ? rightIdx : []} wrong={finished || eachMode ? wrongIdx : []}
      onSelect={(n) => { goTo(n - 1); setMapOpen(false); }} />
  );
  const finishModal = (
    <ConfirmModal
      visible={confirmFinish}
      title={eachMode ? 'Encerrar a sessão?' : 'Finalizar e ver a correção?'}
      message={answeredCount < questions.length
        ? `Você respondeu ${answeredCount} de ${questions.length}. As não respondidas contam como erro.`
        : eachMode ? 'Você verá o resultado da sessão.' : 'Depois de finalizar, não dá para mudar as respostas.'}
      confirmLabel="Finalizar"
      onConfirm={doFinish}
      onCancel={() => setConfirmFinish(false)}
    />
  );
  const timer = remaining != null && !finished ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="clock" size={18} color={urgent ? p.dangerInk : p.inkMuted} />
      <Txt variant="titleSm" style={{ fontSize: 15, color: urgent ? p.dangerInk : p.inkMuted, fontVariant: ['tabular-nums'] }}>{formatClock(remaining)}</Txt>
    </View>
  ) : null;

  // ── Desktop, sessão de prática (protótipo "DesktopPraticar"): leitura central, progresso e acertos no topo ──
  if (isDesktop && practicing) {
    const subjectDot = current?.subject ? subjectColor(p, current.subject.id) : p.inkSubtle;
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], paddingVertical: space[3], paddingHorizontal: space[6], backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Button variant="ghost" size="sm" icon="x" label="Sair" onPress={leave} />
          </View>
          <View style={{ width: 560, maxWidth: '50%', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjectDot }} />
              <Txt variant="label" numberOfLines={1} style={{ ...font.bold, flexShrink: 1 }}>{title}</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}><ProgressBar value={Math.min(index + 1, questions.length)} max={questions.length || 1} size="sm" label="Progresso" /></View>
              <Txt variant="caption" tone="subtle" style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{index + 1} de {questions.length}</Txt>
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space[4] }}>
            {timer}
            <Tag tone="success" icon="check" label={`${rightIdx.length} ${rightIdx.length === 1 ? 'acerto' : 'acertos'}`} />
          </View>
        </View>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingTop: space[8], paddingHorizontal: space[6], paddingBottom: 48, gap: space[4] }}>
            {questionView}
            {errorNotice}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[2] }}>
              {canSkip ? <Button variant="ghost" label="Pular" onPress={() => goTo(index + 1)} /> : null}
              <View style={{ flex: 1 }} />
              {primary?.disabled ? <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>Escolha uma alternativa</Txt> : null}
              {primary ? <Button size="lg" icon={primary.icon} iconRight={primary.iconRight} label={primary.label} loading={primary.loading} disabled={primary.disabled} onPress={primary.onPress} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Kbd>A</Kbd><Txt variant="bodySm" tone="subtle">–</Txt><Kbd>{lastLetter}</Kbd><Txt variant="bodySm" tone="subtle"> marcar   </Txt>
              <Kbd>Enter</Kbd><Txt variant="bodySm" tone="subtle">{currentFeedback ? ' próxima   ' : ' responder   '}</Txt>
              <Kbd>S</Kbd><Txt variant="bodySm" tone="subtle"> salvar</Txt>
            </View>
          </View>
        </ScrollView>
        {finishModal}
      </View>
    );
  }

  // ── Desktop (protótipo "DesktopResponder"): modo foco ──
  if (isDesktop) {
    const about: [string, string][] = current ? [
      ['Disciplina', current.subject?.name ?? '—'],
      ['Assunto', current.topics[0] ?? '—'],
      ['Dificuldade', current.difficulty ?? '—'],
      ['Origem', current.source_exam_name ?? '—'],
    ] : [];
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], paddingVertical: space[3], paddingHorizontal: space[6], backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Button variant="ghost" size="sm" icon="x" label={finished ? 'Sair' : 'Pausar e sair'} onPress={leave} />
          </View>
          <View style={{ width: 560, maxWidth: '50%', gap: 6 }}>
            <Txt variant="label" numberOfLines={1} style={{ textAlign: 'center', ...font.bold }}>{title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}><ProgressBar value={finished ? index + 1 : answeredCount} max={questions.length || 1} size="sm" label="Progresso" /></View>
              <Txt variant="caption" tone="subtle" style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{finished ? index + 1 : answeredCount} de {questions.length}</Txt>
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space[4] }}>
            {timer}
            {!finished ? <Button variant="secondary" size="sm" label="Finalizar" loading={finish.isPending} onPress={() => setConfirmFinish(true)} /> : null}
          </View>
        </View>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 48, paddingTop: space[8], paddingHorizontal: space[8], paddingBottom: 48 }}>
            <View style={{ flex: 1, maxWidth: layout.readingMax, gap: 18 }}>
              {index === 0 ? resultCard : null}
              <Txt variant="caption" tone="subtle" style={{ fontSize: 13, ...font.bold, letterSpacing: 0.52, textTransform: 'uppercase' }}>Questão {index + 1}</Txt>
              {questionView}
              {errorNotice}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 6 }}>
                <Button variant="ghost" icon="arrow-left" label="Anterior" disabled={index === 0} onPress={() => goTo(index - 1)} />
                {!finished ? <Button variant="ghost" icon="flag" label={flagged.includes(index + 1) ? 'Desmarcar revisão' : 'Revisar depois'} onPress={toggleFlag} /> : null}
                <View style={{ flex: 1 }} />
                {canSkip ? <Button variant="ghost" label="Pular" onPress={() => goTo(index + 1)} /> : null}
                {primary ? <Button size="lg" icon={primary.icon} iconRight={primary.iconRight} label={primary.label} loading={primary.loading} disabled={primary.disabled} onPress={primary.onPress} /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {!finished ? <><Kbd>A</Kbd><Txt variant="bodySm" tone="subtle">–</Txt><Kbd>{lastLetter}</Kbd><Txt variant="bodySm" tone="subtle"> marcar   </Txt></> : null}
                <Kbd>Enter</Kbd><Txt variant="bodySm" tone="subtle">{waitingConfirm ? ' confirmar   ' : ' avançar   '}</Txt>
                {!finished ? <><Kbd>R</Kbd><Txt variant="bodySm" tone="subtle"> revisar depois   </Txt></> : null}
                <Kbd>S</Kbd><Txt variant="bodySm" tone="subtle"> salvar   </Txt>
                <Kbd>←</Kbd><Kbd>→</Kbd><Txt variant="bodySm" tone="subtle"> navegar</Txt>
              </View>
            </View>
            <View style={{ width: layout.asideW, gap: space[4] }}>
              <Card style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt variant="titleSm">Questões</Txt>
                  <Txt variant="caption" tone="subtle">
                    {finished || eachMode ? `${rightIdx.length} ${rightIdx.length === 1 ? 'certa' : 'certas'} · ${wrongIdx.length} ${wrongIdx.length === 1 ? 'errada' : 'erradas'}` : `${answeredCount} respondidas · ${questions.length - answeredCount} em branco`}
                  </Txt>
                </View>
                {navigator}
              </Card>
              <Card style={{ gap: 10 }}>
                <Overline>Sobre esta questão</Overline>
                {about.map(([l, v]) => (
                  <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>{l}</Txt>
                    <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Txt>
                  </View>
                ))}
                <Button variant="secondary" size="sm" icon="bookmark" label={isSaved ? 'Salva nas suas questões' : 'Salvar questão'} onPress={toggleSave} />
              </Card>
            </View>
          </View>
        </ScrollView>
        {finishModal}
      </View>
    );
  }

  // ── Celular / tablet ──
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: insets.top + space[2], paddingHorizontal: space[2], paddingBottom: space[2] }}>
        <IconButton icon="x" label={finished ? 'Sair' : practicing ? 'Encerrar sessão' : 'Pausar e sair'} onPress={leave} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.bodySm, { color: p.inkSubtle, textAlign: 'center' }]}>
            <Text style={{ color: p.ink, ...font.bold }}>Questão {index + 1}</Text> de {questions.length}
            {remaining != null && !finished ? <Text style={{ color: urgent ? p.dangerInk : p.inkSubtle }}>{`  ·  ${formatClock(remaining)}`}</Text> : null}
          </Text>
          <ProgressBar value={finished ? index + 1 : answeredCount} max={questions.length || 1} size="sm" label="Progresso" />
        </View>
        <IconButton icon="bookmark" label={isSaved ? 'Remover das salvas' : 'Salvar questão'} color={isSaved ? p.brandInk : undefined} onPress={toggleSave} />
        {!practicing ? <IconButton icon="grid" label="Mapa das questões" onPress={() => setMapOpen(true)} /> : null}
      </View>

      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
        <ScreenBody gap={18} style={{ paddingTop: space[3], width: '100%', maxWidth: layout.readingMax, alignSelf: 'center' }}>
          {index === 0 ? resultCard : null}
          {questionView}
          {errorNotice}
        </ScreenBody>
      </ScrollView>

      <BottomBar hint={finished ? `${correct} de ${total} acertos` : eachMode ? undefined : `${answeredCount} de ${questions.length} respondidas · correção no final`}>
        {practicing ? (canSkip ? <Button variant="ghost" label="Pular" onPress={() => goTo(index + 1)} /> : null) : (
          <Button variant="ghost" label={index === 0 ? 'Mapa' : 'Anterior'} icon={index === 0 ? 'grid' : 'chevron-left'}
            onPress={() => (index === 0 ? setMapOpen(true) : goTo(index - 1))} />
        )}
        {primary ? (
          <View style={{ flex: 1 }}>
            <Button block size="lg" cta icon={primary.icon} iconRight={primary.iconRight} label={primary.label} loading={primary.loading} disabled={primary.disabled} onPress={primary.onPress} />
          </View>
        ) : null}
      </BottomBar>

      <Sheet visible={mapOpen} title="Mapa das questões" onClose={() => setMapOpen(false)}
        footer={!finished ? <Button block size="lg" icon="check" label={eachMode ? 'Encerrar sessão' : 'Finalizar e ver correção'} loading={finish.isPending} onPress={() => { setMapOpen(false); setConfirmFinish(true); }} /> : undefined}>
        <View style={{ gap: space[3] }}>
          {!finished ? (
            <Button variant="ghost" size="sm" icon="flag" label={flagged.includes(index + 1) ? 'Desmarcar revisão desta questão' : 'Marcar esta questão para revisar'} onPress={toggleFlag} />
          ) : null}
          {navigator}
        </View>
      </Sheet>
      {finishModal}
    </View>
  );
}
