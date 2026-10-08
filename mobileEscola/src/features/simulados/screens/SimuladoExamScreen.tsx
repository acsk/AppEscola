import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RichText from '../../../components/RichText';
import ConfirmModal from '../../../components/ConfirmModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { useQueryClient } from '@tanstack/react-query';
import {
  detalharSimulado,
  enviarResposta,
  finalizarSimulado,
  buscarTentativa,
  type SimuladoDetail,
  type Question,
  type AttemptFinish,
  formatTimerSeconds,
} from '../../../services/simulados.service';
import { invalidateSimuladosQueries } from '../hooks';
import { getApiErrorMessage } from '../../../lib/apiError';
import { font,
  AnswerOption, BottomBar, Button, Card, IconButton, Notice, ProgressBar, QuestionNavigator, ScreenBody, Sheet, Tag, Txt,
  layout, radius, space, subjectColor, type, usePalette, useLayoutMode, Kbd, Overline, Icon,
} from '../../../ui';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoExam'>;
type Fase = 'carregando' | 'realizando' | 'finalizando' | 'resultado' | 'erro';
interface Resposta { optionId?: number; textAnswer?: string }

const LETTERS = 'ABCDEFGHIJ';

function isQuestaoRespondida(q: Question, r: Resposta | undefined): boolean {
  if (!r) return false;
  if (q.type === 'essay') return !!r.textAnswer?.trim();
  if (r.optionId === undefined) return false;
  const op = q.options.find((o) => o.id === r.optionId);
  const exigeTexto = q.allow_text_answer || !!op?.triggers_text_input;
  return exigeTexto ? !!r.textAnswer?.trim() : true;
}

function QuestionImage({ uri }: { uri: string }) {
  const { width } = useWindowDimensions();
  const maxWidth = Math.max(0, Math.min(width, layout.readingMax) - space[4] * 2);
  const [height, setHeight] = useState(220);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    Image.getSize(uri, (w, h) => { if (w > 0) setHeight((maxWidth * h) / w); }, () => setError(true));
  }, [uri, maxWidth]);
  if (error) return null;
  return <Image source={{ uri }} resizeMode="contain" onError={() => setError(true)} accessibilityLabel="Imagem da questão"
    style={{ width: '100%', height, borderRadius: radius.md }} />;
}

/** Responder simulado (protótipo "TelaResponderQuestao"): uma questão por vez, mapa da sessão e entrega no fim. */
export function SimuladoExamScreen({ route, navigation }: Props) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { examId, attemptId } = route.params;
  const queryClient = useQueryClient();

  const [fase, setFase] = useState<Fase>('carregando');
  const [detalhe, setDetalhe] = useState<SimuladoDetail | null>(null);
  const [respostas, setRespostas] = useState<Record<number, Resposta>>({});
  const [resultado, setResultado] = useState<AttemptFinish | null>(null);
  const [erroMsg, setErroMsg] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [atual, setAtual] = useState(0);
  const [mapaAberto, setMapaAberto] = useState(false);
  /** "Revisar depois": marcação local (não vai para a API). */
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const { isDesktop } = useLayoutMode();
  const alternarMarcada = (index: number) => setMarcadas((prev) => (prev.includes(index) ? prev.filter((n) => n !== index) : [...prev, index]));
  const scrollRef = useRef<ScrollView>(null);
  const bypassRemoveRef = useRef(false);
  const tempoEsgotadoRef = useRef(false);

  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; cancelLabel: string; destructive: boolean; icon: string; iconColor: string; onConfirm: () => void } | null>(null);

  const questoes = (detalhe?.questions ?? []).slice().sort((a, b) => a.order - b.order);

  function pedirConfirmacaoSaida(onConfirm: () => void) {
    setConfirm({
      title: 'Sair do simulado?', message: 'Suas respostas ainda não foram enviadas e serão perdidas.',
      confirmLabel: 'Sair', cancelLabel: 'Continuar respondendo', destructive: true, icon: 'exit-outline', iconColor: p.danger, onConfirm,
    });
  }

  function sair() {
    const doVoltar = () => {
      bypassRemoveRef.current = true;
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('SimuladoDetalhe', { examId });
    };
    if (fase === 'realizando' || fase === 'finalizando') pedirConfirmacaoSaida(doVoltar);
    else doVoltar();
  }

  // Confirmação ao sair durante o exame (gesto / botão físico).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (bypassRemoveRef.current) {
        bypassRemoveRef.current = false;
        return;
      }
      if (fase === 'resultado' || fase === 'carregando' || fase === 'erro') return;
      e.preventDefault();
      pedirConfirmacaoSaida(() => {
        bypassRemoveRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, fase]);

  useEffect(() => { void carregarQuestoes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [examId]);

  // Cronômetro: ao zerar, envia o que houver e encerra.
  useEffect(() => {
    if ((fase !== 'realizando' && fase !== 'finalizando') || secondsLeft === null) return;
    if (secondsLeft > 0) {
      const tick = setInterval(() => setSecondsLeft((prev) => (prev === null || prev <= 1 ? 0 : prev - 1)), 1000);
      return () => clearInterval(tick);
    }
    if (!tempoEsgotadoRef.current) {
      tempoEsgotadoRef.current = true;
      void enviarEFinalizar(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, secondsLeft]);

  async function carregarQuestoes() {
    setFase('carregando');
    tempoEsgotadoRef.current = false;
    try {
      const d = await detalharSimulado(examId);
      setDetalhe(d);
      if (d.attempt_status === 'abandoned') {
        setErroMsg('O tempo desta tentativa expirou. Volte e inicie uma nova tentativa, se permitido.');
        setFase('erro');
        return;
      }
      if (d.attempt_status !== 'in_progress') {
        setErroMsg('Esta tentativa não está mais em andamento.');
        setFase('erro');
        return;
      }
      const remaining = d.time_remaining_seconds ?? null;
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setErroMsg('O tempo desta tentativa expirou.');
        setFase('erro');
        return;
      }
      setFase('realizando');
    } catch (e) {
      setErroMsg(getApiErrorMessage(e, 'Não foi possível carregar as questões.'));
      setFase('erro');
    }
  }

  /** Envia as respostas e finaliza (também quando o tempo acaba). */
  async function enviarEFinalizar(tempoEsgotado = false) {
    if (!detalhe || (tempoEsgotado && (fase === 'finalizando' || fase === 'resultado'))) return;
    setErroMsg('');
    setFase('finalizando');
    try {
      for (const questao of detalhe.questions) {
        const resp = respostas[questao.id];
        if (!resp) continue;
        if (questao.type === 'essay') {
          if (resp.textAnswer?.trim()) await enviarResposta(attemptId, questao.id, undefined, resp.textAnswer);
        } else if (resp.optionId !== undefined) {
          await enviarResposta(attemptId, questao.id, resp.optionId, resp.textAnswer);
        }
      }
      const res = await finalizarSimulado(attemptId);
      invalidateSimuladosQueries(queryClient, { examId, attemptId });
      setResultado(res);
      setFase('resultado');
    } catch (e) {
      if (tempoEsgotado) {
        setErroMsg(getApiErrorMessage(e, 'O tempo do simulado expirou. A tentativa foi encerrada.'));
        setFase('erro');
      } else {
        setErroMsg(getApiErrorMessage(e, 'Erro ao finalizar. Tente novamente.'));
        setFase('realizando');
      }
    }
  }

  function handleFinalizar() {
    if (!detalhe) return;
    setMapaAberto(false);
    const faltaTexto: number[] = [];
    questoes.forEach((q, i) => {
      const r = respostas[q.id];
      if (!r) return;
      if (q.type === 'essay') {
        if (!r.textAnswer?.trim()) faltaTexto.push(i + 1);
        return;
      }
      if (r.optionId === undefined) return;
      const op = q.options.find((o) => o.id === r.optionId);
      if ((q.allow_text_answer || op?.triggers_text_input) && !r.textAnswer?.trim()) faltaTexto.push(i + 1);
    });
    if (faltaTexto.length) {
      setErroMsg(`Preencha o texto obrigatório na(s) questão(ões): ${faltaTexto.join(', ')}.`);
      setAtual(faltaTexto[0] - 1);
      return;
    }
    const emBranco = questoes.map((q, i) => (isQuestaoRespondida(q, respostas[q.id]) ? null : i + 1)).filter((n): n is number => n !== null);
    if (emBranco.length) {
      setConfirm({
        title: 'Há questões em branco',
        message: emBranco.length === 1
          ? `A questão ${emBranco[0]} está sem resposta. Quer entregar mesmo assim?`
          : `${emBranco.length} questões estão sem resposta (${emBranco.join(', ')}). Quer entregar mesmo assim?`,
        confirmLabel: 'Entregar mesmo assim', cancelLabel: 'Voltar e responder', destructive: false, icon: 'help-circle-outline', iconColor: p.warning,
        onConfirm: () => void enviarEFinalizar(),
      });
      return;
    }
    void enviarEFinalizar();
  }

  const setResposta = (questionId: number, resp: Resposta) => setRespostas((prev) => ({ ...prev, [questionId]: resp }));
  const irPara = (index: number) => {
    setAtual(Math.max(0, Math.min(questoes.length - 1, index)));
    (scrollRef.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void })?.scrollTo?.({ y: 0, animated: false });
  };

  async function verificarResultado() {
    setVerificando(true);
    try {
      setResultado(await buscarTentativa(attemptId));
    } catch {
      // Mantém a tela de aguardo; dá para tentar de novo.
    } finally {
      setVerificando(false);
    }
  }

  // Pendente de correção / aguardando liberação: confere a cada 30 s.
  useEffect(() => {
    if (fase !== 'resultado' || (resultado?.status !== 'pending_review' && resultado?.status !== 'awaiting_release')) return;
    void verificarResultado();
    const id = setInterval(() => void verificarResultado(), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, resultado?.status, attemptId]);

  // Teclado (web): A–E marca, ←/→ navega.
  useEffect(() => {
    if (Platform.OS !== 'web' || fase !== 'realizando') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const q = questoes[atual];
      if (!q) return;
      if (event.key === 'ArrowRight') irPara(atual + 1);
      else if (event.key === 'ArrowLeft') irPara(atual - 1);
      else if (event.key === 'Enter') { if (atual >= questoes.length - 1) handleFinalizar(); else irPara(atual + 1); }
      else if (event.key === 'r' || event.key === 'R') alternarMarcada(atual + 1);
      else if (q.type === 'multiple_choice') {
        const idx = LETTERS.indexOf(event.key.toUpperCase());
        const op = q.options[idx];
        if (idx >= 0 && op) setResposta(q.id, { ...respostas[q.id], optionId: op.id, textAnswer: op.triggers_text_input || q.allow_text_answer ? respostas[q.id]?.textAnswer : undefined });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const confirmModal = (
    <ConfirmModal
      visible={confirm !== null}
      title={confirm?.title ?? ''}
      message={confirm?.message ?? ''}
      confirmLabel={confirm?.confirmLabel ?? 'Confirmar'}
      cancelLabel={confirm?.cancelLabel ?? 'Cancelar'}
      confirmDestructive={confirm?.destructive}
      icon={(confirm?.icon ?? 'help-circle-outline') as never}
      iconColor={confirm?.iconColor}
      onConfirm={() => { const action = confirm?.onConfirm; setConfirm(null); action?.(); }}
      onCancel={() => setConfirm(null)}
    />
  );

  const simpleTop = (title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: insets.top + space[2], paddingHorizontal: space[2], paddingBottom: space[2] }}>
      <IconButton icon="x" label="Fechar" onPress={() => navigation.navigate('SimuladosList')} />
      <Txt variant="title" numberOfLines={1} style={{ flex: 1, fontSize: 17 }}>{title}</Txt>
    </View>
  );

  // ── Carregando / erro ──
  if (fase === 'carregando') {
    return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
      <ActivityIndicator size="large" color={p.brand} /><Txt tone="subtle">Carregando questões…</Txt>
    </View>;
  }
  if (fase === 'erro') {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {simpleTop(detalhe?.title ?? 'Simulado')}
        <ScreenBody gap={space[3]}>
          <Notice tone="danger" title="Não foi possível continuar" text={erroMsg} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => void carregarQuestoes()} />
          <Button variant="ghost" label="Voltar aos simulados" onPress={() => navigation.navigate('SimuladosList')} />
        </ScreenBody>
      </View>
    );
  }

  // ── Resultado ──
  if (fase === 'resultado' && resultado) {
    const pendente = resultado.status === 'pending_review' || resultado.status === 'awaiting_release';
    const liberacao = resultado.status === 'awaiting_release';
    const temCriterio = typeof resultado.passed === 'boolean';
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {simpleTop(detalhe?.title ?? 'Simulado')}
        <ScrollView>
          <ScreenBody gap={space[4]}>
            {resultado.status === 'abandoned' ? (
              <Notice tone="warning" icon="clock" title="Tempo esgotado" text="A tentativa foi encerrada automaticamente. Se o simulado permitir, você pode tentar de novo." />
            ) : pendente ? (
              <>
                <Notice tone="info" icon={liberacao ? 'key' : 'clock'} title={liberacao ? 'Aguardando liberação' : 'Simulado entregue'}
                  text={liberacao
                    ? 'Sua tentativa já foi corrigida. O resultado aparece depois do prazo final do simulado.'
                    : resultado.pending_answers_count
                      ? `${resultado.pending_answers_count} resposta(s) serão corrigidas pelo professor. Avisamos quando o resultado sair.`
                      : 'Algumas respostas serão corrigidas pelo professor. Avisamos quando o resultado sair.'} />
                <Button variant="secondary" icon="refresh" label={verificando ? 'Verificando…' : 'Verificar resultado'} loading={verificando} onPress={() => void verificarResultado()} />
              </>
            ) : (
              <Card padding="lg" style={{ gap: space[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Txt variant="bodySm" tone="muted">Seu aproveitamento</Txt>
                  {temCriterio ? <Tag tone={resultado.passed ? 'success' : 'danger'} icon={resultado.passed ? 'check' : 'x'} label={resultado.passed ? 'Acima do mínimo' : 'Abaixo do mínimo'} /> : null}
                </View>
                <Text style={[type.display, { color: p.ink }]}>
                  {resultado.percentage != null ? `${resultado.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
                </Text>
                <Txt variant="bodySm" tone="subtle">{resultado.score ?? '—'} de {resultado.max_score} pontos{detalhe?.passing_score ? ` · mínimo ${detalhe.passing_score}%` : ''}</Txt>
                {resultado.percentage != null ? <ProgressBar value={resultado.percentage} tone={resultado.passed === false ? 'danger' : 'success'} marker={detalhe?.passing_score} label="Aproveitamento" /> : null}
                <Txt tone="muted" style={{ marginTop: space[2] }}>
                  {temCriterio ? (resultado.passed ? 'Você passou do mínimo. Confira a correção para revisar o que errou.' : `Não foi desta vez: o mínimo era ${detalhe?.passing_score ?? 0}%. Revise a correção e treine os assuntos.`)
                    : 'Simulado concluído. Confira a correção.'}
                </Txt>
              </Card>
            )}
          </ScreenBody>
        </ScrollView>
        <BottomBar>
          {!pendente && resultado.status !== 'abandoned' ? (
            <Button block size="lg" cta iconRight="arrow-right" label="Ver correção" onPress={() => navigation.replace('SimuladoResult', { attemptId })} />
          ) : (
            <Button block size="lg" variant="secondary" label="Voltar aos simulados" onPress={() => navigation.navigate('SimuladosList')} />
          )}
        </BottomBar>
      </View>
    );
  }

  // ── Respondendo ──
  if (!detalhe || !questoes.length) return null;
  const q = questoes[Math.min(atual, questoes.length - 1)];
  const resposta = respostas[q.id] ?? {};
  const respondidas = questoes.filter((x) => isQuestaoRespondida(x, respostas[x.id])).length;
  const ultima = atual >= questoes.length - 1;
  const opcaoSelecionada = q.options.find((o) => o.id === resposta.optionId);
  const exigeTexto = q.type === 'essay' || opcaoSelecionada?.triggers_text_input || (q.allow_text_answer && resposta.optionId !== undefined);
  const finalizando = fase === 'finalizando';
  const urgente = secondsLeft !== null && secondsLeft <= 60;
  const respondidasIdx = questoes.map((x, i) => (isQuestaoRespondida(x, respostas[x.id]) ? i + 1 : 0)).filter(Boolean);
  const lastLetter = LETTERS[Math.max(0, q.options.length - 1)] ?? 'D';

  const alternativas = (
    <>
      {q.type === 'multiple_choice' ? (
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          {q.options.map((op, i) => (
            <AnswerOption key={op.id} letter={LETTERS[i] ?? String(i + 1)} state={resposta.optionId === op.id ? 'selected' : 'default'}
              onPress={() => setResposta(q.id, { ...resposta, optionId: op.id, textAnswer: op.triggers_text_input || q.allow_text_answer ? resposta.textAnswer : undefined })}>
              <Txt><RichText value={op.option_text} /></Txt>
            </AnswerOption>
          ))}
        </View>
      ) : null}
      {exigeTexto ? (
        <TextInput
          multiline
          textAlignVertical="top"
          value={resposta.textAnswer ?? ''}
          onChangeText={(v) => setResposta(q.id, { ...resposta, textAnswer: v })}
          placeholder={q.type === 'essay' ? 'Digite sua resposta…' : opcaoSelecionada?.triggers_text_input ? 'Especifique sua resposta…' : 'Justifique sua resposta…'}
          placeholderTextColor={p.inkSubtle}
          accessibilityLabel="Sua resposta"
          style={[type.body, { minHeight: 140, padding: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: p.lineStrong, backgroundColor: p.surface, color: p.ink }]}
        />
      ) : null}
    </>
  );

  // Desktop (protótipo "DesktopResponder"): modo foco, questão no centro e mapa à direita.
  if (isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], paddingVertical: space[3], paddingHorizontal: space[6], backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Button variant="ghost" size="sm" icon="x" label="Pausar e sair" onPress={sair} />
          </View>
          <View style={{ width: 560, maxWidth: '50%', gap: 6 }}>
            <Txt variant="label" numberOfLines={1} style={{ textAlign: 'center', ...font.bold }}>{detalhe.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}><ProgressBar value={respondidas} max={questoes.length} size="sm" label="Progresso" /></View>
              <Txt variant="caption" tone="subtle" style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{respondidas} de {questoes.length}</Txt>
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space[4] }}>
            {secondsLeft !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="clock" size={18} color={urgente ? p.dangerInk : p.inkMuted} />
                <Txt variant="titleSm" style={{ fontSize: 15, color: urgente ? p.dangerInk : p.inkMuted, fontVariant: ['tabular-nums'] }}>{formatTimerSeconds(secondsLeft)}</Txt>
              </View>
            ) : null}
            <Button variant="secondary" size="sm" label="Finalizar" loading={finalizando} onPress={handleFinalizar} />
          </View>
        </View>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 48, paddingTop: space[8], paddingHorizontal: space[8], paddingBottom: 48 }}>
            <View style={{ flex: 1, maxWidth: layout.readingMax, gap: 18 }}>
              <Txt variant="caption" tone="subtle" style={{ fontSize: 13, ...font.bold, letterSpacing: 0.52, textTransform: 'uppercase' }}>Questão {atual + 1}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6 }}>
                {q.subject ? <Tag tone="outline" dot={subjectColor(p, q.subject.id)} label={q.subject.name} /> : null}
                <Tag label={q.type === 'essay' ? 'Discursiva' : 'Objetiva'} />
                <Tag label={`${q.points} ${q.points === 1 ? 'ponto' : 'pontos'}`} />
              </View>
              <Txt variant="reading" style={{ fontSize: 18, lineHeight: 29 }}><RichText value={q.question_text} /></Txt>
              {q.image_url ? <QuestionImage uri={q.image_url} /> : null}
              {alternativas}
              {erroMsg ? <Notice tone="danger" title="Confira antes de entregar" text={erroMsg} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 6 }}>
                <Button variant="ghost" icon="arrow-left" label="Anterior" disabled={atual === 0} onPress={() => irPara(atual - 1)} />
                <Button variant="ghost" icon="flag" label={marcadas.includes(atual + 1) ? 'Desmarcar revisão' : 'Revisar depois'} onPress={() => alternarMarcada(atual + 1)} />
                <View style={{ flex: 1 }} />
                {!ultima ? <Button variant="ghost" label="Pular" onPress={() => irPara(atual + 1)} /> : null}
                {ultima
                  ? <Button size="lg" icon="check" label="Entregar simulado" loading={finalizando} onPress={handleFinalizar} />
                  : <Button size="lg" iconRight="arrow-right" label="Confirmar resposta" disabled={!isQuestaoRespondida(q, respostas[q.id])} onPress={() => irPara(atual + 1)} />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Kbd>A</Kbd><Txt variant="bodySm" tone="subtle">–</Txt><Kbd>{lastLetter}</Kbd><Txt variant="bodySm" tone="subtle"> marcar   </Txt>
                <Kbd>Enter</Kbd><Txt variant="bodySm" tone="subtle"> confirmar   </Txt>
                <Kbd>R</Kbd><Txt variant="bodySm" tone="subtle"> revisar depois   </Txt>
                <Kbd>←</Kbd><Kbd>→</Kbd><Txt variant="bodySm" tone="subtle"> navegar</Txt>
              </View>
            </View>
            <View style={{ width: layout.asideW, gap: space[4] }}>
              <Card style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt variant="titleSm">Questões</Txt>
                  <Txt variant="caption" tone="subtle">{respondidas} respondidas · {questoes.length - respondidas} em branco</Txt>
                </View>
                <QuestionNavigator total={questoes.length} current={atual + 1} answered={respondidasIdx} flagged={marcadas} onSelect={(n) => irPara(n - 1)} />
              </Card>
              <Card style={{ gap: 10 }}>
                <Overline>Sobre esta questão</Overline>
                {[['Disciplina', q.subject?.name ?? '—'], ['Tipo', q.type === 'essay' ? 'Discursiva' : 'Objetiva'], ['Vale', `${q.points} ${q.points === 1 ? 'ponto' : 'pontos'}`]].map(([l, v]) => (
                  <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>{l}</Txt>
                    <Txt variant="label">{v}</Txt>
                  </View>
                ))}
              </Card>
            </View>
          </View>
        </ScrollView>
        {confirmModal}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: insets.top + space[2], paddingHorizontal: space[2], paddingBottom: space[2] }}>
        <IconButton icon="x" label="Sair do simulado" onPress={sair} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.bodySm, { color: p.inkSubtle, textAlign: 'center' }]}>
            <Text style={{ color: p.ink, ...font.bold }}>Questão {atual + 1}</Text> de {questoes.length}
            {secondsLeft !== null ? <Text style={{ color: urgente ? p.dangerInk : p.inkSubtle }}>{`  ·  ${formatTimerSeconds(secondsLeft)}`}</Text> : null}
          </Text>
          <ProgressBar value={respondidas} max={questoes.length} size="sm" label="Questões respondidas" />
        </View>
        <IconButton icon="flag" label={marcadas.includes(atual + 1) ? 'Desmarcar revisão' : 'Revisar depois'} color={marcadas.includes(atual + 1) ? p.accent : undefined}
          onPress={() => alternarMarcada(atual + 1)} />
        <IconButton icon="grid" label="Mapa das questões" onPress={() => setMapaAberto(true)} />
      </View>

      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
        <ScreenBody gap={18} style={{ paddingTop: space[3], width: '100%', maxWidth: layout.readingMax, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {q.subject ? <Tag tone="outline" dot={subjectColor(p, q.subject.id)} label={q.subject.name} /> : null}
            <Tag label={q.type === 'essay' ? 'Discursiva' : 'Objetiva'} />
            <Tag label={`${q.points} ${q.points === 1 ? 'ponto' : 'pontos'}`} />
          </View>
          <Txt variant="reading"><RichText value={q.question_text} /></Txt>
          {q.image_url ? <QuestionImage uri={q.image_url} /> : null}

          {alternativas}

          {Platform.OS === 'web' ? <Txt variant="bodySm" tone="subtle">Atalhos: A–E marca a alternativa · ← → navega entre as questões</Txt> : null}
          {erroMsg ? <Notice tone="danger" title="Confira antes de entregar" text={erroMsg} /> : null}
        </ScreenBody>
      </ScrollView>

      <BottomBar hint={`${respondidas} de ${questoes.length} respondidas`}>
        <Button variant="ghost" label={atual === 0 ? 'Mapa' : 'Anterior'} icon={atual === 0 ? 'grid' : 'chevron-left'} disabled={finalizando}
          onPress={() => (atual === 0 ? setMapaAberto(true) : irPara(atual - 1))} />
        {ultima ? (
          <Button block size="lg" cta icon="check" label="Entregar simulado" loading={finalizando} onPress={handleFinalizar} />
        ) : (
          <Button block size="lg" cta iconRight="arrow-right" label={isQuestaoRespondida(q, respostas[q.id]) ? 'Próxima questão' : 'Pular'} disabled={finalizando} onPress={() => irPara(atual + 1)} />
        )}
      </BottomBar>

      <Sheet visible={mapaAberto} title="Mapa das questões" onClose={() => setMapaAberto(false)}
        footer={<Button block size="lg" icon="check" label="Entregar simulado" loading={finalizando} onPress={handleFinalizar} />}>
        <QuestionNavigator total={questoes.length} current={atual + 1} flagged={marcadas}
          answered={respondidasIdx}
          onSelect={(n) => { irPara(n - 1); setMapaAberto(false); }} />
      </Sheet>
      {confirmModal}
    </View>
  );
}
