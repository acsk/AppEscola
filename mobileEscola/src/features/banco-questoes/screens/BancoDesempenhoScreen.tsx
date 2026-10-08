import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { PerformanceLevel, PerformanceSubject, PerformanceTopic } from '../../../services/practice.service';
import { usePracticeFacets, usePracticePerformance, useStartPracticeSession } from '../hooks';
import { formatPercent } from '../lib/format';
import {
  AppBar, Button, Card, Icon, IconButton, Notice, Overline, PageBody, PageHeader, ProgressBar, ScreenBody, Tag, TopicRow, Txt,
  font, space, subjectColor, useLayoutMode, usePalette, type TopicStatus,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoDesempenho'>;

const STATUS: Record<PerformanceLevel, TopicStatus> = { weak: 'reforcar', attention: 'atencao', good: 'bom', few_data: 'poucos', not_started: 'nao' };
/** Respostas para o "O que estudar" ficar confiável. */
const TARGET = 10;

/** O que estudar (protótipos "TelaOQueEstudar" e "DesktopOQueEstudar"): frase simples, assuntos por matéria e "Praticar" em cada um. */
export function BancoDesempenhoScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticePerformance();
  const facets = usePracticeFacets({ situation: 'all' });
  const start = useStartPracticeSession();
  const [startError, setStartError] = useState<string | null>(null);

  const refetchFacets = facets.refetch;
  useFocusEffect(useCallback(() => { refetch(); refetchFacets(); }, [refetch, refetchFacets]));

  const newByTopic = useMemo(() => new Map((facets.data?.topics ?? []).map((t) => [t.id, t.new])), [facets.data]);
  const newBySubject = useMemo(() => new Map((facets.data?.subjects ?? []).map((s) => [s.id, s.new])), [facets.data]);

  const practice = (subject: { id: number | null; name: string }, topic?: { id: number | null; name: string }) => {
    setStartError(null);
    const title = `${subject.name} · ${topic?.name ?? 'Todos os assuntos'}`;
    start.mutate({
      filters: { subject_ids: subject.id ? [subject.id] : [], topic_ids: topic?.id ? [topic.id] : [], situation: 'all' },
      options: { quantity: 10, correction_mode: 'each', timed: false, title },
    }, {
      onSuccess: (payload) => navigation.navigate('BancoSimulado', { attemptId: payload.attempt.id, title }),
      onError: (cause) => setStartError(getApiErrorMessage(cause, 'Não foi possível começar. Tente de novo.')),
    });
  };

  if (isLoading) return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={p.brand} /></View>;

  const back = <IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />;
  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {!isDesktop ? <AppBar large title="O que estudar" leading={back} /> : null}
        <ScreenBody gap={space[3]} style={{ paddingTop: space[4] }}>
          <Notice tone="danger" title="Não foi possível carregar" text={getApiErrorMessage(error, 'Tente de novo.')} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
        </ScreenBody>
      </View>
    );
  }

  const { overall } = data;
  const missing = Math.max(0, TARGET - overall.answered);
  const lowest = data.study_focus[0] ?? null;
  // Próximo passo: o assunto mais fraco; sem ele, a matéria com mais questões novas.
  const nextSubject = lowest ? null : [...data.subjects].filter((s) => s.available > 0)
    .sort((a, b) => (newBySubject.get(b.id ?? -1) ?? 0) - (newBySubject.get(a.id ?? -1) ?? 0) || a.answered - b.answered)[0] ?? null;

  const motivation = (
    <Card padding="lg" style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', gap: 14 }}>
      <Text style={{ ...font.extrabold, fontSize: 40, lineHeight: 44, color: p.ink, fontVariant: ['tabular-nums'] }}>{formatPercent(overall.accuracy)}</Text>
      <View style={{ flex: isDesktop ? 1 : undefined, alignSelf: 'stretch', gap: 2 }}>
        <Txt variant="titleSm">
          {overall.answered ? `Você acertou ${overall.correct} de ${overall.answered} ${overall.answered === 1 ? 'questão' : 'questões'}` : 'Você ainda não respondeu questões do banco'}
        </Txt>
        <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
          {missing ? `Responda mais ${missing} para a gente saber seus pontos fortes e fracos.` : 'Veja abaixo onde reforçar e o que já está bom.'}
        </Txt>
        {missing ? <View style={{ marginTop: space[2] }}><ProgressBar value={overall.answered} max={TARGET} size="sm" label="Respostas" /></View> : null}
      </View>
    </Card>
  );

  const legend = (
    <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 20 }}>
      <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Reforçar</Txt>: menos de 50% de acerto · <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Atenção</Txt>: 50% a 69% ·{' '}
      <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Bom</Txt>: 70% ou mais · <Txt variant="bodySm" tone="muted" style={{ ...font.bold }}>Poucos dados</Txt>: menos de {data.min_sample} respostas no assunto.
    </Txt>
  );

  const weakestTopicId = lowest?.topic.id ?? null;
  const subjectCard = (subject: PerformanceSubject) => (
    <Card key={String(subject.id ?? 'none')} padding="lg" style={{ gap: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjectColor(p, subject.id) }} />
          <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 17, flexShrink: 1 }}>{subject.name}</Txt>
        </View>
        {subject.answered ? <Text style={{ ...font.extrabold, fontSize: 20, color: p.ink, fontVariant: ['tabular-nums'] }}>{formatPercent(subject.accuracy)}</Text>
          : <Tag tone="outline" label="Não praticado" />}
      </View>
      {subject.topics.length ? subject.topics.map((topic: PerformanceTopic, i) => (
        <TopicRow key={String(topic.id ?? `none-${i}`)} first={i === 0} topic={topic.name} status={STATUS[topic.level]} right={topic.correct} total={topic.answered}
          available={topic.available} newCount={topic.id != null ? newByTopic.get(topic.id) : undefined} primary={topic.id != null && topic.id === weakestTopicId}
          onPractice={() => practice(subject, topic)} />
      )) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingTop: space[2] }}>
          <Txt variant="bodySm" tone="subtle">{subject.available} {subject.available === 1 ? 'questão para praticar' : 'questões para praticar'}</Txt>
          <Button size="sm" variant="secondary" icon="play" label="Praticar" disabled={!subject.available} onPress={() => practice(subject)} />
        </View>
      )}
    </Card>
  );

  const subjects = data.subjects.length
    ? data.subjects.map(subjectCard)
    : <Notice tone="info" title="Ainda não há questões do banco para praticar" text="Quando a escola liberar questões, os assuntos aparecem aqui." />;
  const errorNotice = startError ? <Notice tone="danger" title="Não foi possível começar" text={startError} /> : null;
  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); facets.refetch(); }} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    const next = lowest
      ? { title: `Reforce ${lowest.topic.name}`, text: lowest.reason === 'low_accuracy' ? `Você acerta ${formatPercent(lowest.accuracy)} neste assunto de ${lowest.subject.name}.` : `Você ainda não praticou este assunto de ${lowest.subject.name}.`, label: `Praticar ${lowest.topic.name}`, run: () => practice(lowest.subject, lowest.topic) }
      : nextSubject
        ? { title: `Comece por ${nextSubject.name}`, text: (newBySubject.get(nextSubject.id ?? -1) ?? 0) ? `Há ${newBySubject.get(nextSubject.id ?? -1)} questões novas esperando.` : 'É a matéria em que você menos praticou.', label: `Praticar ${nextSubject.name}`, run: () => practice(nextSubject) }
        : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="O que estudar" subtitle="Baseado nas suas respostas no banco de questões e nos simulados do banco"
            actions={<Button variant="secondary" icon="library" label="Banco de questões" onPress={() => navigation.navigate('BancoQuestoes')} />} />
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
              {motivation}
              {subjects}
            </View>
            <View style={{ width: 360, gap: space[4] }}>
              {next ? (
                <Card padding="lg" style={{ gap: 12 }}>
                  <Overline>Próximo passo</Overline>
                  <Text style={{ ...font.extrabold, fontSize: 17, color: p.ink }}>{next.title}</Text>
                  <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 19 }}>{next.text}</Txt>
                  <Button block size="lg" cta icon="play" label={next.label} loading={start.isPending} onPress={next.run} />
                  {errorNotice}
                </Card>
              ) : null}
              <Card style={{ gap: space[2] }}>
                <Overline>Como ler</Overline>
                {legend}
              </Card>
            </View>
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="O que estudar" subtitle="Baseado nas suas respostas no banco" leading={back} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {motivation}
          {errorNotice}
          {subjects}
          {legend}
          {start.isPending ? <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}><Icon name="clock" size={16} color={p.inkSubtle} /><Txt variant="bodySm" tone="subtle">Abrindo a prática…</Txt></View> : null}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
