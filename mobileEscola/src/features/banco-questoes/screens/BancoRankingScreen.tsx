import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { RankingCriterion, RankingPeriod, RankingRow } from '../../../services/practice.service';
import { WilsonRankingList } from '../components/WilsonRankingList';
import { usePracticeFilters, usePracticeRanking } from '../hooks';
import { rankingWeekRange } from '../lib/format';
import {
  AppBar, Button, Card, IconButton, Notice, Overline, PageBody, PageHeader, RankMovement, ScreenBody, SegmentedControl, SelectButton, Txt,
  font, space, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoRanking'>;
const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'week', label: 'Semana' }, { id: 'last_week', label: 'Anterior' }, { id: 'month', label: '30 dias' }, { id: 'all', label: 'Geral' },
];
const MODOS: { id: Extract<RankingCriterion, 'wilson' | 'dedication'>; label: string }[] = [
  { id: 'wilson', label: '🏆 Desempenho' }, { id: 'dedication', label: '🔥 Dedicação' },
];

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Desempenho (Wilson, primeira tentativa) e dedicação (questões inéditas e dias ativos). */
export function BancoRankingScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoRanking'>>();
  const [mode, setMode] = useState<Extract<RankingCriterion, 'wilson' | 'dedication'>>('wilson');
  const [period, setPeriod] = useState<RankingPeriod>(route.params?.period ?? 'month');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const filters = usePracticeFilters();
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticeRanking(period, { criterion: mode, subjectId, topicId, page });

  const me = data?.me ?? null;
  const above: RankingRow | null = me && me.position > 1 ? data?.ranking.find((r) => r.position === me.position - 1) ?? null : null;
  const meInList = !!data?.ranking.some((r) => r.is_me);

  const desempenho = mode === 'wilson';
  const closed = period === 'last_week';
  const weekRange = data ? rankingWeekRange(data) : null;
  const pontos = (score?: number) => desempenho
    ? (score ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : String(score ?? 0);
  const headline = closed
    ? (!me ? 'Você não pontuou na semana anterior' : me.position === 1 ? 'Você foi o 1º lugar da semana!' : `Você terminou em ${me.position}º lugar`)
    : !me ? 'Você ainda não está no ranking' : me.position === 1 ? 'Você está em 1º lugar!' : `Você está em ${me.position}º lugar!`;
  const detail = !me
    ? 'Responda uma questão nova neste período para entrar.'
    : desempenho
      ? `Sua pontuação é ${pontos(me.score)} e o aproveitamento na primeira tentativa é ${me.accuracy == null ? '—' : `${me.accuracy.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}.`
      : above && (above.score ?? 0) > (me.score ?? 0)
        ? `Faltam ${(above.score ?? 0) - (me.score ?? 0)} pontos para passar ${firstName(above.name)}.`
        : `Você somou ${me.questions} ${me.questions === 1 ? 'questão inédita' : 'questões inéditas'} em ${me.active_days ?? 0} ${(me.active_days ?? 0) === 1 ? 'dia' : 'dias'}.`;
  const practice = () => navigation.navigate('BancoQuestoes');
  const subjects = filters.data?.subjects ?? [];
  const topics = subjectId ? subjects.find((s) => s.id === subjectId)?.topics ?? [] : subjects.flatMap((s) => s.topics);

  const periodPicker = (
    <SegmentedControl label="Período" options={PERIODS.map((x) => x.label)} value={Math.max(0, PERIODS.findIndex((x) => x.id === period))} onChange={(i) => { setPeriod(PERIODS[i].id); setPage(1); }} />
  );
  const modePicker = (
    <SegmentedControl label="Tipo de ranking" options={MODOS.map((x) => x.label)} value={MODOS.findIndex((x) => x.id === mode)} onChange={(i) => { setMode(MODOS[i].id); setPage(1); }} />
  );

  const body = isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : isError || !data ? <Notice tone="danger" title="Não foi possível carregar o ranking" text={getApiErrorMessage(error, 'Tente de novo.')} />
    : (
      <>
        <Card padding="lg" style={{ flexDirection: 'row', flexWrap: isDesktop ? 'nowrap' : 'wrap', alignItems: 'center', gap: 14 }}>
          <Text style={{ ...font.extrabold, fontSize: 40, lineHeight: 44, color: p.ink, fontVariant: ['tabular-nums'] }}>{me ? `${me.position}º` : '—'}</Text>
          {me ? <RankMovement movement={me.movement} /> : null}
          <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
            <Txt variant="titleSm">{headline}</Txt>
            <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>{detail}</Txt>
          </View>
          <View style={isDesktop ? undefined : { width: '100%' }}>
            <Button icon="play" block={!isDesktop} label="Praticar" onPress={practice} />
          </View>
        </Card>
        <Overline>
          {weekRange ? `${closed ? 'Resultado final · ' : 'Semana de '}${weekRange} · ` : ''}
          {data.participants} {data.participants === 1 ? 'aluno' : 'alunos'}
        </Overline>
        {period === 'week' ? <Txt variant="bodySm" tone="subtle">A semana reinicia toda segunda-feira às 00h.</Txt> : null}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SelectButton label="Disciplina" value={subjectId ?? 0} onChange={(id) => { setSubjectId(id || null); setTopicId(null); setPage(1); }}
              options={[{ value: 0, label: 'Todas' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectButton label="Assunto" value={topicId ?? 0} onChange={(id) => { setTopicId(id || null); setPage(1); }}
              options={[{ value: 0, label: 'Todos' }, ...topics.map((t) => ({ value: t.id, label: t.name }))]} />
          </View>
        </View>
        {data.ranking.length ? (
          <Card padding="none" style={{ padding: isDesktop ? 8 : 6 }}>
            <WilsonRankingList rows={data.ranking} pinned={me && !meInList ? me : null} isDesktop={isDesktop} mode={mode} />
          </Card>
        ) : <Txt tone="subtle">{closed ? 'Ninguém entrou no ranking da semana anterior.' : 'Ninguém entrou no ranking neste período ainda.'}</Txt>}
        {(data.last_page ?? 1) > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Button variant="secondary" label="Anterior" disabled={page <= 1} onPress={() => setPage((atual) => atual - 1)} />
            <Txt variant="bodySm" tone="muted">{page} / {data.last_page}</Txt>
            <Button variant="secondary" label="Próxima" disabled={page >= (data.last_page ?? 1)} onPress={() => setPage((atual) => atual + 1)} />
          </View>
        ) : null}
        <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 19 }}>
          {desempenho
            ? 'Só conta a primeira tentativa de cada questão, e apenas se essa primeira vez foi neste período. Repetir não aumenta a pontuação. A seta compara com cerca de 24 horas atrás.'
            : 'A dedicação soma questões inéditas e dias com estudo. Repetir uma questão não soma ponto. A seta compara com cerca de 24 horas atrás.'}
        </Txt>
      </>
    );

  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Ranking" subtitle={desempenho ? 'Desempenho pela primeira tentativa' : 'Dedicação por questões novas e dias de estudo'} actions={<View style={{ width: 360, gap: 8 }}>{modePicker}{periodPicker}</View>} />
          <View style={{ gap: 20 }}>{body}</View>
        </PageBody>
      </ScrollView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Ranking" subtitle={desempenho ? 'Desempenho' : 'Dedicação'} leading={<IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%' }}>
          {modePicker}
          {periodPicker}
          {body}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
