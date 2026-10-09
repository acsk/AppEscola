import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { LearningLevel, LearningPlan, LearningTopic } from '../../../services/practice.service';
import { useLearning, useStartReinforcement } from '../hooks';
import { formatPercent } from '../lib/format';
import {
  AppBar, Button, Card, IconButton, MonthBars, Notice, PageBody, PageHeader, ProgressBar, ScreenBody, Tag, Txt,
  font, space, useLayoutMode, usePalette, type TagTone,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'Aprendizagem'>;

const TONE: Record<LearningLevel, TagTone> = {
  critical: 'danger',
  attention: 'warning',
  good: 'success',
  excellent: 'brand',
  insufficient: 'neutral',
};

const BAR: Record<LearningLevel, 'danger' | 'brand' | 'success'> = {
  critical: 'danger',
  attention: 'brand',
  good: 'success',
  excellent: 'success',
  insufficient: 'brand',
};

/** Diagnóstico da primeira tentativa e o plano de reforço do aluno. */
export function AprendizagemScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const { overview, topics, plans, evolution, refetch, isLoading, isError } = useLearning();
  const start = useStartReinforcement();
  const [error, setError] = useState<string | null>(null);
  const [busyTopic, setBusyTopic] = useState<number | null>(null);

  const practice = (plan: LearningPlan) => {
    if (plan.source === 'preparing' || !plan.topic_id) return;
    setError(null);
    setBusyTopic(plan.topic_id);
    start.mutate(plan.topic_id, {
      onSuccess: (payload) => navigation.navigate('BancoSimulado', { attemptId: payload.attempt.id, title: `Reforço: ${plan.topic_name}` }),
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível começar o reforço.')),
      onSettled: () => setBusyTopic(null),
    });
  };

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={p.brand} /></View>;
  }

  const back = <IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />;
  if (isError || !overview.data || !topics.data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {!isDesktop ? <AppBar large title="Minha Aprendizagem" leading={back} /> : null}
        <ScreenBody gap={space[3]} style={{ paddingTop: space[4] }}>
          <Notice tone="danger" title="Não foi possível carregar" text={getApiErrorMessage(overview.error, 'Tente de novo.')} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
        </ScreenBody>
      </View>
    );
  }

  const summary = overview.data;
  const months = (evolution.data?.months ?? []).map((month, index, all) => ({
    label: month.label,
    value: month.accuracy,
    count: month.questions,
    current: index === all.length - 1,
  }));
  const comparison = evolution.data?.comparison;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {!isDesktop ? <AppBar large title="Minha Aprendizagem" leading={back} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={() => refetch()} tintColor={p.brand} />} contentContainerStyle={{ paddingBottom: space[8] }}>
        <PageBody>
          {isDesktop ? <PageHeader title="Minha Aprendizagem" subtitle="O aproveitamento conta a primeira tentativa. Revisar um erro não muda esse número." /> : null}
          {!isDesktop ? <Txt tone="muted" style={{ marginBottom: space[3] }}>O aproveitamento conta a primeira tentativa. Revisar um erro não muda esse número.</Txt> : null}
          {error ? <Notice tone="danger" text={error} /> : null}

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space[3], marginBottom: space[4] }}>
            <Summary label="Questões distintas" value={String(summary.questions)} />
            <Summary label="Acertos na estreia" value={String(summary.first_correct)} />
            <Summary label="Aproveitamento" value={formatPercent(summary.accuracy, 1)} />
            <Summary label="Assuntos para reforçar" value={String(summary.reinforcement_topics)} />
          </View>

          <Txt variant="titleSm" style={{ marginBottom: space[2] }}>Seu plano de reforço</Txt>
          {(plans.data ?? []).length === 0 ? (
            <Card padding="lg" style={{ marginBottom: space[4] }}>
              <Txt tone="muted">{summary.questions === 0 ? 'Responda algumas questões do banco para montar o seu plano.' : 'Nenhum assunto pede reforço agora.'}</Txt>
            </Card>
          ) : (
            <View style={{ gap: space[3], marginBottom: space[4] }}>
              {(plans.data ?? []).map((plan, index) => (
                <Card key={plan.topic_id} padding="lg">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <Tag tone={TONE[plan.level]} label={plan.label} />
                    <Txt variant="titleSm">{plan.topic_name}</Txt>
                    <Txt tone="muted">{formatPercent(plan.accuracy, 0)}</Txt>
                  </View>
                  <Txt variant="bodySm" tone="subtle" style={{ marginTop: 4 }}>{plan.subject_name}</Txt>
                  <Txt style={{ marginTop: space[2], marginBottom: space[3] }}>{plan.message}</Txt>
                  <Button
                    label={plan.action}
                    icon={plan.source === 'preparing' ? 'clock' : 'play'}
                    variant={index === 0 ? 'primary' : 'secondary'}
                    disabled={plan.source === 'preparing' || busyTopic === plan.topic_id}
                    onPress={() => practice(plan)}
                  />
                </Card>
              ))}
            </View>
          )}

          <Txt variant="titleSm" style={{ marginBottom: space[2] }}>Diagnóstico por assunto</Txt>
          <Card padding="lg" style={{ marginBottom: space[4] }}>
            {topics.data.length === 0 ? <Txt tone="muted">Ainda não há respostas para diagnosticar.</Txt> : topics.data.map((topic, index) => (
              <TopicLine key={`${topic.subject_id}-${topic.topic_id}`} topic={topic} first={index === 0} onPractice={() => {
                const plan = (plans.data ?? []).find((item) => item.topic_id === topic.topic_id);
                if (plan) practice(plan);
              }} busy={busyTopic === topic.topic_id} canPractice={(plans.data ?? []).some((item) => item.topic_id === topic.topic_id && item.source !== 'preparing')} />
            ))}
          </Card>

          <Txt variant="titleSm" style={{ marginBottom: space[2] }}>Evolução</Txt>
          <Card padding="lg">
            {months.length === 0 ? <Txt tone="muted">A evolução aparece depois das primeiras respostas.</Txt> : (
              <>
                <Txt variant="bodySm" tone="subtle" style={{ marginBottom: space[3] }}>Aproveitamento da primeira tentativa, mês a mês.</Txt>
                <MonthBars data={months} />
                <View style={{ marginTop: space[4], gap: space[2] }}>
                  {(evolution.data?.months ?? []).map((month) => (
                    <Txt key={month.month} variant="bodySm" tone="subtle">{month.label}: {month.first_correct} acertos e {month.first_wrong} erros em {month.questions} questões</Txt>
                  ))}
                </View>
              </>
            )}
            {comparison ? (
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space[3], marginTop: space[4] }}>
                <Summary label="Últimos 30 dias" value={formatPercent(comparison.current.accuracy, 0)} hint={`${comparison.current.first_correct} de ${comparison.current.questions}`} />
                <Summary label="30 dias anteriores" value={formatPercent(comparison.previous.accuracy, 0)} hint={`${comparison.previous.first_correct} de ${comparison.previous.questions}`} />
              </View>
            ) : null}
          </Card>
        </PageBody>
      </ScrollView>
    </View>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="lg" style={{ flex: 1 }}>
      <Txt variant="bodySm" tone="subtle">{label}</Txt>
      <Txt style={{ ...font.extrabold, fontSize: 28, lineHeight: 34 }}>{value}</Txt>
      {hint ? <Txt variant="caption" tone="subtle">{hint}</Txt> : null}
    </Card>
  );
}

function TopicLine({ topic, first, onPractice, busy, canPractice }: {
  topic: LearningTopic;
  first: boolean;
  onPractice: () => void;
  busy: boolean;
  canPractice: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: p.line, gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Txt variant="titleSm" style={{ fontSize: 15 }}>{topic.topic_name}</Txt>
        <Tag tone={TONE[topic.level]} label={topic.label} />
      </View>
      <Txt variant="bodySm" tone="subtle">{topic.subject_name} · {topic.questions} {topic.questions === 1 ? 'questão' : 'questões'}{topic.retakes ? ` · ${topic.retakes} revisões` : ''}</Txt>
      <ProgressBar value={topic.accuracy ?? 0} tone={BAR[topic.level]} label={topic.topic_name} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <Txt style={{ ...font.bold }}>{formatPercent(topic.accuracy, 0)}</Txt>
        <Button size="sm" variant="secondary" icon="play" label="Iniciar reforço" disabled={!canPractice || busy} onPress={onPractice} />
      </View>
    </View>
  );
}
