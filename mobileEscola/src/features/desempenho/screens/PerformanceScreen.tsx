import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../../lib/apiError';
import { fetchStudentPerformance, type PerformanceMonthlyEvolution } from '../../../services/performance.service';
import { usePracticePerformance, usePracticeRanking, usePracticeSummary, useStartPracticeSession } from '../../banco-questoes/hooks';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, Button, Card, EmptyState, Icon, IconButton, MonthBars, Notice, Overline, PageBody, PageHeader, QuickAction, RankMovement, ScreenBody,
  SegmentedControl, StatTile, SubjectScore, Tag, Txt, font, space, subjectColor, useLayoutMode, usePalette, type MonthBar,
} from '../../../ui';

const PERIODS = [6, 12] as const;
const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Set/2026" a partir de "2026-09". */
function monthName(m: PerformanceMonthlyEvolution) {
  const [y, mm] = m.month.split('-').map(Number);
  if (!y || !mm) return m.label;
  return `${cap(new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''))}/${y}`;
}

/**
 * Desempenho (protótipos "TelaDesempenho" e "DesktopDesempenho"): números primeiro (média contra o mínimo),
 * depois o porquê (evolução e disciplinas) e o que fazer ("Treinar estes assuntos"). O pacote sai desta tela.
 */
export function PerformanceScreen() {
  const p = usePalette();
  const navigation = useNavigation<any>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();
  const [months, setMonths] = useState<(typeof PERIODS)[number]>(6);
  const query = useQuery({ queryKey: ['aluno', 'performance', months], queryFn: () => fetchStudentPerformance(months) });
  const practice = usePracticeSummary();
  const practicePerf = usePracticePerformance();
  const ranking = usePracticeRanking('month', { criterion: 'wilson' });
  const start = useStartPracticeSession();
  const [startError, setStartError] = useState<string | null>(null);

  const { refetch } = query;
  const refetchPractice = practice.refetch;
  useFocusEffect(useCallback(() => { refetch(); refetchPractice(); }, [refetch, refetchPractice]));

  const data = query.data;
  const overview = data?.overview;
  const subjects = [...(data?.by_subject ?? [])].filter((s) => s.avg_percentage != null).sort((a, b) => (b.avg_percentage ?? 0) - (a.avg_percentage ?? 0));
  const passing = subjects.filter((s) => s.passing_score_avg != null);
  const minimum = passing.length ? Math.round(passing.reduce((acc, s) => acc + (s.passing_score_avg ?? 0), 0) / passing.length) : 50;
  const avg = overview?.avg_percentage ?? null;
  const evolution = data?.monthly_evolution ?? [];
  const bars: MonthBar[] = evolution.map((m, i) => ({ label: cap(m.label.replace('.', '')).slice(0, 3), value: m.avg_percentage, count: m.attempts_count, current: i === evolution.length - 1 }));
  const focus = (practicePerf.data?.study_focus ?? []).slice(0, 3);
  const me = ranking.data?.me ?? null;

  const train = () => {
    setStartError(null);
    const title = focus.length === 1 ? `Reforçar ${focus[0].topic.name}` : 'Treinar meus pontos fracos';
    start.mutate({
      filters: { topic_ids: focus.map((f) => f.topic.id), situation: 'all' },
      options: { quantity: 10, correction_mode: 'each', timed: false, title },
    }, {
      onSuccess: (payload) => navigation.navigate('Questoes', { screen: 'BancoSimulado', params: { attemptId: payload.attempt.id, title }, initial: false }),
      onError: (cause) => setStartError(getApiErrorMessage(cause, 'Não foi possível começar. Tente de novo.')),
    });
  };
  const openBank = () => navigation.navigate('Questoes', { screen: 'BancoQuestoes' });
  const openRanking = () => navigation.navigate('Questoes', { screen: 'BancoRanking', initial: false });

  const period = <SegmentedControl label="Período" options={PERIODS.map((m) => `${m} meses`)} value={PERIODS.indexOf(months)} onChange={(i) => setMonths(PERIODS[i])} />;
  const bankValue = practice.data?.answered ? pct(practice.data.accuracy, 0) : '—';
  const bankHint = practice.data?.answered ? `${practice.data.answered} ${practice.data.answered === 1 ? 'resposta' : 'respostas'}` : 'Nenhuma resposta ainda';

  const evolutionCard = (
    <Card padding="lg" style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <Txt variant="titleSm">Evolução mensal</Txt>
        {isDesktop ? <Txt variant="bodySm" tone="subtle">Média dos simulados feitos em cada mês</Txt> : null}
      </View>
      {bars.some((b) => b.value != null) ? <MonthBars data={bars} minimum={minimum} height={isDesktop ? 180 : 140} />
        : <Txt tone="subtle">Faça simulados para ver sua evolução aqui.</Txt>}
    </Card>
  );

  const subjectsCard = (
    <Card padding="lg" style={{ paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <Txt variant="titleSm">Por disciplina</Txt>
        {isDesktop ? <Txt variant="bodySm" tone="subtle">Ordenado pela média</Txt> : null}
      </View>
      {subjects.length ? subjects.map((s, i) => (
        <SubjectScore key={String(s.subject_id ?? s.subject.name)} first={i === 0} subject={s.subject.name} dot={s.subject_id ? subjectColor(p, s.subject_id, s.subject.color) : p.inkSubtle}
          count={s.attempts_count} average={s.avg_percentage ?? 0} last={s.latest_percentage} minimum={s.passing_score_avg ?? minimum} />
      )) : <Txt tone="subtle" style={{ paddingVertical: space[3] }}>Nenhum simulado concluído no período.</Txt>}
    </Card>
  );

  const studyCard = (
    <Card padding="lg" style={{ gap: 14 }}>
      <Txt variant="titleSm">O que estudar agora</Txt>
      {isDesktop ? <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>Assuntos em que você mais errou no banco de questões.</Txt> : null}
      {focus.length ? (
        <View>
          {focus.map((f, i) => (
            <View key={`${f.subject.id}-${f.topic.id}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline', paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.line }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subjectColor(p, f.subject.id) }} />
              <View style={{ flex: 1 }}>
                <Txt variant="titleSm" style={{ fontSize: 15 }}>{f.topic.name}</Txt>
                <Txt variant="bodySm" tone="subtle">{f.reason === 'low_accuracy' ? `${pct(f.accuracy, 0)} de acerto no banco` : 'Ainda não praticado'}</Txt>
              </View>
            </View>
          ))}
        </View>
      ) : <Txt tone="subtle">Responda questões no banco para a gente apontar o que estudar.</Txt>}
      {startError ? <Notice tone="danger" title="Não foi possível começar" text={startError} /> : null}
      {focus.length ? <Button block size={isDesktop ? 'lg' : 'md'} cta={isDesktop} iconRight="arrow-right" label="Treinar estes assuntos" loading={start.isPending} onPress={train} />
        : <Button block variant="secondary" iconRight="arrow-right" label="Ir para o banco de questões" onPress={openBank} />}
    </Card>
  );

  const refresh = <RefreshControl refreshing={query.isRefetching} onRefresh={() => { refetch(); refetchPractice(); }} tintColor={p.brand} colors={[p.brand]} />;
  const state = query.isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : query.isError ? (
      <View style={{ gap: space[3] }}>
        <Notice tone="danger" title="Não foi possível carregar seu desempenho" text={getApiErrorMessage(query.error, 'Tente de novo.')} />
        <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
      </View>
    ) : null;

  if (isDesktop) {
    // Mês a mês: meses com simulado em linhas; os vazios agrupados numa só.
    const filled = [...evolution].reverse().filter((m) => m.attempts_count > 0);
    const empty = [...evolution].reverse().filter((m) => !m.attempts_count).map((m) => cap(m.label.replace('.', '')).slice(0, 3));
    const th = { ...font.bold, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' as const, color: p.inkSubtle };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Desempenho" subtitle="Sua média nos simulados, por mês e por disciplina" actions={<View style={{ width: 260 }}>{period}</View>} />
          {state ?? (
            <>
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <StatTile style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }} label="Média nos simulados" value={pct(avg)}
                  hint={`Mínimo exigido ${minimum}%`} tone={avg == null ? undefined : avg >= minimum ? 'success' : 'danger'} />
                <StatTile style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }} label="Simulados feitos" value={String(overview?.total_attempts ?? 0)} hint={`nos últimos ${months} meses`} />
                <StatTile style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }} label="Melhor disciplina" value={overview?.best_subject?.name ?? '—'}
                  hint={overview?.best_subject ? `${pct(overview.best_subject.avg_percentage)} de média` : undefined} />
                <StatTile style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }} label="Banco de questões" value={bankValue} hint={`${bankHint} · fora da média`} />
              </View>
              <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
                  {evolutionCard}
                  {subjectsCard}
                  <Card padding="none">
                    <Txt variant="titleSm" style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>Mês a mês</Txt>
                    <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.line }}>
                      <Text style={[th, { width: 110 }]}>Mês</Text><Text style={[th, { flex: 1 }]}>Disciplinas</Text>
                      <Text style={[th, { width: 90, textAlign: 'right' }]}>Simulados</Text><Text style={[th, { width: 90, textAlign: 'right' }]}>Média</Text>
                    </View>
                    {filled.map((m) => (
                      <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.line }}>
                        <Txt variant="label" style={{ width: 110 }}>{monthName(m)}</Txt>
                        <Txt tone="muted" style={{ flex: 1, fontSize: 14 }}>{m.by_subject.map((s) => `${s.subject_name} ${Math.round(s.avg_percentage)}%`).join(' · ')}</Txt>
                        <Txt tone="muted" style={{ width: 90, textAlign: 'right', fontSize: 14 }}>{m.attempts_count}</Txt>
                        <Txt variant="label" style={{ width: 90, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{pct(m.avg_percentage)}</Txt>
                      </View>
                    ))}
                    {empty.length ? (
                      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14 }}>
                        <Txt variant="bodySm" tone="subtle" style={{ width: 110 }}>{empty.join(', ')}</Txt>
                        <Txt variant="bodySm" tone="subtle">Nenhum simulado {empty.length === 1 ? 'neste mês' : 'nesses meses'}</Txt>
                      </View>
                    ) : null}
                  </Card>
                </View>
                <View style={{ width: 360, gap: space[4] }}>
                  {studyCard}
                  <Card style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Txt variant="titleSm">Ranking do banco</Txt>
                      <Icon name="trophy" size={20} color={p.ink} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                      <Text style={{ ...font.extrabold, fontSize: 32, lineHeight: 40, color: p.ink }}>{me ? `${me.position}º` : '—'}</Text>
                      {me ? <RankMovement movement={me.movement} status={me.movement_status} referenceAt={me.movement_reference_at} /> : null}
                      <Txt tone="muted" style={{ fontSize: 14 }}>{me ? `de ${ranking.data?.participants ?? 0} alunos nos últimos 30 dias` : 'Responda questões para entrar'}</Txt>
                    </View>
                    <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}><Button variant="ghost" size="sm" iconRight="arrow-right" label="Ver ranking" onPress={openRanking} /></View>
                  </Card>
                </View>
              </View>
            </>
          )}
        </PageBody>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Desempenho" subtitle={`Seus simulados nos últimos ${months} meses`}
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={20} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {period}
          {state ?? (overview && !overview.total_attempts && !practice.data?.answered ? (
            <EmptyState icon="chart" title="Ainda não há resultados" text="Quando você concluir simulados, sua média e a evolução aparecem aqui." />
          ) : (
            <>
              <Card padding="lg" style={{ gap: 6 }}>
                <Overline>Média nos simulados</Overline>
                <Text style={{ ...font.extrabold, fontSize: 48, lineHeight: 52, letterSpacing: -0.96, color: p.ink, fontVariant: ['tabular-nums'] }}>
                  {avg == null ? '—' : avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  {avg != null ? <Text style={{ fontSize: 24, ...font.bold }}>%</Text> : null}
                </Text>
                {avg != null ? (
                  <View style={{ marginBottom: 10 }}>
                    <Tag tone={avg >= minimum ? 'success' : 'danger'} icon={avg >= minimum ? 'check' : 'alert'} label={`${avg >= minimum ? 'Acima' : 'Abaixo'} do mínimo de ${minimum}%`} />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatTile label="Simulados feitos" value={String(overview?.total_attempts ?? 0)} />
                  <StatTile label="Banco de questões" value={bankValue} hint={bankHint} />
                </View>
              </Card>
              {evolutionCard}
              {subjectsCard}
              {studyCard}
              <QuickAction icon="trophy" title="Ranking do banco"
                subtitle={me ? `Você está em ${me.position}º de ${ranking.data?.participants ?? 0}${me.movement ? ` (${me.movement > 0 ? 'subiu' : 'caiu'} ${Math.abs(me.movement)})` : ''}` : 'Veja quem mais acerta de primeira'} onPress={openRanking} />
            </>
          ))}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
