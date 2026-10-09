import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { LearningLevel, LearningPlan, LearningTopic } from '../../../services/practice.service';
import { useLearning, usePracticeFacets, useStartPracticeSession, useStartReinforcement } from '../hooks';
import { formatPercent } from '../lib/format';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, Button, Card, Icon, IconButton, MonthBars, Notice, Overline, PageBody, PageHeader, ScreenBody, SelectButton, StatTile, TopicGroup,
  TopicHead, TopicLine, TopicRow, Txt, font, radius, space, subjectColor, useLayoutMode, usePalette, type TopicLineStatus, type TopicStatus,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'Aprendizagem'>;

const LINE: Record<LearningLevel, TopicLineStatus> = { critical: 'reforcar', attention: 'atencao', good: 'bom', excellent: 'bom', insufficient: 'poucos' };
const ROW: Record<LearningLevel, TopicStatus> = { critical: 'reforcar', attention: 'atencao', good: 'bom', excellent: 'bom', insufficient: 'poucos' };
const pct = (v: number | null | undefined, d = 0) => (v == null ? '—' : formatPercent(v, d));

/**
 * Minha aprendizagem (protótipo "DesktopMinhaAprendizagem", substitui "O que estudar"):
 * quatro números, diagnóstico por assunto numa tabela agrupada por disciplina e, ao lado,
 * o plano de reforço com um único CTA e a evolução (últimos 30 dias contra os 30 anteriores).
 * Conta só a primeira tentativa de cada questão.
 */
export function AprendizagemScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();
  const { overview, topics, plans, evolution, refetch, isLoading, isError } = useLearning();
  // Questões ainda não respondidas por assunto (para "Praticar N" nos assuntos fora do plano).
  const unseen = usePracticeFacets({ situation: 'unanswered' });
  const reinforcement = useStartReinforcement();
  const session = useStartPracticeSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<number>(0);

  const planByTopic = useMemo(() => new Map((plans.data ?? []).map((pl) => [pl.topic_id, pl])), [plans.data]);
  const unseenByTopic = useMemo(() => new Map((unseen.data?.topics ?? []).map((t) => [t.id, t.total])), [unseen.data]);
  const colorBySubject = useMemo(() => new Map((unseen.data?.subjects ?? []).map((s) => [s.id, s.color])), [unseen.data]);
  const dotOf = (id: number | null) => (id ? subjectColor(p, id, colorBySubject.get(id)) : p.inkSubtle);

  const open = (attemptId: number, title: string) => navigation.navigate('BancoSimulado', { attemptId, title });
  const fail = (cause: unknown) => setError(getApiErrorMessage(cause, 'Não foi possível começar. Tente de novo.'));

  /** Assunto do plano: reforço da API (inéditas ou revisões vencidas). Fora do plano: sessão com as não respondidas do assunto. */
  const practiceTopic = (topic: LearningTopic) => {
    if (!topic.topic_id) return;
    setError(null);
    setBusy(`t${topic.topic_id}`);
    const plan = planByTopic.get(topic.topic_id);
    const done = { onSettled: () => setBusy(null), onError: fail };
    if (plan && plan.source !== 'preparing') {
      reinforcement.mutate(topic.topic_id, { ...done, onSuccess: (payload) => open(payload.attempt.id, `Reforço: ${topic.topic_name}`) });
      return;
    }
    const title = `${topic.subject_name} · ${topic.topic_name}`;
    session.mutate({
      filters: { topic_ids: [topic.topic_id], subject_ids: topic.subject_id ? [topic.subject_id] : [], situation: 'unanswered' },
      options: { quantity: 10, correction_mode: 'each', timed: false, title },
    }, { ...done, onSuccess: (payload) => open(payload.attempt.id, title) });
  };

  const ready = (plans.data ?? []).filter((pl) => pl.source !== 'preparing');
  const preparing = (plans.data ?? []).filter((pl) => pl.source === 'preparing');
  const planTotal = ready.reduce((acc, pl) => acc + pl.quantity, 0);

  /** "Praticar o plano": uma sessão com os assuntos do plano (novas primeiro); só revisões → reforço do primeiro assunto. */
  const practicePlan = () => {
    if (!ready.length) return;
    setError(null);
    setBusy('plan');
    const withUnseen = ready.filter((pl) => pl.source === 'unseen');
    const done = { onSettled: () => setBusy(null), onError: fail };
    if (!withUnseen.length) {
      reinforcement.mutate(ready[0].topic_id, { ...done, onSuccess: (payload) => open(payload.attempt.id, `Reforço: ${ready[0].topic_name}`) });
      return;
    }
    session.mutate({
      filters: { topic_ids: withUnseen.map((pl) => pl.topic_id), situation: 'unanswered' },
      options: { quantity: null, correction_mode: 'each', timed: false, title: 'Plano de reforço' },
    }, { ...done, onSuccess: (payload) => open(payload.attempt.id, 'Plano de reforço') });
  };

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={p.brand} /></View>;
  }

  const leading = drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} />
    : <IconButton icon="arrow-left" label="Voltar" onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('BancoQuestoes'))} />;
  if (isError || !overview.data || !topics.data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {!isDesktop ? <AppBar large title="Minha aprendizagem" leading={leading} /> : null}
        <ScreenBody gap={space[3]} style={{ paddingTop: space[4] }}>
          <Notice tone="danger" title="Não foi possível carregar" text={getApiErrorMessage(overview.error ?? topics.error, 'Tente de novo.')} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
        </ScreenBody>
      </View>
    );
  }

  const summary = overview.data;
  const subjects = [...new Map(topics.data.map((t) => [t.subject_id ?? 0, t.subject_name])).entries()];
  const visibleTopics = topics.data.filter((t) => !subjectFilter || (t.subject_id ?? 0) === subjectFilter);
  const groups = subjects
    .map(([id, name]) => ({ id, name, list: visibleTopics.filter((t) => (t.subject_id ?? 0) === id) }))
    .filter((g) => g.list.length);
  const firstPlanTopic = ready[0]?.topic_id ?? null;

  const actionOf = (t: LearningTopic) => {
    const plan = t.topic_id ? planByTopic.get(t.topic_id) : undefined;
    if (plan?.source === 'preparing') return { preparing: true, available: 0 };
    return { preparing: false, available: plan ? plan.quantity : (t.topic_id ? unseenByTopic.get(t.topic_id) ?? 0 : 0) };
  };
  const retakes = (t: LearningTopic) => (t.retakes ? `${t.retakes} ${t.retakes === 1 ? 'revisão' : 'revisões'}` : null);

  const comparison = evolution.data?.comparison;
  const monthsWithData = (evolution.data?.months ?? []).filter((m) => m.questions > 0);
  const bars = (evolution.data?.months ?? []).map((m, i, all) => ({ label: m.label, value: m.accuracy, count: m.questions, current: i === all.length - 1 }));

  const kpis = [
    { label: 'Questões respondidas', value: String(summary.questions), hint: 'diferentes' },
    { label: 'Acertos de primeira', value: String(summary.first_correct), hint: `de ${summary.questions}` },
    { label: 'Aproveitamento', value: pct(summary.accuracy, 1), hint: 'na primeira tentativa' },
    { label: 'Assuntos para reforçar', value: String(summary.reinforcement_topics), hint: summary.reinforcement_topics ? 'em alerta' : 'nenhum em alerta' },
  ];
  const kpiStyle = { backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: space[4] };

  const planCard = (
    <Card padding="lg" style={{ gap: 12 }}>
      <Overline>Seu plano de reforço</Overline>
      {!(plans.data ?? []).length ? (
        <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
          {summary.questions === 0 ? 'Responda algumas questões do banco para a gente montar o seu plano.' : 'Nenhum assunto pede reforço agora. Continue praticando!'}
        </Txt>
      ) : (
        <>
          <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20, marginTop: -4 }}>
            {summary.reinforcement_topics ? 'Comece por estes assuntos: é onde você mais errou.' : 'Pratique estes assuntos para a gente entender onde você precisa de ajuda.'}
          </Txt>
          <View>
            {ready.map((pl: LearningPlan, i) => (
              <View key={pl.topic_id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.line }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.surfaceInverse, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ ...font.extrabold, fontSize: 13, color: p.onInverse }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{pl.topic_name}</Txt>
                  <Txt variant="bodySm" tone="subtle">
                    {pl.source === 'review' ? `${pl.quantity} ${pl.quantity === 1 ? 'questão para revisar' : 'questões para revisar'}` : `${pl.quantity} ${pl.quantity === 1 ? 'questão nova' : 'questões novas'}`}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
          {preparing.map((pl) => (
            <View key={pl.topic_id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: p.surfaceSunken }}>
              <Icon name="clock" size={18} color={p.inkSubtle} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">{pl.topic_name}</Txt>
                <Txt tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>Questões novas em preparação. Avisamos quando chegarem.</Txt>
              </View>
            </View>
          ))}
          {ready.length ? (
            <Button block size="lg" cta icon="play" label={isDesktop ? `Praticar o plano · ${planTotal} ${planTotal === 1 ? 'questão' : 'questões'}` : `Praticar o plano · ${planTotal}`} loading={busy === 'plan'} onPress={practicePlan} />
          ) : null}
        </>
      )}
    </Card>
  );

  const evolutionCard = (
    <Card style={{ gap: 10 }}>
      <Overline>Evolução</Overline>
      {comparison ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['Últimos 30 dias', comparison.current], ['30 dias anteriores', comparison.previous]].map(([label, c]) => {
            const data = c as typeof comparison.current;
            return (
              <View key={label as string} style={{ flex: 1, gap: 2, padding: 12, borderRadius: 10, backgroundColor: p.surfaceSunken }}>
                <Txt variant="caption" tone="muted">{label as string}</Txt>
                <Text style={{ ...font.extrabold, fontSize: 26, lineHeight: 32, color: data.questions ? p.ink : p.inkSubtle, fontVariant: ['tabular-nums'] }}>{data.questions ? pct(data.accuracy) : '—'}</Text>
                <Txt variant="caption" tone="subtle">{data.questions ? `${data.first_correct} de ${data.questions}` : 'sem respostas'}</Txt>
              </View>
            );
          })}
        </View>
      ) : null}
      {monthsWithData.length >= 2 ? <View style={{ marginTop: space[2] }}><MonthBars data={bars} height={120} /></View>
        : <Txt variant="caption" tone="subtle" style={{ lineHeight: 17 }}>O gráfico mês a mês aparece a partir do segundo mês de prática.</Txt>}
    </Card>
  );

  const note = (
    <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start', marginHorizontal: 12, marginTop: 4, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: p.surfaceSunken }}>
      <Icon name="alert" size={16} color={p.inkSubtle} />
      <Txt tone="muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
        Com menos de {summary.min_sample} respostas, o assunto fica em "Poucos dados". Responda mais para ver se ele está Bom, em Atenção ou para Reforçar.
      </Txt>
    </View>
  );
  const legend = (
    <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 20 }}>
      <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Reforçar</Txt>: menos de 50% · <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Atenção</Txt>: 50% a 69% ·{' '}
      <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Bom</Txt>: 70% ou mais · <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Poucos dados</Txt>: menos de {summary.min_sample} respostas no assunto.
    </Txt>
  );
  const errorNotice = error ? <Notice tone="danger" title="Não foi possível começar" text={error} /> : null;
  const refresh = <RefreshControl refreshing={overview.isRefetching} onRefresh={() => { refetch(); unseen.refetch(); }} tintColor={p.brand} colors={[p.brand]} />;
  const subtitle = 'Conta só a primeira vez que você responde cada questão. Revisar um erro não muda esse número.';
  const groupMeta = (list: LearningTopic[]) => {
    const q = list.reduce((acc, t) => acc + t.questions, 0);
    return `${list.length} ${list.length === 1 ? 'assunto' : 'assuntos'} · ${q} ${q === 1 ? 'questão' : 'questões'}`;
  };

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Minha aprendizagem" subtitle={subtitle}
            actions={<Button variant="secondary" icon="library" label="Banco de questões" onPress={() => navigation.navigate('BancoQuestoes')} />} />
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {kpis.map((k) => <StatTile key={k.label} label={k.label} value={k.value} hint={k.hint} style={kpiStyle} />)}
          </View>
          {errorNotice}
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
              <Card padding="none" style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 6 }}>
                  <Txt variant="titleSm" style={{ ...font.extrabold, flex: 1 }}>Diagnóstico por assunto</Txt>
                  {subjects.length > 1 ? (
                    <SelectButton label="Disciplina:" value={subjectFilter} onChange={setSubjectFilter}
                      options={[{ value: 0, label: 'Todas' }, ...subjects.map(([id, name]) => ({ value: id, label: name }))]} />
                  ) : null}
                </View>
                {topics.data.length ? (
                  <>
                    {note}
                    <TopicHead />
                    {groups.map((g) => (
                      <View key={g.id}>
                        <TopicGroup name={g.name} dot={dotOf(g.id || null)} meta={groupMeta(g.list)} />
                        {g.list.map((t, i) => {
                          const a = actionOf(t);
                          return (
                            <TopicLine key={`${t.subject_id}-${t.topic_id}`} first={i === 0} topic={t.topic_name} note={retakes(t)} count={t.questions} rate={t.accuracy}
                              status={LINE[t.level]} available={a.available} preparing={a.preparing} primary={t.topic_id != null && t.topic_id === firstPlanTopic}
                              loading={busy === `t${t.topic_id}`} onPractice={() => practiceTopic(t)} />
                          );
                        })}
                      </View>
                    ))}
                  </>
                ) : <Txt tone="subtle" style={{ padding: 12 }}>Responda questões do banco para ver o diagnóstico por assunto.</Txt>}
              </Card>
              {legend}
            </View>
            <View style={{ width: 360, gap: space[4] }}>
              {planCard}
              {evolutionCard}
            </View>
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  // ── Celular / tablet (sem protótipo próprio: o mesmo conteúdo empilhado) ─────
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Minha aprendizagem" subtitle="Conta a primeira vez de cada questão" leading={leading} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={20} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ gap: 10 }}>
            {[kpis.slice(0, 2), kpis.slice(2)].map((pair, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                {pair.map((k) => <StatTile key={k.label} label={k.label} value={k.value} hint={k.hint} style={kpiStyle} />)}
              </View>
            ))}
          </View>
          {errorNotice}
          {planCard}
          {groups.length ? groups.map((g) => (
            <Card key={g.id} padding="lg" style={{ gap: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingBottom: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotOf(g.id || null) }} />
                <Txt variant="titleSm" style={{ fontSize: 17, flex: 1 }}>{g.name}</Txt>
                <Txt variant="caption" tone="subtle">{groupMeta(g.list)}</Txt>
              </View>
              {g.list.map((t, i) => {
                const a = actionOf(t);
                return (
                  <TopicRow key={`${t.subject_id}-${t.topic_id}`} first={i === 0} topic={t.topic_name} status={ROW[t.level]} right={t.first_correct} total={t.questions}
                    available={a.preparing ? 0 : a.available} primary={t.topic_id != null && t.topic_id === firstPlanTopic} onPractice={() => practiceTopic(t)} />
                );
              })}
            </Card>
          )) : <Card><Txt tone="subtle">Responda questões do banco para ver o diagnóstico por assunto.</Txt></Card>}
          {legend}
          {evolutionCard}
          <View style={{ height: space[2], borderRadius: radius.sm }} />
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
