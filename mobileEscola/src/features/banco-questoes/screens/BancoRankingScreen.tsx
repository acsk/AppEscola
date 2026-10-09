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
  AppBar, Button, Card, IconButton, Notice, Overline, PageBody, PageHeader, RankMovement, RankRow, ScreenBody, SegmentedControl, SelectButton, Txt,
  font, space, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoRanking'>;
const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'week', label: 'Semana' }, { id: 'last_week', label: 'Anterior' }, { id: 'month', label: '30 dias' }, { id: 'all', label: 'Geral' },
];
const WILSON_PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: '7d', label: '7 dias' }, { id: 'month', label: '30 dias' }, { id: 'all', label: 'Geral' },
];
const MODOS: { id: RankingCriterion; label: string }[] = [
  { id: 'participation', label: 'Participação' }, { id: 'wilson', label: 'Desempenho' },
];

const initials = (name: string) => name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Ranking de participação (quem mais respondeu) e de desempenho (Wilson Score). */
export function BancoRankingScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoRanking'>>();
  const [mode, setMode] = useState<RankingCriterion>('participation');
  const [period, setPeriod] = useState<RankingPeriod>(route.params?.period ?? 'month');
  const [wilsonPeriod, setWilsonPeriod] = useState<RankingPeriod>('month');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const filters = usePracticeFilters();
  const activePeriod = mode === 'wilson' ? wilsonPeriod : period;
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticeRanking(
    activePeriod,
    mode === 'wilson' ? { criterion: 'wilson', subjectId, topicId, page } : undefined,
  );

  const me = data?.me ?? null;
  const above: RankingRow | null = me && me.position > 1 ? data?.ranking.find((r) => r.position === me.position - 1) ?? null : null;
  const meInList = !!data?.ranking.some((r) => r.is_me);

  const desempenho = mode === 'wilson';
  const closed = !desempenho && period === 'last_week';
  const weekRange = !desempenho && data ? rankingWeekRange(data) : null;
  const pontos = (score?: number) => (score ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const headline = closed
    ? (!me ? 'Você não pontuou na semana anterior' : me.position === 1 ? 'Você foi o 1º lugar da semana!' : `Você terminou em ${me.position}º lugar`)
    : !me ? 'Você ainda não está no ranking' : me.position === 1 ? 'Você está em 1º lugar!' : `Você está em ${me.position}º lugar!`;
  const detail = desempenho
    ? (!me ? 'Responda questões do banco neste período para entrar.' : `Sua pontuação é ${pontos(me.score)} e o aproveitamento é ${me.accuracy == null ? '—' : `${me.accuracy.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}.`)
    : closed
    ? 'Esse resultado já está fechado. Pratique agora para subir no ranking desta semana.'
    : !me
    ? 'Responda questões do banco neste período para entrar.'
    : above
      ? `Responda mais ${Math.max(1, above.questions - me.questions + 1)} ${Math.max(1, above.questions - me.questions + 1) === 1 ? 'questão diferente' : 'questões diferentes'} para passar ${firstName(above.name)}.`
      : 'Continue praticando para manter a posição.';
  const practice = () => navigation.navigate('BancoQuestoes');
  const periodos = desempenho ? WILSON_PERIODS : PERIODS;
  const periodoAtivo = desempenho ? wilsonPeriod : period;
  const subjects = filters.data?.subjects ?? [];
  const topics = subjectId ? subjects.find((s) => s.id === subjectId)?.topics ?? [] : subjects.flatMap((s) => s.topics);

  const periodPicker = (
    <SegmentedControl label="Período" options={periodos.map((x) => x.label)} value={Math.max(0, periodos.findIndex((x) => x.id === periodoAtivo))} onChange={(i) => {
      const id = periodos[i].id;
      if (desempenho) { setWilsonPeriod(id); setPage(1); } else setPeriod(id);
    }} />
  );
  const modePicker = (
    <SegmentedControl label="Tipo de ranking" options={MODOS.map((x) => x.label)} value={MODOS.findIndex((x) => x.id === mode)} onChange={(i) => { setMode(MODOS[i].id); setPage(1); }} />
  );

  const row = (r: RankingRow) => (
    <RankRow key={`${r.position}-${r.name}-${r.is_me}`} pos={r.position} initials={initials(r.name)} name={r.name.replace(/\s*\(você\)\s*/i, '')}
      photoUrl={r.photo_url} rate={r.accuracy} count={r.questions} me={r.is_me} movement={r.movement} />
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
        {!desempenho && period === 'week' ? <Txt variant="bodySm" tone="subtle">O ranking da semana reinicia toda segunda-feira às 00h.</Txt> : null}
        {desempenho ? (
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
        ) : null}
        {data.ranking.length ? (
          desempenho ? (
            <Card padding="none" style={{ padding: isDesktop ? 8 : 6 }}>
              <WilsonRankingList rows={data.ranking} pinned={me && !meInList ? me : null} isDesktop={isDesktop} />
            </Card>
          ) : (
            <Card padding="none" style={{ padding: isDesktop ? 8 : 6 }}>
              {data.ranking.map(row)}
              {me && !meInList ? <>{<View style={{ height: 1, backgroundColor: p.line, marginVertical: 6 }} />}{row(me)}</> : null}
            </Card>
          )
        ) : <Txt tone="subtle">{closed ? 'Ninguém respondeu questões na semana anterior.' : 'Ninguém respondeu questões neste período ainda.'}</Txt>}
        {desempenho && (data.last_page ?? 1) > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Button variant="secondary" label="Anterior" disabled={page <= 1} onPress={() => setPage((atual) => atual - 1)} />
            <Txt variant="bodySm" tone="muted">{page} / {data.last_page}</Txt>
            <Button variant="secondary" label="Próxima" disabled={page >= (data.last_page ?? 1)} onPress={() => setPage((atual) => atual + 1)} />
          </View>
        ) : null}
        <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 19 }}>
          {desempenho
            ? 'Cada questão entra uma vez, pela primeira resposta válida no período. A pontuação não é só o percentual de acertos: uma amostra pequena não passa na frente de quem praticou mais.'
            : 'Conta quantas questões diferentes cada aluno respondeu no banco (prática e simulados do banco). Repetir a mesma questão não sobe posição. A seta compara com a posição de cerca de 24 horas atrás e a foto é atualizada de hora em hora.'}
        </Txt>
      </>
    );

  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Ranking" subtitle={desempenho ? 'Desempenho pela pontuação de Wilson' : 'Quem mais respondeu questões diferentes no banco'} actions={<View style={{ width: 360, gap: 8 }}>{modePicker}{periodPicker}</View>} />
          <View style={{ gap: 20 }}>{body}</View>
        </PageBody>
      </ScrollView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Ranking" subtitle={desempenho ? 'Desempenho no banco' : 'Quem mais respondeu questões'} leading={<IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />} />
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
