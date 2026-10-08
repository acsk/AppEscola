import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { QuestionSetSummary } from '../../../services/practice.service';
import { usePracticeFilters, usePracticePerformance, usePracticeSummary, useQuestionSets } from '../hooks';
import { formatPercent } from '../lib/format';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, BottomBar, Button, Card, Chip, Chips, Dot, EmptyState, Icon, IconButton, Notice, Overline, QuickAction, ScreenBody, Section,
  Sheet, Tag, Txt, radius, space, subjectColor, type, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoQuestoes'>;

/** Pílula de filtro ativo, removível. */
function FilterPill({ label, dot, onRemove }: { label: string; dot?: string; onRemove: () => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 4, borderRadius: radius.pill, backgroundColor: p.surfaceSunken }}>
      {dot ? <Dot color={dot} /> : null}
      <Text style={[type.label, { fontSize: 13, color: p.ink }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remover filtro ${label}`} hitSlop={8} onPress={onRemove}
        style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" size={14} strokeWidth={2.5} color={p.inkMuted} />
      </Pressable>
    </View>
  );
}

/** Banco de questões (protótipo "TelaBancoQuestoes"): começar rápido, montar sessão por filtros e simulados do banco. */
export function BancoQuestoesScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const summary = usePracticeSummary();
  const sets = useQuestionSets();
  const filters = usePracticeFilters();
  const performance = usePracticePerformance();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    summary.refetch();
    sets.refetch();
    performance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao voltar para a tela
  }, []));

  const subjects = filters.data?.subjects ?? [];
  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const topic = subject?.topics.find((t) => t.id === topicId) ?? null;
  const available = topic?.total ?? subject?.total ?? filters.data?.total ?? 0;
  const activeCount = (subject ? 1 : 0) + (topic ? 1 : 0);
  const focus = performance.data?.study_focus?.[0] ?? null;
  const openSet = sets.data?.find((s) => s.open_attempt_id) ?? null;
  const colorOf = (id: number | null | undefined) => subjectColor(p, id);

  const openQuestionSet = (set: QuestionSetSummary) =>
    navigation.navigate('BancoSimulado', set.open_attempt_id ? { attemptId: set.open_attempt_id, title: set.title } : { setId: set.id, title: set.title });

  const subtitle = useMemo(() => {
    const parts = [];
    if (filters.data) parts.push(`${filters.data.total.toLocaleString('pt-BR')} questões`);
    if (summary.data) parts.push(`você já respondeu ${summary.data.answered.toLocaleString('pt-BR')}`);
    return parts.join(' · ');
  }, [filters.data, summary.data]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Banco de questões" subtitle={subtitle || undefined}
        leading={drawer ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={<IconButton icon="trophy" label="Ranking" onPress={() => navigation.navigate('BancoRanking')} />} />
      <ScrollView refreshControl={
        <RefreshControl refreshing={summary.isRefetching || sets.isRefetching} tintColor={p.brand} colors={[p.brand]}
          onRefresh={() => { summary.refetch(); sets.refetch(); filters.refetch(); performance.refetch(); }} />
      }>
        <ScreenBody gap={22} style={{ paddingTop: space[2] }}>
          {summary.data ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['Respondidas', String(summary.data.answered)], ['Acertos', String(summary.data.correct)], ['De acerto', formatPercent(summary.data.accuracy)]].map(([label, value]) => (
                <View key={label} style={{ flex: 1, padding: space[3], borderRadius: radius.md, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }}>
                  <Txt variant="bodySm" tone="muted">{label}</Txt>
                  <Txt variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{value}</Txt>
                </View>
              ))}
            </View>
          ) : null}

          <Section title="Começar rápido">
            <View style={{ gap: 10 }}>
              {openSet ? (
                <QuickAction icon="play" title="Continuar sessão" subtitle={openSet.title} onPress={() => openQuestionSet(openSet)} />
              ) : null}
              {focus ? (
                <QuickAction icon="target" title={`Reforçar ${focus.topic.name}`}
                  subtitle={focus.reason === 'not_started'
                    ? `Você ainda não praticou · ${focus.available} questões`
                    : `Você acerta ${formatPercent(focus.accuracy)} · ${focus.available} questões`}
                  onPress={() => navigation.navigate('BancoPraticar', { subjectId: focus.subject.id ?? undefined, topicId: focus.topic.id })} />
              ) : null}
              <QuickAction icon="chart" title="O que estudar" subtitle="Seu desempenho por disciplina e assunto" onPress={() => navigation.navigate('BancoDesempenho')} />
            </View>
          </Section>

          <Section title="Montar sessão">
            <View style={{ gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }}
                contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], alignItems: 'center' }}>
                <Button variant="secondary" size="sm" icon="sliders" label={activeCount ? `Filtros · ${activeCount}` : 'Filtros'} onPress={() => setFiltersOpen(true)} />
                {subject ? <FilterPill label={subject.name} dot={colorOf(subject.id)} onRemove={() => { setSubjectId(null); setTopicId(null); }} /> : null}
                {topic ? <FilterPill label={topic.name} onRemove={() => setTopicId(null)} /> : null}
              </ScrollView>
              {filters.isLoading ? <ActivityIndicator color={p.brand} /> : filters.isError ? (
                <Notice tone="danger" title="Não foi possível carregar os filtros" text={getApiErrorMessage(filters.error, 'Tente de novo.')} />
              ) : !filters.data?.total ? (
                <EmptyState icon="library" title="Nenhuma questão para praticar ainda" text="Quando a escola liberar questões no banco, você monta sua sessão aqui." />
              ) : (
                <Card style={{ gap: space[1] }}>
                  <Txt variant="titleSm">{available.toLocaleString('pt-BR')} {available === 1 ? 'questão' : 'questões'}</Txt>
                  <Txt variant="bodySm" tone="subtle">
                    {subject ? `${subject.name}${topic ? ` · ${topic.name}` : ''}` : 'Todas as disciplinas'} · uma por vez, com correção a cada questão
                  </Txt>
                </Card>
              )}
            </View>
          </Section>

          <Section title="Simulados do banco">
            <Txt variant="bodySm" tone="subtle" style={{ marginTop: -6 }}>Montados pela escola. Não valem nota: a correção aparece quando você finaliza.</Txt>
            {sets.isLoading ? <ActivityIndicator color={p.brand} /> : sets.isError ? (
              <Notice tone="danger" title="Não foi possível carregar os simulados" text={getApiErrorMessage(sets.error, 'Tente de novo.')} />
            ) : !sets.data?.length ? (
              <EmptyState icon="clipboard" title="Nenhum simulado do banco ainda" text="Quando a escola montar simulados com questões do banco, eles aparecem aqui." />
            ) : (
              sets.data.map((set) => (
                <Card key={set.id} onPress={() => openQuestionSet(set)} accessibilityLabel={set.title} style={{ gap: space[2] }}>
                  <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
                    <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {set.exam_type?.logo_url ? <Image source={{ uri: set.exam_type.logo_url }} style={{ width: 34, height: 34 }} resizeMode="contain" />
                        : <Icon name="clipboard" size={20} color={p.inkMuted} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="titleSm" numberOfLines={2}>{set.title}</Txt>
                      <Txt variant="bodySm" tone="subtle">
                        {[`${set.questions_count} ${set.questions_count === 1 ? 'questão' : 'questões'}`, set.exam_type?.label, set.origin === 'pdf_import' ? 'Prova importada' : null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: p.line }}>
                    {set.last_result ? <Tag tone="success" icon="trophy" label={`Melhor: ${set.last_result.correct}/${set.last_result.total}`} /> : <Tag label="Ainda não respondido" />}
                    <Button size="sm" decorative iconRight="arrow-right" label={set.open_attempt_id ? 'Continuar' : set.attempts_count ? 'Refazer' : 'Começar'} />
                  </View>
                </Card>
              ))
            )}
          </Section>
        </ScreenBody>
      </ScrollView>

      <BottomBar hint="Uma questão por vez · correção a cada questão">
        <IconButton icon="sliders" label="Filtros" variant="outline" style={{ width: 56, height: 56 }} onPress={() => setFiltersOpen(true)} />
        <Button block size="lg" cta iconRight="arrow-right" disabled={!available}
          label={available ? `Praticar ${subject ? (topic?.name ?? subject.name) : 'questões'}` : 'Sem questões neste filtro'}
          onPress={() => navigation.navigate('BancoPraticar', { subjectId: subjectId ?? undefined, topicId: topicId ?? undefined })} />
      </BottomBar>

      {/* Filtros (protótipo "TelaFiltrarQuestoes"): opção com 0 questões fica desabilitada. */}
      <Sheet visible={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <Button variant="secondary" label="Limpar" onPress={() => { setSubjectId(null); setTopicId(null); }} />
            <Button block label={`Ver ${available.toLocaleString('pt-BR')} ${available === 1 ? 'questão' : 'questões'}`} onPress={() => setFiltersOpen(false)} />
          </>
        }>
        <View style={{ gap: 20 }}>
          <View style={{ gap: 10 }}>
            <Overline>Disciplina</Overline>
            <Chips>
              {subjects.map((s) => (
                <Chip key={s.id} label={s.name} count={s.total} dot={colorOf(s.id)} selected={s.id === subjectId} disabled={!s.total}
                  onPress={() => { setSubjectId(s.id === subjectId ? null : s.id); setTopicId(null); }} />
              ))}
            </Chips>
          </View>
          {subject ? (
            <View style={{ gap: 10 }}>
              <Overline>Assunto de {subject.name}</Overline>
              {subject.topics.length ? (
                <Chips>
                  {subject.topics.map((t) => (
                    <Chip key={t.id} label={t.name} count={t.total} selected={t.id === topicId} disabled={!t.total}
                      onPress={() => setTopicId(t.id === topicId ? null : t.id)} />
                  ))}
                </Chips>
              ) : <Txt variant="bodySm" tone="subtle">Esta disciplina ainda não tem assuntos cadastrados.</Txt>}
            </View>
          ) : subjects.length ? <Txt variant="bodySm" tone="subtle">Escolha uma disciplina para filtrar por assunto.</Txt>
            : <Txt variant="bodySm" tone="subtle">Ainda não há questões liberadas para praticar.</Txt>}
        </View>
      </Sheet>
    </View>
  );
}
