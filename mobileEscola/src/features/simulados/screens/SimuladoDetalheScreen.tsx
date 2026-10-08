import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  type AttemptStatus,
  type SimuladoDetail,
  type SupportMaterial,
  formatExamDuration,
  formatTimerSeconds,
} from '../../../services/simulados.service';
import { gerarPdfSimulado } from '../../../services/pdf-simulado.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useSimuladoDetail, useSimuladoMateriais, useAttemptReview, useStartSimulado } from '../hooks';
import { canShowExamPdf, isPeriodBlockingStart, resolveExamPeriodStatus } from '../lib/exam-period';
import { ReviewQuestionCard } from '../components/ReviewQuestionCard';
import {
  AppBar, BottomBar, Button, Card, Chips, EmptyState, IconButton, ListItem, Notice, Overline, ProgressBar, ScreenBody, StatTile, Tag,
  Txt, space, subjectColor, type IconName, type TagTone, usePalette,
} from '../../../ui';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoDetalhe'>;

function parseStartErrorMessage(e: any): string {
  const examIdErrors = e?.response?.data?.body?.errors?.exam_id ?? e?.response?.data?.errors?.exam_id;
  if (Array.isArray(examIdErrors) && examIdErrors.length > 0) return String(examIdErrors[0]);
  const apiErrors = e?.response?.data?.body?.errors ?? e?.response?.data?.errors;
  if (apiErrors) return Object.values(apiErrors as Record<string, string[]>).flat().join(' ');
  return e?.response?.data?.message ?? 'Não foi possível iniciar o simulado.';
}

function needsReview(detalhe: SimuladoDetail): boolean {
  const efetivo = (detalhe.attempt_status || (detalhe.can_start ? 'not_started' : '')) as AttemptStatus;
  return efetivo === 'completed' || efetivo === 'pending_review' || efetivo === 'awaiting_release';
}

const MATERIAL_ICON: Record<string, IconName> = { pdf: 'download', image: 'eye', video: 'play', document: 'folder' };

async function abrirMaterial(url: string) {
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  } catch (e) {
    console.warn('[SupportMaterial] não foi possível abrir', url, e);
  }
}

/** Prazo com data e hora + quanto falta ("Prazo: sex, 10/10 às 00:30 · em 3 dias"). */
function deadlineText(endsAt: string | null): { text: string; urgent: boolean } | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const now = new Date();
  if (end < now) return { text: `Prazo encerrado em ${end.toLocaleDateString('pt-BR')}`, urgent: false };
  const day = end.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const time = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.ceil((new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  const left = days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
  return { text: `Prazo: ${day} às ${time} · ${left}`, urgent: days <= 3 };
}

/** Antes de começar (protótipo "TelaSimuladoDetalhe") e, depois de feito, a correção. */
export function SimuladoDetalheScreen({ route, navigation }: Props) {
  const p = usePalette();
  const { width } = useWindowDimensions();
  const { examId } = route.params;
  const examIdValido = Number.isInteger(examId) && examId > 0;
  useEffect(() => {
    if (!examIdValido) navigation.replace('SimuladosList');
  }, [examIdValido, navigation]);

  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  const { data: detalhe, isLoading, isError, error, refetch } = useSimuladoDetail(examId);
  const { data: materiaisLista = [], isLoading: carregandoMateriaisLista } = useSimuladoMateriais(examId);
  const materiais: SupportMaterial[] = useMemo(
    () => (Array.isArray(detalhe?.support_materials) ? detalhe!.support_materials! : materiaisLista),
    [detalhe?.support_materials, materiaisLista]
  );
  const carregandoMateriais = !!detalhe && !Array.isArray(detalhe.support_materials) && carregandoMateriaisLista;
  const precisaRevisao = detalhe != null && needsReview(detalhe);
  const { data: revisao, isLoading: carregandoRevisao, isError: revisaoErro } = useAttemptReview(detalhe?.attempt_id, precisaRevisao);
  const startMutation = useStartSimulado();

  const voltar = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('SimuladosList'));
  const appBar = (title = 'Simulado') => (
    <AppBar title={title} leading={<IconButton icon="arrow-left" label="Voltar" onPress={voltar} />} />
  );

  async function handleIniciar() {
    if (!detalhe) return;
    setErroAcao(null);
    try {
      const attempt = await startMutation.mutateAsync({ examId: detalhe.id });
      navigation.replace('SimuladoExam', { examId: detalhe.id, attemptId: attempt.id });
    } catch (e: unknown) {
      setErroAcao(parseStartErrorMessage(e));
    }
  }

  function handleContinuar() {
    if (!detalhe?.attempt_id) return;
    navigation.replace('SimuladoExam', { examId: detalhe.id, attemptId: detalhe.attempt_id });
  }

  async function handleGerarPdf() {
    if (!detalhe || gerandoPdf) return;
    setErroPdf(null);
    setGerandoPdf(true);
    try {
      await gerarPdfSimulado(detalhe);
    } catch (e) {
      console.warn('[PDF] erro ao gerar', e);
      setErroPdf('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setGerandoPdf(false);
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {appBar()}
        <ActivityIndicator color={p.brand} size="large" style={{ marginTop: space[8] }} />
      </View>
    );
  }

  if (isError || !detalhe) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {appBar()}
        <ScreenBody gap={space[3]}>
          <Notice tone="danger" title="Não foi possível abrir o simulado" text={isError ? getApiErrorMessage(error, 'Tente de novo em instantes.') : 'Simulado não encontrado.'} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
        </ScreenBody>
      </View>
    );
  }

  const status: AttemptStatus = (detalhe.attempt_status ?? 'not_started') as AttemptStatus;
  const periodStatus = resolveExamPeriodStatus(detalhe);
  const periodBloqueia = isPeriodBlockingStart(periodStatus, status);
  const emAndamento = status === 'in_progress';
  const abandonado = status === 'abandoned';
  const awaitingRelease = status === 'awaiting_release' || revisao?.status === 'awaiting_release' || revisao?.result_release_pending === true;
  const podeIniciar = detalhe.can_start && !periodBloqueia && (status === 'not_started' || abandonado);
  const concluido = status === 'completed' || status === 'pending_review' || awaitingRelease;
  const mostrarPdf = canShowExamPdf(periodStatus, status);
  const color = subjectColor(p, detalhe.subject?.id, detalhe.subject?.color);
  const prazo = deadlineText(detalhe.ends_at);
  const retakeThreshold = detalhe.min_score_to_retake ?? detalhe.passing_score;
  const tentativas = detalhe.allow_retake ? (detalhe.max_attempts ? String(detalhe.max_attempts) : 'Livres') : '1';
  const assuntos = Array.from(new Set((detalhe.questions ?? []).map((q) => q.subject?.name).filter(Boolean))) as string[];

  const statusTag: { tone: TagTone; icon: IconName; label: string } | null = awaitingRelease
    ? { tone: 'info', icon: 'key', label: 'Resultado bloqueado' }
    : status === 'completed' ? { tone: 'success', icon: 'check', label: 'Concluído' }
    : status === 'pending_review' ? { tone: 'warning', icon: 'clock', label: 'Aguardando correção' }
    : emAndamento ? { tone: 'info', icon: 'clock', label: 'Em andamento' }
    : abandonado ? { tone: 'neutral', icon: 'clock', label: 'Tempo esgotado' }
    : periodStatus === 'upcoming' ? { tone: 'warning', icon: 'calendar', label: 'Ainda não liberado' }
    : periodStatus === 'closed' ? { tone: 'neutral', icon: 'calendar', label: 'Período encerrado' }
    : null;

  const cta = emAndamento
    ? <Button variant="accent" block size="lg" icon="play" label="Continuar simulado" onPress={handleContinuar} />
    : podeIniciar
      ? <Button variant="accent" block size="lg" icon={abandonado ? 'refresh' : 'play'} label={abandonado ? 'Tentar novamente' : 'Iniciar simulado'}
          loading={startMutation.isPending} onPress={handleIniciar} />
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {appBar()}
      <ScrollView>
        <ScreenBody gap={20} style={{ paddingTop: space[2] }}>
          <View style={{ gap: 10, alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              <Tag tone="outline" dot={color} label={detalhe.subject?.name ?? detalhe.exam_type_label ?? 'Simulado'} />
              {statusTag ? <Tag tone={statusTag.tone} icon={statusTag.icon} label={statusTag.label} /> : null}
            </View>
            <Txt variant="titleLg" style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.5 }} accessibilityRole="header">{detalhe.title}</Txt>
            {prazo && !concluido ? <Tag tone={prazo.urgent ? 'accent' : 'neutral'} icon="calendar" label={prazo.text} /> : null}
            {detalhe.description ? <Txt tone="muted">{detalhe.description}</Txt> : null}
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile label="Questões" value={String(detalhe.total_questions)} />
              <StatTile label="Tempo" value={detalhe.duration_minutes ? formatExamDuration(detalhe.duration_minutes) : 'Livre'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile label="Mínimo" value={`${detalhe.passing_score}%`} />
              <StatTile label="Tentativas" value={tentativas} />
            </View>
          </View>

          {emAndamento && detalhe.time_remaining_seconds != null ? (
            <Notice tone={detalhe.time_remaining_seconds <= 60 ? 'danger' : 'info'} icon="clock" title={`${formatTimerSeconds(detalhe.time_remaining_seconds)} restantes`}
              text="Você já começou. Continue de onde parou." />
          ) : null}
          {periodBloqueia && detalhe.period_message ? <Notice tone="warning" icon="calendar" title={statusTag?.label ?? 'Fora do período'} text={detalhe.period_message} /> : null}
          {erroAcao ? <Notice tone="danger" title="Não foi possível iniciar" text={erroAcao} /> : null}

          {assuntos.length && !concluido ? (
            <View style={{ gap: 10 }}>
              <Overline>O que cai</Overline>
              <Chips>{assuntos.map((a) => <Tag key={a} label={a} />)}</Chips>
            </View>
          ) : null}

          {!concluido ? (
            <>
              <Notice tone="info" icon="clock" title="Pode pausar"
                text={detalhe.duration_minutes
                  ? `Você tem ${formatExamDuration(detalhe.duration_minutes)} depois de iniciar. Suas respostas ficam salvas.`
                  : 'Suas respostas ficam salvas. Feche o app e continue de onde parou até o prazo.'} />
              <Notice tone="warning" icon="alert"
                title={detalhe.allow_retake ? 'Pode refazer' : 'Uma tentativa'}
                text={detalhe.allow_retake
                  ? `Até ${detalhe.max_attempts ? `${detalhe.max_attempts} tentativa(s)` : 'quantas quiser'}, se a nota ficar abaixo de ${retakeThreshold ?? 0}%.`
                  : 'Depois de finalizar, não dá para refazer.'} />
            </>
          ) : null}

          {carregandoMateriais ? <ActivityIndicator color={p.brand} /> : materiais.length ? (
            <View style={{ gap: space[2] }}>
              <Overline>Materiais de apoio</Overline>
              <Card padding="none" style={{ paddingVertical: space[1] }}>
                {materiais.map((m) => (
                  <ListItem key={m.id} icon={m.type === 'link' ? 'arrow-right' : MATERIAL_ICON[m.file_type ?? ''] ?? 'folder'} title={m.title}
                    subtitle={m.description ?? undefined} onPress={() => abrirMaterial(m.content)} />
                ))}
              </Card>
            </View>
          ) : null}

          {mostrarPdf ? (
            <View style={{ gap: 6 }}>
              <Button variant="secondary" icon="download" label="Baixar PDF" loading={gerandoPdf} onPress={handleGerarPdf} />
              {erroPdf ? <Txt variant="bodySm" tone="danger">{erroPdf}</Txt> : null}
            </View>
          ) : null}

          {!concluido && detalhe.subject ? (
            <Button variant="ghost" icon="library" block label="Treinar estes assuntos antes"
              onPress={() => navigation.getParent()?.navigate('Questoes', { screen: 'BancoQuestoes', params: { subjectId: detalhe.subject?.id } })} />
          ) : null}

          {concluido ? (
            <View style={{ gap: space[3] }}>
              {revisao?.score_display ? (
                <Card style={{ gap: space[2] }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Txt variant="bodySm" tone="muted">Sua nota</Txt>
                    {typeof revisao.passed === 'boolean' ? (
                      <Tag tone={revisao.passed ? 'success' : 'danger'} icon={revisao.passed ? 'check' : 'x'} label={revisao.passed ? 'Acima do mínimo' : 'Abaixo do mínimo'} />
                    ) : null}
                  </View>
                  <Txt variant="display">{revisao.percentage != null ? `${revisao.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : revisao.score_display}</Txt>
                  <Txt variant="bodySm" tone="subtle">{revisao.score_display} pontos · mínimo {detalhe.passing_score}%</Txt>
                  {revisao.percentage != null ? <ProgressBar value={revisao.percentage} tone={revisao.passed === false ? 'danger' : 'success'} marker={detalhe.passing_score} label="Aproveitamento" /> : null}
                </Card>
              ) : null}
              {awaitingRelease ? <Notice tone="info" icon="key" title="Resultado bloqueado" text="O gabarito e a nota ficam disponíveis depois do prazo final." /> : null}
              <Overline>Correção</Overline>
              {carregandoRevisao ? <ActivityIndicator color={p.brand} />
                : revisao?.questions?.length ? revisao.questions.map((q, i) => (
                  <ReviewQuestionCard key={q.id} question={q} index={i} awaitingRelease={awaitingRelease} imageWidth={Math.max(0, Math.min(width, 720) - 64)} />
                ))
                : revisaoErro ? <Notice tone="danger" title="Não foi possível carregar a correção" />
                : <EmptyState icon="clipboard" title="Correção indisponível" text="A correção aparece aqui quando a escola liberar." />}
            </View>
          ) : null}
        </ScreenBody>
      </ScrollView>
      {cta ? <BottomBar>{cta}</BottomBar> : null}
    </View>
  );
}
