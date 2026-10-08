import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { formatExamDuration } from '../../../services/simulados.service';
import { useSimuladoDetail, useStartSimulado } from '../hooks';
import { isPeriodBlockingStart, resolveExamPeriodStatus } from '../lib/exam-period';
import { Button, Card, Chips, Notice, Overline, ProgressBar, StatTile, Tag, Txt, space, subjectColor, usePalette } from '../../../ui';

type Nav = NativeStackNavigationProp<SimuladosStackParamList>;

function deadline(endsAt: string | null) {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const now = new Date();
  if (end < now) return { text: `Encerrou ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`, urgent: false };
  const day = end.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const days = Math.ceil((new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  return { text: `Até ${day} às ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`}`, urgent: days <= 3 };
}

/** Detalhe ao lado da tabela (protótipo "DesktopSimulados"): o CTA fica no painel, sempre visível. */
export function SimuladoDetailPanel({ examId, score }: { examId: number; score?: { value: number; label: string } | null }) {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { data: d, isLoading, isError } = useSimuladoDetail(examId);
  const start = useStartSimulado();
  const [erro, setErro] = useState<string | null>(null);

  if (isLoading) return <Card padding="lg"><ActivityIndicator color={p.brand} /></Card>;
  if (isError || !d) return <Card padding="lg"><Notice tone="danger" title="Não foi possível abrir o simulado" /></Card>;

  const status = d.attempt_status ?? 'not_started';
  const period = resolveExamPeriodStatus(d);
  const blocked = isPeriodBlockingStart(period, status);
  const inProgress = status === 'in_progress';
  const done = status === 'completed' || status === 'pending_review' || status === 'awaiting_release';
  const canStart = d.can_start && !blocked && (status === 'not_started' || status === 'abandoned');
  const prazo = deadline(d.ends_at);
  const assuntos = Array.from(new Set((d.questions ?? []).map((q) => q.subject?.name).filter(Boolean))) as string[];

  const iniciar = async () => {
    setErro(null);
    try {
      const attempt = await start.mutateAsync({ examId: d.id });
      navigation.navigate('SimuladoExam', { examId: d.id, attemptId: attempt.id });
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? 'Não foi possível iniciar o simulado.');
    }
  };

  return (
    <Card padding="lg" style={{ gap: space[4], alignItems: 'flex-start' }}>
      <Tag tone="outline" dot={subjectColor(p, d.subject?.id, d.subject?.color)} label={d.subject?.name ?? d.exam_type_label ?? 'Simulado'} />
      <Txt variant="titleLg" style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.22 }}>{d.title}</Txt>
      {prazo && !done ? <Tag tone={prazo.urgent ? 'accent' : 'neutral'} icon="calendar" label={prazo.text} /> : null}
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile label="Questões" value={String(d.total_questions)} />
          <StatTile label="Tempo" value={d.duration_minutes ? formatExamDuration(d.duration_minutes) : 'Livre'} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile label="Mínimo" value={`${d.passing_score}%`} />
          <StatTile label="Tentativas" value={d.allow_retake ? (d.max_attempts ? String(d.max_attempts) : 'Livres') : '1'} />
        </View>
      </View>
      {done && score ? (
        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="bodySm" tone="muted">Aproveitamento</Txt>
            <Txt variant="titleSm">{score.label}</Txt>
          </View>
          <ProgressBar value={score.value} tone={score.value >= d.passing_score ? 'success' : 'danger'} marker={d.passing_score} label="Aproveitamento" />
        </View>
      ) : null}
      {assuntos.length && !done ? (
        <View style={{ gap: space[2] }}>
          <Overline>O que cai</Overline>
          <Chips>{assuntos.map((a) => <Tag key={a} label={a} />)}</Chips>
        </View>
      ) : null}
      {!done ? (
        <View style={{ gap: 2 }}>
          <Txt tone="muted" style={{ fontSize: 14 }}>•  Pode pausar e continuar até o prazo.</Txt>
          <Txt tone="muted" style={{ fontSize: 14 }}>•  {d.allow_retake ? 'Dá para refazer se a nota ficar abaixo do mínimo.' : 'Depois de finalizar, não dá para refazer.'}</Txt>
        </View>
      ) : null}
      {blocked && d.period_message ? <Notice tone="warning" icon="calendar" title={period === 'upcoming' ? 'Ainda não liberado' : 'Período encerrado'} text={d.period_message} /> : null}
      {erro ? <Notice tone="danger" title="Não foi possível iniciar" text={erro} /> : null}
      <View style={{ alignSelf: 'stretch', gap: space[2] }}>
        {inProgress && d.attempt_id ? (
          <Button variant="accent" block size="lg" icon="play" label="Continuar simulado" onPress={() => navigation.navigate('SimuladoExam', { examId: d.id, attemptId: d.attempt_id! })} />
        ) : canStart ? (
          <Button variant="accent" block size="lg" icon={status === 'abandoned' ? 'refresh' : 'play'} label={status === 'abandoned' ? 'Tentar novamente' : 'Iniciar simulado'} loading={start.isPending} onPress={iniciar} />
        ) : done ? (
          <Button block size="lg" iconRight="arrow-right" label="Ver correção" onPress={() => navigation.navigate('SimuladoDetalhe', { examId: d.id })} />
        ) : (
          <Button variant="secondary" block label="Ver detalhes" onPress={() => navigation.navigate('SimuladoDetalhe', { examId: d.id })} />
        )}
        {!done && d.subject ? (
          <Button variant="ghost" block icon="library" label="Treinar estes assuntos antes"
            onPress={() => navigation.getParent()?.navigate('Questoes', { screen: 'BancoPraticar', params: { subjectId: d.subject?.id } })} />
        ) : null}
      </View>
    </Card>
  );
}
