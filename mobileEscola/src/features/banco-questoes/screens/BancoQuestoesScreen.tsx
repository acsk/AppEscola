import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { CatalogFilters, QuestionSetSummary } from '../../../services/practice.service';
import { usePracticeFacets, usePracticeSummary, useQuestionSets, useStartPracticeSession } from '../hooks';
import { formatPercent } from '../lib/format';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, BottomBar, Button, Card, Checkbox, Chip, Chips, EmptyState, Icon, IconButton, NewBanner, NewPill, Notice, Overline, PageBody,
  PageHeader, ProgressBar, QuickAction, ScreenBody, Section, SegmentedControl, StepHeader, SubjectTile, Txt, newLabel, radius, space,
  subjectColor, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoQuestoes'>;
const QUANTITIES = [5, 10, 20] as const;
type Quantity = (typeof QUANTITIES)[number];

/**
 * Banco de questões em uma tela só (protótipos "TelaBancoQuestoes" e "DesktopBancoQuestoes"), para alunos de 10 a 14 anos:
 * 1. matéria, 2. assunto (opcional), 3. quantas questões. Por padrão só entram questões novas que o aluno ainda não respondeu.
 * A sessão mostra a resposta certa depois de cada questão.
 */
export function BancoQuestoesScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();

  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoQuestoes'>>();
  const presetSubject = route.params?.subjectId;
  const [subjectIds, setSubjectIds] = useState<number[]>(presetSubject ? [presetSubject] : []);
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState<Quantity>(10);
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [onlyNew, setOnlyNew] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chegou de "Treinar estes assuntos antes": marca a matéria do simulado.
  useEffect(() => {
    if (presetSubject) { setSubjectIds([presetSubject]); setTopicIds([]); }
  }, [presetSubject]);

  const scope: CatalogFilters = useMemo(() => ({ subject_ids: subjectIds, topic_ids: topicIds }), [subjectIds, topicIds]);
  const all = usePracticeFacets({ situation: 'all' });
  const bySubject = usePracticeFacets({ subject_ids: subjectIds });
  const current = usePracticeFacets(scope);
  const summary = usePracticeSummary();
  const sets = useQuestionSets();
  const start = useStartPracticeSession();

  useFocusEffect(useCallback(() => {
    all.refetch(); current.refetch(); summary.refetch(); sets.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao voltar para a tela
  }, []));

  const subjects = all.data?.subjects ?? [];
  const total = all.data?.total ?? 0;
  const totalNew = all.data?.situations.new ?? 0;
  const topics = subjectIds.length ? (bySubject.data?.topics ?? []).filter((t) => subjectIds.includes(t.subject_id)) : [];
  const available = current.data?.total ?? 0;
  const availableNew = current.data?.situations.new ?? 0;
  const availableUnanswered = current.data?.situations.unanswered ?? 0;
  const pool = onlyNew ? availableNew : onlyUnanswered ? availableUnanswered : available;
  const count = Math.min(quantity, pool);
  const newInSession = Math.min(count, availableNew);
  const open = summary.data?.open_session ?? null;

  const subjectName = subjectIds.length ? subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name).join(', ') : 'Todas as matérias';
  const topicName = topicIds.length ? topics.filter((t) => topicIds.includes(t.id)).map((t) => t.name).join(', ') : 'Todos os assuntos';
  const title = `${subjectName} · ${topicName}`;

  // "7 de Português e 5 de Matemática"
  const newBreakdown = useMemo(() => {
    const parts = subjects.filter((s) => s.new > 0).sort((a, b) => b.new - a.new).map((s) => `${s.new} de ${s.name}`);
    if (parts.length <= 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
  }, [subjects]);

  const toggleSubject = (id: number) => {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setTopicIds([]);
  };
  const toggleTopic = (id: number) => setTopicIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const begin = () => {
    setError(null);
    const filters: CatalogFilters = { ...scope, situation: onlyNew ? 'new' : onlyUnanswered ? 'unanswered' : 'all' };
    start.mutate({ filters, options: { quantity, correction_mode: 'each', timed: false, title } }, {
      onSuccess: (payload) => navigation.navigate('BancoSimulado', { attemptId: payload.attempt.id, title }),
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível começar. Tente de novo.')),
    });
  };
  const openSet = (set: QuestionSetSummary) =>
    navigation.navigate('BancoSimulado', set.open_attempt_id ? { attemptId: set.open_attempt_id, title: set.title } : { setId: set.id, title: set.title });
  const refresh = () => { all.refetch(); bySubject.refetch(); current.refetch(); summary.refetch(); sets.refetch(); };

  const ctaLabel = !pool
    ? (onlyNew ? 'Sem questões novas aqui' : onlyUnanswered ? 'Você já respondeu estas' : 'Sem questões aqui')
    : `Começar ${count} ${count === 1 ? 'questão' : 'questões'}`;

  if (all.isLoading) {
    return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={p.brand} /></View>;
  }

  const banner = totalNew ? (
    <NewBanner count={totalNew} text={isDesktop && newBreakdown ? `${newBreakdown}. Elas aparecem marcadas com "novas" abaixo.` : newBreakdown} />
  ) : null;
  const continueAction = open ? (
    <QuickAction icon="play" title="Continuar de onde parei"
      subtitle={`${open.title ?? 'Sessão'} · questão ${Math.min(open.answered_count + 1, open.question_count)} de ${open.question_count}`}
      progress={open.question_count ? (open.answered_count / open.question_count) * 100 : 0}
      onPress={() => navigation.navigate('BancoSimulado', { attemptId: open.id, title: open.title ?? undefined })} />
  ) : null;

  const tiles = [
    <SubjectTile key="all" icon="grid" subject="Todas as matérias" count={total} newCount={totalNew} selected={!subjectIds.length}
      onPress={() => { setSubjectIds([]); setTopicIds([]); }} />,
    ...subjects.map((s) => (
      <SubjectTile key={s.id} subject={s.name} dot={subjectColor(p, s.id, s.color)} count={s.total} newCount={s.new}
        selected={subjectIds.includes(s.id)} onPress={() => toggleSubject(s.id)} />
    )),
  ];
  // Celular: "Todas as matérias" ocupa a linha inteira e o resto vai em 2 colunas. Desktop: 3 colunas.
  const cols = isDesktop ? 3 : 2;
  const [head, rest] = isDesktop ? [[] as React.ReactElement[], tiles] : [[tiles[0]], tiles.slice(1)];
  const rows: React.ReactElement[][] = [];
  for (let i = 0; i < rest.length; i += cols) rows.push(rest.slice(i, i + cols));
  const tileGrid = (
    <View style={{ gap: space[3] }}>
      {head.map((tile) => React.cloneElement(tile, { key: tile.key, style: { minHeight: 0 } }))}
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: space[3] }}>
          {row.map((tile) => <View key={tile.key} style={{ flex: 1, minWidth: 0 }}>{tile}</View>)}
          {Array.from({ length: cols - row.length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );

  const steps = (
    <>
      <View style={{ gap: space[3] }}>
        <StepHeader n={1} title="Escolha a matéria" />
        {subjects.length ? tileGrid : <EmptyState icon="library" title="Nenhuma questão para praticar ainda" text="Quando a escola liberar questões no banco, elas aparecem aqui." />}
      </View>
      {subjects.length ? (
        <View style={{ gap: space[3] }}>
          <StepHeader n={2} title="Escolha o assunto" optional="opcional" />
          {!subjectIds.length ? <Txt variant="bodySm" tone="subtle">Escolha uma matéria para ver os assuntos dela.</Txt>
            : !topics.length ? <Txt variant="bodySm" tone="subtle">Esta matéria ainda não tem assuntos cadastrados.</Txt>
            : (
              <Chips>
                <Chip label="Todos os assuntos" selected={!topicIds.length} onPress={() => setTopicIds([])} />
                {topics.map((t) => {
                  const on = topicIds.includes(t.id);
                  return <Chip key={t.id} label={t.name} count={t.total} selected={on} onPress={() => toggleTopic(t.id)}
                    trailing={t.new ? <NewPill label={newLabel(t.new)} inverse={on} /> : null} />;
                })}
              </Chips>
            )}
        </View>
      ) : null}
      {subjects.length ? (
        <View style={{ gap: space[3] }}>
          <StepHeader n={3} title="Quantas questões?" />
          <View style={{ maxWidth: isDesktop ? 360 : undefined }}>
            <SegmentedControl label="Quantidade" options={QUANTITIES.map(String)} value={QUANTITIES.indexOf(quantity)} onChange={(i) => setQuantity(QUANTITIES[i])} />
          </View>
          <Checkbox large label="Ainda não respondi" count={availableUnanswered} checked={onlyUnanswered}
            onPress={() => {
              setOnlyUnanswered((on) => {
                if (on) setOnlyNew(false);
                return !on;
              });
            }} />
          <Checkbox large label="Só questões novas" checked={onlyNew} disabled={!availableNew && !onlyNew}
            onPress={() => {
              setOnlyNew((on) => {
                if (!on) setOnlyUnanswered(true);
                return !on;
              });
            }}
            trailing={availableNew ? <NewPill label={String(availableNew)} /> : null} />
          {onlyNew && !availableNew && availableUnanswered > 0 ? (
            <Txt variant="bodySm" tone="subtle">Não há questões novas aqui. Desmarque “Só questões novas” para praticar as que você ainda não respondeu.</Txt>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const setsSection = sets.data?.length ? (
    <Section title="Simulados do banco">
      <Txt variant="bodySm" tone="subtle" style={{ marginTop: -6 }}>Montados pela escola. A correção aparece quando você finaliza.</Txt>
      {sets.data.map((set) => (
        <Card key={set.id} onPress={() => openSet(set)} accessibilityLabel={set.title} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {set.exam_type?.logo_url ? <Image source={{ uri: set.exam_type.logo_url }} style={{ width: 34, height: 34 }} resizeMode="contain" />
              : <Icon name="clipboard" size={20} color={p.inkMuted} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="titleSm" numberOfLines={1}>{set.title}</Txt>
            <Txt variant="bodySm" tone="subtle" numberOfLines={1}>
              {[`${set.questions_count} questões`, set.exam_type?.label, set.last_result ? `melhor ${set.last_result.correct}/${set.last_result.total}` : null].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Button size="sm" variant="secondary" decorative iconRight="arrow-right" label={set.open_attempt_id ? 'Continuar' : set.attempts_count ? 'Refazer' : 'Começar'} />
        </Card>
      ))}
    </Section>
  ) : null;

  const errorNotice = error ? <Notice tone="danger" title="Não foi possível começar" text={error} /> : null;

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (isDesktop) {
    const rows: [string, string][] = [
      ['Matéria', subjectIds.length ? subjectName : 'Todas'],
      ['Assunto', topicIds.length ? topicName : 'Todos'],
      ['Questões', !pool ? '—' : onlyNew ? `${count} novas` : onlyUnanswered ? `${count} não respondidas${newInSession ? ` (${newLabel(newInSession)})` : ''}` : `${count}${newInSession ? ` (${newLabel(newInSession)})` : ''}`],
      ['Resposta certa', 'Depois de cada questão'],
    ];
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={p.brand} />}>
        <PageBody maxWidth="none">
          <PageHeader title="Banco de questões" subtitle={`Escolha o que praticar e aperte começar. ${total.toLocaleString('pt-BR')} questões no total.`}
            actions={
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <Button variant="secondary" icon="target" label="O que estudar" onPress={() => navigation.navigate('Aprendizagem')} />
                <Button variant="secondary" icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} />
              </View>
            } />
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, gap: 28 }}>
              {banner}
              {continueAction}
              {steps}
              {setsSection}
            </View>
            <View style={{ width: 360, gap: space[4] }}>
              <Card padding="lg" style={{ gap: 4 }}>
                <Overline>Sua prática</Overline>
                <View style={{ height: 8 }} />
                {rows.map(([label, value], i) => (
                  <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3], paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.line, marginBottom: i === rows.length - 1 ? 12 : 0 }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>{label}</Txt>
                    <Txt variant="label" style={{ flexShrink: 1, textAlign: 'right', fontSize: 14 }}>{value}</Txt>
                  </View>
                ))}
                <Button block size="lg" cta iconRight="arrow-right" label={ctaLabel} disabled={!pool} loading={start.isPending} onPress={begin} />
                {errorNotice ? <View style={{ marginTop: space[3] }}>{errorNotice}</View> : null}
              </Card>
              {summary.data ? (
                <Card style={{ gap: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>Seu acerto no banco</Txt>
                    <Txt variant="label">{formatPercent(summary.data.accuracy)}</Txt>
                  </View>
                  <ProgressBar value={summary.data.accuracy ?? 0} tone="ink" size="sm" label="Acerto" />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: p.line }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>Questões respondidas</Txt>
                    <Txt variant="label">{summary.data.answered.toLocaleString('pt-BR')}</Txt>
                  </View>
                </Card>
              ) : null}
            </View>
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  // ── Celular / tablet ──────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Banco de questões" subtitle="Escolha o que praticar e aperte começar"
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={<IconButton icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} />} />
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={p.brand} colors={[p.brand]} />}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {banner}
          {continueAction}
          {steps}
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1 }}><Button variant="secondary" size="sm" block icon="target" label="O que estudar" onPress={() => navigation.navigate('Aprendizagem')} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" size="sm" block icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} /></View>
          </View>
          {errorNotice}
          {setsSection}
        </ScreenBody>
      </ScrollView>
      <BottomBar hint="Depois de cada questão você vê a resposta certa.">
        <View style={{ flex: 1 }}>
          <Button block size="lg" cta iconRight="arrow-right" label={ctaLabel} disabled={!pool} loading={start.isPending} onPress={begin} />
        </View>
      </BottomBar>
    </View>
  );
}
