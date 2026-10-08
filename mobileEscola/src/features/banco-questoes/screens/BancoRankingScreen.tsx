import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { RankingPeriod, RankingRow } from '../../../services/practice.service';
import { usePracticeRanking } from '../hooks';
import { rankingWeekRange } from '../lib/format';
import {
  AppBar, Button, Card, IconButton, Notice, Overline, PageBody, PageHeader, RankMovement, RankRow, ScreenBody, SegmentedControl, Txt,
  font, space, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoRanking'>;
const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'week', label: 'Semana' }, { id: 'last_week', label: 'Anterior' }, { id: 'month', label: '30 dias' }, { id: 'all', label: 'Geral' },
];

const initials = (name: string) => name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Ranking (protótipos "TelaRanking" e "DesktopRanking"): sua posição, quanto falta para subir e a lista. Sem medalhas coloridas. */
export function BancoRankingScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoRanking'>>();
  const [period, setPeriod] = useState<RankingPeriod>(route.params?.period ?? 'month');
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticeRanking(period);

  const me = data?.me ?? null;
  const above: RankingRow | null = me && me.position > 1 ? data?.ranking.find((r) => r.position === me.position - 1) ?? null : null;
  const meInList = !!data?.ranking.some((r) => r.is_me);

  const closed = period === 'last_week';
  const weekRange = data ? rankingWeekRange(data) : null;
  const headline = closed
    ? (!me ? 'Você não pontuou na semana anterior' : me.position === 1 ? 'Você foi o 1º lugar da semana!' : `Você terminou em ${me.position}º lugar`)
    : !me ? 'Você ainda não está no ranking' : me.position === 1 ? 'Você está em 1º lugar!' : `Você está em ${me.position}º lugar!`;
  const detail = closed
    ? 'Esse resultado já está fechado. Pratique agora para subir no ranking desta semana.'
    : !me
    ? 'Responda questões do banco neste período para entrar.'
    : above
      ? `Responda mais ${Math.max(1, above.questions - me.questions + 1)} ${Math.max(1, above.questions - me.questions + 1) === 1 ? 'questão diferente' : 'questões diferentes'} para passar ${firstName(above.name)}.`
      : 'Continue praticando para manter a posição.';
  const practice = () => navigation.navigate('BancoQuestoes');

  const periodPicker = (
    <SegmentedControl label="Período" options={PERIODS.map((x) => x.label)} value={PERIODS.findIndex((x) => x.id === period)} onChange={(i) => setPeriod(PERIODS[i].id)} />
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
        {period === 'week' ? <Txt variant="bodySm" tone="subtle">O ranking da semana reinicia toda segunda-feira às 00h.</Txt> : null}
        {data.ranking.length ? (
          <Card padding="none" style={{ padding: isDesktop ? 8 : 6 }}>
            {data.ranking.map(row)}
            {me && !meInList ? <>{<View style={{ height: 1, backgroundColor: p.line, marginVertical: 6 }} />}{row(me)}</> : null}
          </Card>
        ) : <Txt tone="subtle">{closed ? 'Ninguém respondeu questões na semana anterior.' : 'Ninguém respondeu questões neste período ainda.'}</Txt>}
        <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 19 }}>
          Conta quantas questões diferentes cada aluno respondeu no banco (prática e simulados do banco). Repetir a mesma questão não sobe posição.
          A seta compara com a posição de cerca de 24 horas atrás e a foto é atualizada de hora em hora.
        </Txt>
      </>
    );

  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Ranking" subtitle="Quem mais respondeu questões diferentes no banco" actions={<View style={{ width: 360 }}>{periodPicker}</View>} />
          <View style={{ gap: 20 }}>{body}</View>
        </PageBody>
      </ScrollView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Ranking" subtitle="Quem mais respondeu questões" leading={<IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%' }}>
          {periodPicker}
          {body}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
