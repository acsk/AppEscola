import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { CatalogFilters, QuestionSetSummary } from '../../../services/practice.service';
import { usePracticeFacets, usePracticeSummary, useQuestionSets, useStartPracticeSession } from '../hooks';
import { TopicPicker } from '../components/TopicPicker';
import { formatPercent } from '../lib/format';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, BottomBar, Button, Card, Chip, Chips, Dot, EmptyState, Icon, IconButton, NewBanner, NewPill, Notice, Overline, PageBody,
  PageHeader, QuickAction, ScreenBody, Section, SegmentedControl, StepHeader, Txt, font, newLabel, radius, space,
  subjectColor, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoQuestoes'>;
const QUANTITIES = [5, 10, 20, 30] as const;
type Quantity = (typeof QUANTITIES)[number] | 'all';

/** Prática do aluno em quatro escolhas, com seleção de assuntos em diálogo. */
export function BancoQuestoesScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop, isWide } = useLayoutMode();

  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoQuestoes'>>();
  const presetSubject = route.params?.subjectId;
  const [subjectIds, setSubjectIds] = useState<number[]>(presetSubject ? [presetSubject] : []);
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState<Quantity>(10);
  const [situation, setSituation] = useState<'unanswered' | 'new' | 'all'>('new');
  const onlyNew = situation === 'new';
  const onlyUnanswered = situation === 'unanswered';
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const topics = (bySubject.data?.topics ?? []).filter((t) => !subjectIds.length || subjectIds.includes(t.subject_id));
  const available = current.data?.total ?? 0;
  const availableNew = current.data?.situations.new ?? 0;
  const availableUnanswered = current.data?.situations.unanswered ?? 0;
  const pool = onlyNew ? availableNew : onlyUnanswered ? availableUnanswered : available;
  const count = quantity === 'all' ? pool : Math.min(quantity, pool);
  const open = summary.data?.open_session ?? null;

  const subjectName = subjectIds.length ? subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name).join(', ') : 'Todas as matérias';
  const topicName = topicIds.length ? topics.filter((t) => topicIds.includes(t.id)).map((t) => t.name).join(', ') : 'Todos os assuntos';
  const fullTitle = `${subjectName} · ${topicName}`;
  const title = fullTitle.length > 120 ? `${fullTitle.slice(0, 117).trimEnd()}...` : fullTitle;

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

  const filtersPending = current.isFetching || current.isPlaceholderData;
  const begin = () => {
    if (!pool || filtersPending || start.isPending) return;
    setError(null);
    const filters: CatalogFilters = { ...scope, situation };
    start.mutate({ filters, options: { quantity: count, correction_mode: 'each', timed: false, title } }, {
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

  const underReview = summary.data?.questions_under_review ?? 0;
  const reviewNotice = underReview > 0 ? (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4 }}>
      <Icon name="clock" size={16} color={p.inkSubtle} />
      <Txt variant="bodySm" tone="subtle" style={{ flex: 1 }}>
        {underReview} {underReview === 1 ? 'questão está' : 'questões estão'} em análise pelo professor e {underReview === 1 ? 'volta' : 'voltam'} em breve.
      </Txt>
      <Pressable accessibilityRole="button" onPress={() => setReviewOpen(!reviewOpen)}><Txt variant="bodySm" tone="muted" style={font.bold}>Por quê?</Txt></Pressable>
    </View>
  ) : null;
  const reviewExplanation = reviewOpen ? <Notice tone="info" title="Questões em análise" text="Alunos informaram que elas têm erro. O professor está analisando e, em breve, elas voltam para você responder." /> : null;
  const topicPicker = topicsOpen ? <TopicPicker subjects={subjects} topics={topics} subjectIds={subjectIds} selected={topicIds}
    onClose={() => setTopicsOpen(false)} onApply={(ids) => { setTopicIds(ids); setTopicsOpen(false); }} /> : null;

  const choices = [
    { id: null, name: 'Todas', total, new: 0, color: null },
    ...subjects,
  ];
  const subjectChoices = (
    <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: 'wrap', gap: 10 }}>
      {choices.map((s) => {
        const selected = s.id === null ? !subjectIds.length : subjectIds.includes(s.id);
        return <Pressable key={s.id ?? 'all'} accessibilityRole="checkbox" accessibilityLabel={`${s.name}, ${s.total} questões`}
          accessibilityState={{ checked: selected }} onPress={() => s.id === null ? (setSubjectIds([]), setTopicIds([])) : toggleSubject(s.id)}
          style={{ flexGrow: isDesktop ? 1 : 0, flexBasis: isDesktop ? (isWide ? '30%' : '45%') : 'auto', minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: 12, minHeight: 76, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? p.ink : p.lineStrong, backgroundColor: selected ? p.surfaceSunken : p.surface }}>
          <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: selected ? 0 : 1.5, borderColor: p.lineStrong, backgroundColor: selected ? p.surfaceInverse : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {selected ? <Icon name="check" size={14} color={p.onInverse} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {s.id === null ? <Icon name="grid" size={16} /> : <Dot color={subjectColor(p, s.id, s.color)} />}
              <Txt variant="label" style={{ flexShrink: 1, ...font.bold }}>{s.name}</Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Txt variant="bodySm" tone="subtle">{s.total} questões</Txt>
              {s.new > 0 ? <NewPill label={newLabel(s.new)} /> : null}
            </View>
          </View>
        </Pressable>;
      })}
    </View>
  );
  const rowStyle = { padding: isDesktop ? 20 : 0, gap: 12, borderTopWidth: isDesktop ? 1 : 0, borderTopColor: p.line };
  const suggestions = topics.filter((t) => t.new > 0).sort((a, b) => b.new - a.new).slice(0, 3);
  const situationLabel = onlyNew ? 'Novas' : onlyUnanswered ? 'Não respondidas' : 'Todas';
  const steps = (
    <View style={isDesktop ? { backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.lg, overflow: 'hidden' } : { gap: 24 }}>
      <View style={{ ...rowStyle, borderTopWidth: 0 }}>
        <StepHeader n={1} title="Matéria" optional="pode marcar mais de uma" />
        {subjects.length ? subjectChoices : <EmptyState icon="library" title="Nenhuma questão para praticar ainda" text="Quando a escola liberar questões no banco, elas aparecem aqui." />}
      </View>
      {subjects.length ? <>
        <View style={rowStyle}>
          <StepHeader n={2} title="Assunto" optional="opcional" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Escolher assuntos: ${topicName}`} onPress={() => setTopicsOpen(true)} disabled={bySubject.isFetching}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: p.lineStrong, backgroundColor: p.surface }}>
            <Icon name="sort" size={20} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt variant="label" numberOfLines={2}>{topicIds.length ? `${topicIds.length} ${topicIds.length === 1 ? 'assunto selecionado' : 'assuntos selecionados'}` : 'Todos os assuntos'}</Txt>
              <Txt variant="bodySm" tone="subtle" numberOfLines={2}>{bySubject.isFetching ? 'Carregando assuntos…' : topicIds.length ? topicName : `${topics.length} assuntos · ${topics.filter((t) => t.new > 0).length} com questões novas`}</Txt>
            </View>
            <Txt variant="label">Escolher</Txt><Icon name="chevron-right" size={16} />
          </Pressable>
          {suggestions.length ? <Chips>
            {isDesktop ? <Txt variant="bodySm" tone="subtle" style={{ alignSelf: 'center' }}>Com novas:</Txt> : null}
            {suggestions.map((t) => <Chip key={t.id} label={t.name} selected={topicIds.includes(t.id)} onPress={() => toggleTopic(t.id)} trailing={<NewPill label={newLabel(t.new)} inverse={topicIds.includes(t.id)} />} />)}
          </Chips> : null}
        </View>
        <View style={{ flexDirection: isWide ? 'row' : 'column', gap: isDesktop ? 0 : 24 }}>
          <View style={{ ...rowStyle, flex: isWide ? 1.5 : undefined, minWidth: 0 }}>
            <StepHeader n={3} title="Quais questões" />
            <View accessibilityRole="radiogroup" accessibilityLabel="Quais questões" style={{ flexDirection: 'row', backgroundColor: p.surfaceSunken, padding: 3, borderRadius: radius.md }}>
              {(['unanswered', 'new', 'all'] as const).map((value, index) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: situation === value }} onPress={() => setSituation(value)}
                style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4, minHeight: 38, paddingVertical: 6, borderRadius: 9, backgroundColor: situation === value ? p.surface : 'transparent' }}>
                <Txt variant="label" style={{ fontSize: 13 }} tone={situation === value ? 'ink' : 'muted'}>{['Não respondi', 'Só novas', 'Todas'][index]}</Txt>
                {value === 'new' && availableNew > 0 ? <NewPill label={String(availableNew)} /> : null}
              </Pressable>)}
            </View>
            {onlyNew && !availableNew && availableUnanswered > 0 ? <Txt variant="bodySm" tone="subtle">Não há questões novas aqui. Escolha “Não respondi” para continuar praticando.</Txt> : null}
          </View>
          <View style={{ ...rowStyle, flex: isWide ? 1 : undefined, minWidth: 0, borderLeftWidth: isWide ? 1 : 0, borderLeftColor: p.line }}>
            <StepHeader n={4} title="Quantas" />
            <SegmentedControl label="Quantidade" options={QUANTITIES.map(String)} value={quantity === 'all' ? -1 : QUANTITIES.indexOf(quantity)} onChange={(i) => setQuantity(QUANTITIES[i])} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: quantity === 'all' }} onPress={() => setQuantity(quantity === 'all' ? 10 : 'all')}>
              <Txt variant="bodySm" tone={quantity === 'all' ? 'ink' : 'subtle'} style={quantity === 'all' ? font.bold : undefined}>{quantity === 'all' ? '✓ ' : ''}Usar todas ({pool})</Txt>
            </Pressable>
          </View>
        </View>
      </> : null}
    </View>
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
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={p.brand} />}>
          <PageBody maxWidth={1184}>
            <PageHeader title="Banco de questões" subtitle="Monte sua prática em 4 escolhas e aperte começar."
              actions={
                <View style={{ flexDirection: 'row', gap: space[3] }}>
                  <Button variant="ghost" icon="target" label="O que estudar" onPress={() => navigation.navigate('Aprendizagem')} />
                  <Button variant="ghost" icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} />
                </View>
              } />
            <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
                {banner}
                {continueAction}
                {steps}
                {setsSection}
              </View>
              <View style={{ width: isWide ? 340 : 280, gap: space[4] }}>
                <Card padding="lg" style={{ gap: 14 }}>
                  <Overline>Sua prática</Overline>
                  <Txt style={{ ...font.extrabold, fontSize: 30, lineHeight: 36 }}>{filtersPending ? '…' : count} {count === 1 ? 'questão' : 'questões'}</Txt>
                  <Txt tone="muted">{situationLabel} de <Txt style={font.bold}>{subjectName}</Txt>, {topicIds.length ? `sobre ${topicName}` : 'de todos os assuntos'}.</Txt>
                  <Button block size="lg" cta iconRight="arrow-right" label={ctaLabel} disabled={!pool || filtersPending} loading={start.isPending} onPress={begin} />
                  <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="info" size={16} color={p.inkSubtle} /><Txt variant="bodySm" tone="subtle" style={{ flex: 1 }}>A resposta certa aparece depois de cada questão.</Txt></View>
                  {errorNotice}
                  {summary.data ? <View style={{ flexDirection: 'row', marginHorizontal: -20, marginBottom: -20, marginTop: 4, borderTopWidth: 1, borderTopColor: p.line }}>
                    <View style={{ flex: 1, padding: 16, gap: 4 }}><Txt variant="caption" tone="subtle">Seu acerto no banco</Txt><Txt variant="titleSm">{formatPercent(summary.data.accuracy)}</Txt></View>
                    <View style={{ flex: 1, padding: 16, gap: 4, borderLeftWidth: 1, borderLeftColor: p.line }}><Txt variant="caption" tone="subtle">Respondidas</Txt><Txt variant="titleSm">{summary.data.answered.toLocaleString('pt-BR')}</Txt></View>
                  </View> : null}
                </Card>
                {reviewNotice}
                {reviewExplanation}
              </View>
            </View>
          </PageBody>
        </ScrollView>
        {topicPicker}
      </View>
    );
  }

  // ── Celular / tablet ──────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Banco de questões" subtitle="4 escolhas e aperte começar"
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={<View style={{ flexDirection: 'row' }}><IconButton icon="target" label="O que estudar" onPress={() => navigation.navigate('Aprendizagem')} /><IconButton icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} /></View>} />
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={p.brand} colors={[p.brand]} />}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {banner}
          {continueAction}
          {steps}
          {reviewNotice}
          {reviewExplanation}
          {errorNotice}
          {setsSection}
        </ScreenBody>
      </ScrollView>
      <BottomBar hint={`${situationLabel} · ${subjectName} · ${topicIds.length ? topicName : 'todos os assuntos'}`}>
        <View style={{ flex: 1 }}>
          <Button block size="lg" cta iconRight="arrow-right" label={ctaLabel} disabled={!pool || filtersPending} loading={start.isPending} onPress={begin} />
        </View>
      </BottomBar>
      {topicPicker}
    </View>
  );
}
