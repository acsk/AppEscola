import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { CatalogFilters, CatalogQuestion, QuestionSetSummary, SessionOptions } from '../../../services/practice.service';
import {
  usePracticeCatalog, usePracticeFacets, usePracticePerformance, usePracticeSummary, useQuestionSets, useStartPracticeSession, useToggleSavedQuestion,
} from '../hooks';
import { formatPercent } from '../lib/format';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  ActiveFilterPills, BankFiltersPanel, BankFiltersSheet, DEFAULT_SESSION, SessionOptionsFields, activeFilterCount, sessionCount, sessionHint,
  useBankFilters, useSessionTitle,
} from '../components/bankFilters';
import {
  AppBar, BottomBar, Button, Card, EmptyState, Icon, IconButton, Notice, Overline, PageBody, PageHeader, ProgressBar, QuestionRow, QuickAction,
  ScreenBody, SearchField, Section, SelectButton, Sheet, Tag, Txt, layout, radius, space, subjectColor, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoQuestoes'>;
type Sort = 'recent' | 'oldest';
const SORTS: { value: Sort; label: string }[] = [{ value: 'recent', label: 'Mais recentes' }, { value: 'oldest', label: 'Mais antigas' }];

/** Espera o aluno parar de digitar antes de consultar. */
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const plural = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'questão' : 'questões'}`;

/** Banco de questões (protótipos "TelaBancoQuestoes" e "DesktopBancoQuestoes"). */
export function BancoQuestoesScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop, isWide } = useLayoutMode();
  const bank = useBankFilters();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim());
  const filters: CatalogFilters = useMemo(() => ({ ...bank.filters, search: debouncedSearch }), [bank.filters, debouncedSearch]);
  const [sort, setSort] = useState<Sort>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [session, setSession] = useState<SessionOptions>(DEFAULT_SESSION);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = usePracticeSummary();
  const performance = usePracticePerformance();
  const sets = useQuestionSets();
  const facets = usePracticeFacets(filters);
  const allFacets = usePracticeFacets({ situation: 'all' });
  const catalog = usePracticeCatalog(filters, sort);
  const toggleSaved = useToggleSavedQuestion();
  const start = useStartPracticeSession();
  const title = useSessionTitle(filters, facets.data);

  useFocusEffect(useCallback(() => {
    summary.refetch(); sets.refetch(); performance.refetch(); allFacets.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao voltar para a tela
  }, []));

  useEffect(() => setExpanded(false), [filters, sort]);

  const items: CatalogQuestion[] = catalog.data?.pages.flatMap((pg) => pg.items) ?? [];
  const matching = catalog.data?.pages[0]?.total ?? facets.data?.total ?? 0;
  const available = facets.data?.total ?? 0;
  const count = sessionCount(session, available);
  const filterCount = activeFilterCount(bank.filters);
  const focus = performance.data?.study_focus?.[0] ?? null;
  const open = summary.data?.open_session ?? null;
  const wrongCount = allFacets.data?.situations.wrong ?? 0;

  const refresh = () => { catalog.refetch(); facets.refetch(); allFacets.refetch(); summary.refetch(); sets.refetch(); };

  const startSession = (f: CatalogFilters, opts: SessionOptions, sessionTitle: string) => {
    setError(null);
    start.mutate({ filters: f, options: { ...opts, title: sessionTitle } }, {
      onSuccess: (payload) => navigation.navigate('BancoSimulado', { attemptId: payload.attempt.id, title: sessionTitle }),
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível montar a sessão.')),
    });
  };
  const openSet = (set: QuestionSetSummary) =>
    navigation.navigate('BancoSimulado', set.open_attempt_id ? { attemptId: set.open_attempt_id, title: set.title } : { setId: set.id, title: set.title });
  /** Tocar numa questão abre só ela, com a correção na hora. */
  const openQuestion = (q: CatalogQuestion) =>
    startSession({ search: `#${q.id}` }, { quantity: 10, correction_mode: 'each', timed: false }, `Questão #${q.id}`);

  const subtitle = [
    allFacets.data ? plural(allFacets.data.total) : null,
    summary.data
      ? `você já respondeu ${summary.data.answered.toLocaleString('pt-BR')}${isDesktop && summary.data.accuracy != null ? ` e acerta ${formatPercent(summary.data.accuracy)}` : ''}`
      : null,
  ].filter(Boolean).join(' · ');

  // Começar rápido: continuar, revisar erros e reforçar o assunto mais fraco.
  const quickActions: React.ReactElement[] = [];
  if (open) {
    quickActions.push(
      <QuickAction key="continue" icon="play" title="Continuar sessão"
        subtitle={`${open.title ?? 'Sessão'} · ${open.answered_count} de ${open.question_count}`}
        progress={open.question_count ? (open.answered_count / open.question_count) * 100 : 0}
        onPress={() => navigation.navigate('BancoSimulado', { attemptId: open.id, title: open.title ?? undefined })} />,
    );
  }
  if (wrongCount) {
    quickActions.push(
      <QuickAction key="wrong" icon="refresh" title="Revisar o que errei" subtitle={plural(wrongCount)}
        onPress={() => startSession({ situation: 'wrong' }, { ...DEFAULT_SESSION, quantity: null }, 'Revisar o que errei')} />,
    );
  }
  if (focus) {
    quickActions.push(
      <QuickAction key="focus" icon="target" title={`Reforçar ${focus.topic.name}`}
        subtitle={focus.reason === 'not_started' ? `Você ainda não praticou · ${focus.available} novas` : `Você acerta ${formatPercent(focus.accuracy)} · ${focus.available} questões`}
        onPress={() => startSession({ topic_ids: [focus.topic.id], subject_ids: focus.subject.id ? [focus.subject.id] : [] }, DEFAULT_SESSION, `Reforçar ${focus.topic.name}`)} />,
    );
  }
  if (quickActions.length < 3) {
    quickActions.push(
      <QuickAction key="study" icon="chart" title="O que estudar" subtitle="Seu desempenho por disciplina e assunto" onPress={() => navigation.navigate('BancoDesempenho')} />,
    );
  }

  const row = (q: CatalogQuestion, compact: boolean) => (
    <QuestionRow key={q.id} compact={compact} id={q.id} subject={q.subject?.name ?? 'Sem disciplina'} subjectColor={subjectColor(p, q.subject?.id)}
      topic={q.topic} text={q.text || (q.has_image ? 'Questão com imagem' : '')} difficulty={q.difficulty} source={q.source} rate={q.rate}
      status={q.status} saved={q.saved} onToggleSave={() => toggleSaved.mutate({ questionId: q.id, saved: !q.saved })} onPress={() => openQuestion(q)} />
  );

  const results = (compact: boolean) => {
    if (catalog.isLoading) return <ActivityIndicator color={p.brand} />;
    if (catalog.isError) return <Notice tone="danger" title="Não foi possível carregar as questões" text={getApiErrorMessage(catalog.error, 'Tente de novo.')} />;
    if (!items.length) {
      return allFacets.data?.total
        ? <EmptyState icon="search" title="Nenhuma questão com esses filtros" text="Tire um filtro ou mude a busca para ver mais questões." />
        : <EmptyState icon="library" title="Nenhuma questão para praticar ainda" text="Quando a escola liberar questões no banco, elas aparecem aqui." />;
    }
    // No celular mostra 3 e "Ver mais questões" abre a lista; daí em diante carrega de 20 em 20.
    const visible = compact && !expanded ? items.slice(0, 3) : items;
    const hasMore = (compact && !expanded && items.length > 3) || !!catalog.hasNextPage;
    return (
      <>
        {visible.map((q) => row(q, compact))}
        {hasMore ? (
          <Button variant={compact ? 'ghost' : 'secondary'} block loading={catalog.isFetchingNextPage}
            label={compact ? 'Ver mais questões' : 'Carregar mais 20'}
            onPress={() => (compact && !expanded ? setExpanded(true) : catalog.fetchNextPage())} />
        ) : null}
      </>
    );
  };

  const setsSection = sets.data?.length ? (
    <Section title="Simulados do banco">
      <Txt variant="bodySm" tone="subtle" style={{ marginTop: -6 }}>Montados pela escola. Não valem nota: a correção aparece quando você finaliza.</Txt>
      {sets.data.map((set) => (
        <Card key={set.id} onPress={() => openSet(set)} accessibilityLabel={set.title} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {set.exam_type?.logo_url ? <Image source={{ uri: set.exam_type.logo_url }} style={{ width: 34, height: 34 }} resizeMode="contain" />
              : <Icon name="clipboard" size={20} color={p.inkMuted} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="titleSm" numberOfLines={1}>{set.title}</Txt>
            <Txt variant="bodySm" tone="subtle" numberOfLines={1}>
              {[plural(set.questions_count), set.exam_type?.label, set.last_result ? `melhor ${set.last_result.correct}/${set.last_result.total}` : null].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Button size="sm" decorative iconRight="arrow-right" label={set.open_attempt_id ? 'Continuar' : set.attempts_count ? 'Refazer' : 'Começar'} />
        </Card>
      ))}
    </Section>
  ) : null;

  const errorNotice = error ? <Notice tone="danger" title="Não foi possível começar" text={error} /> : null;
  const searchField = <SearchField value={search} onChangeText={setSearch} placeholder="Buscar assunto, palavra ou nº da questão" />;

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (isDesktop) {
    const accuracy = summary.data?.accuracy ?? null;
    const sessionCard = (
      <View style={{ gap: space[4] }}>
        <Card padding="lg" style={{ gap: 18 }}>
          <View>
            <Overline>Sua sessão</Overline>
            <Txt variant="titleSm" style={{ fontSize: 17, marginTop: 4 }}>{title}</Txt>
          </View>
          <SessionOptionsFields value={session} onChange={setSession} />
          <Button block size="lg" cta iconRight="arrow-right" disabled={!available} loading={start.isPending}
            label={available ? `Começar ${plural(count)}` : 'Sem questões neste filtro'} onPress={() => startSession(filters, session, title)} />
          {available ? (
            <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center', marginTop: -6 }}>
              Sorteadas entre as {available.toLocaleString('pt-BR')} do filtro. Você pode pausar quando quiser.
            </Txt>
          ) : null}
          {errorNotice}
        </Card>
        {/* Em 2 colunas a sessão fica acima da lista; o histórico só aparece com a coluna lateral. */}
        {isWide ? <Card style={{ gap: 10 }}>
          <Overline>Seu histórico</Overline>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt tone="muted" style={{ fontSize: 14 }}>Acerto</Txt>
            <Txt variant="label">{formatPercent(accuracy)}</Txt>
          </View>
          <ProgressBar value={accuracy ?? 0} tone={(accuracy ?? 0) >= 70 ? 'success' : 'danger'} size="sm" label="Acerto" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt tone="muted" style={{ fontSize: 14 }}>Respondidas</Txt>
            <Txt variant="label">{(summary.data?.answered ?? 0).toLocaleString('pt-BR')}</Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt tone="muted" style={{ fontSize: 14 }}>Para revisar</Txt>
            <Txt variant="label">{wrongCount.toLocaleString('pt-BR')}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button variant="ghost" size="sm" icon="chart" label="O que estudar" onPress={() => navigation.navigate('BancoDesempenho')} />
            <Button variant="ghost" size="sm" icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} />
          </View>
        </Card> : null}
      </View>
    );

    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={catalog.isRefetching && !catalog.isFetchingNextPage} onRefresh={refresh} tintColor={p.brand} />}>
        <PageBody maxWidth="none">
          <PageHeader title="Banco de questões" subtitle={subtitle || undefined} actions={<View style={{ width: 380, maxWidth: '100%' }}>{searchField}</View>} />
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            {quickActions.map((qa) => <View key={qa.key} style={{ flex: 1, minWidth: 0 }}>{qa}</View>)}
          </View>
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
            <View style={{ width: layout.filtersW }}>
              <BankFiltersPanel filters={bank.filters} facets={facets.data} onChange={bank.update} onClear={bank.clear} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
              {filterCount ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
                  <ActiveFilterPills filters={bank.filters} facets={facets.data} onChange={bank.update} onClear={bank.clear} />
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingVertical: 4 }}>
                <Txt style={{ flexShrink: 1 }}>
                  <Txt variant="titleSm" style={{ fontSize: 15 }}>{plural(matching)}</Txt>
                  <Txt tone="muted" style={{ fontSize: 14 }}> correspondem aos filtros</Txt>
                </Txt>
                <SelectButton label="Ordenar:" value={sort} options={SORTS} onChange={setSort} />
              </View>
              {/* Abaixo de 1360px a sessão sobe para cima da lista (2 colunas). */}
              {!isWide ? sessionCard : null}
              {results(false)}
              {setsSection}
            </View>
            {isWide ? <View style={{ width: layout.asideW }}>{sessionCard}</View> : null}
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  // ── Celular / tablet ──────────────────────────────────────────────────────
  const savedOnly = bank.filters.situation === 'saved';
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Banco de questões" subtitle={subtitle || undefined}
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={<IconButton icon="bookmark" label={savedOnly ? 'Mostrar todas as questões' : 'Questões salvas'} color={savedOnly ? p.brandInk : undefined}
          onPress={() => bank.update({ situation: savedOnly ? 'all' : 'saved' })} />} />
      <ScrollView keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={catalog.isRefetching && !catalog.isFetchingNextPage} onRefresh={refresh} tintColor={p.brand} colors={[p.brand]} />}>
        <ScreenBody gap={22} style={{ paddingTop: space[2] }}>
          {searchField}
          <Section title="Começar rápido"><View style={{ gap: 10 }}>{quickActions}</View></Section>
          {errorNotice}
          <Section title="Montar sessão">
            <View style={{ gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }}
                contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingVertical: 2, alignItems: 'center' }}>
                <Button variant="secondary" size="sm" icon="sliders" label={filterCount ? `Filtros · ${filterCount}` : 'Filtros'} onPress={() => setFiltersOpen(true)} />
                <ActiveFilterPills filters={bank.filters} facets={facets.data} onChange={bank.update} />
              </ScrollView>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <Txt variant="titleSm" style={{ fontSize: 15 }}>{plural(matching)}</Txt>
                <SelectButton icon="sort" value={sort} options={SORTS} onChange={setSort} />
              </View>
              {results(true)}
            </View>
          </Section>
          {setsSection}
        </ScreenBody>
      </ScrollView>

      <BottomBar hint={available ? sessionHint(session, available) : undefined}>
        <IconButton icon="sliders" label="Quantidade e correção" variant="outline" style={{ width: 56, height: 56 }} onPress={() => setSessionOpen(true)} />
        <View style={{ flex: 1 }}>
          <Button block size="lg" cta iconRight="arrow-right" disabled={!available} loading={start.isPending}
            label={available ? `Responder ${plural(count)}` : 'Sem questões neste filtro'} onPress={() => startSession(filters, session, title)} />
        </View>
      </BottomBar>

      <BankFiltersSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={bank.filters} facets={facets.data} onChange={bank.update} onClear={bank.clear} />
      <Sheet visible={sessionOpen} title="Sua sessão" onClose={() => setSessionOpen(false)}
        footer={<Button block size="lg" label="Pronto" onPress={() => setSessionOpen(false)} />}>
        <View style={{ gap: space[4] }}>
          <Tag tone="outline" label={title} />
          <SessionOptionsFields value={session} onChange={setSession} />
        </View>
      </Sheet>
    </View>
  );
}
