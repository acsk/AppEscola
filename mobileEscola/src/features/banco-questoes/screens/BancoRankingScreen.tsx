import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { RankingCriterion, RankingPeriod, RankingRow } from '../../../services/practice.service';
import { usePracticeFilters, usePracticeRanking } from '../hooks';
import { rankingWeekRange } from '../lib/format';
import {
  AppBar, BottomBar, Button, Card, Chip, IconButton, Notice, PageBody, PageHeader, RankHead, RankLine, RankMovement, RankRow, ScreenBody,
  SegmentedControl, SelectButton, Txt, font, space, useLayoutMode, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<QuestoesStackParamList, 'BancoRanking'>;
type Mode = Extract<RankingCriterion, 'wilson' | 'dedication'>;

const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'week', label: 'Esta semana' }, { id: 'last_week', label: 'Semana passada' }, { id: 'month', label: '30 dias' }, { id: 'all', label: 'Geral' },
];
const MODES: { id: Mode; label: string }[] = [{ id: 'wilson', label: 'Desempenho' }, { id: 'dedication', label: 'Dedicação' }];
/** Linhas iniciais: celular mostra top 3 + você + o próximo; desktop, os 10 primeiros. */
const DESKTOP_ROWS = 10;
const FULL_PAGE = 100;

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const initials = (name: string) => name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const cleanName = (name: string) => name.replace(/\s*\(você\)\s*/i, '');
const fmt1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Ranking (protótipos "TelaRanking" e "DesktopRanking"): tipo e período no topo, cartão com a sua posição e quanto falta,
 * lista curta no celular (top 3, você e o próximo) e tabela compacta no desktop.
 * Desempenho = pontos de 0 a 100 pela primeira tentativa; Dedicação = questões novas e dias com estudo.
 */
export function BancoRankingScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const route = useRoute<RouteProp<QuestoesStackParamList, 'BancoRanking'>>();
  const [mode, setMode] = useState<Mode>('wilson');
  const [period, setPeriod] = useState<RankingPeriod>(route.params?.period ?? 'month');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const filters = usePracticeFilters();
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticeRanking(period, {
    criterion: mode, subjectId, topicId, courseId, page: 1, perPage: expanded ? FULL_PAGE : 20,
  });

  const performance = mode === 'wilson';
  const closed = period === 'last_week';
  const rows = data?.ranking ?? [];
  const me = data?.me ?? null;
  const above: RankingRow | null = me && me.position > 1 ? rows.find((r) => r.position === me.position - 1) ?? null : null;
  const points = (v?: number | null) => (performance ? fmt1(v ?? 0) : String(Math.round(v ?? 0)));
  const weekRange = data ? rankingWeekRange(data) : null;
  const courses = data?.courses ?? [];
  const courseLabel = data?.course_name ? ` · ${data.course_name}` : '';
  const subjects = filters.data?.subjects ?? [];
  const topics = subjectId ? subjects.find((s) => s.id === subjectId)?.topics ?? [] : subjects.flatMap((s) => s.topics);
  const reset = () => setExpanded(false);
  const practice = () => navigation.navigate('BancoQuestoes');

  const headline = !me
    ? (closed ? 'Você não pontuou na semana passada' : 'Você ainda não está no ranking')
    : closed ? `Você terminou em ${me.position}º` : isDesktop ? `Você está em ${me.position}º lugar` : `Você está em ${me.position}º`;
  const gap = me && above ? Math.max(0, (above.score ?? 0) - (me.score ?? 0)) : null;
  const detail = !me
    ? (closed ? 'A semana já fechou. Responda questões novas nesta semana para entrar.' : 'Responda uma questão nova neste período para entrar.')
    : me.position === 1 ? 'Você está na frente. Continue praticando para manter o 1º lugar.'
    : above && gap != null
      ? gap === 0
        ? `Você está empatado em pontos com ${firstName(cleanName(above.name))}.`
        : `Faltam ${points(gap)} pontos para passar ${firstName(cleanName(above.name))}.${isDesktop && performance ? ' Acertar de primeira algumas questões novas já resolve.' : ''}`
      : performance ? `Você tem ${points(me.score)} pontos.` : `Você somou ${me.questions} questões novas em ${me.active_days ?? 0} dias.`;

  const modePicker = (
    <SegmentedControl label="Tipo de ranking" options={MODES.map((m) => m.label)} value={MODES.findIndex((m) => m.id === mode)}
      onChange={(i) => { setMode(MODES[i].id); reset(); }} />
  );

  const meCard = (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: isDesktop ? 20 : 14, paddingVertical: isDesktop ? 20 : 16, paddingHorizontal: isDesktop ? 24 : 16 }}>
      <Text style={{ ...font.extrabold, fontSize: isDesktop ? 48 : 40, lineHeight: isDesktop ? 48 : 40, letterSpacing: -1.2, color: p.ink, fontVariant: ['tabular-nums'] }}>
        {me ? `${me.position}º` : '—'}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Txt variant="titleSm" style={{ fontSize: isDesktop ? 17 : 16 }}>{headline}</Txt>
          {me ? <RankMovement movement={me.movement ?? null} status={me.movement_status} referenceAt={me.movement_reference_at ?? data?.movement_reference_at} /> : null}
        </View>
        <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>{detail}</Txt>
      </View>
      {isDesktop ? <Button icon="play" label="Praticar" onPress={practice} /> : null}
    </Card>
  );

  const footnote = (
    <Txt variant="bodySm" tone="subtle" style={{ lineHeight: 20, maxWidth: 760 }}>
      {performance
        ? isDesktop
          ? 'Os pontos vão de 0 a 100 e valorizam quem acerta muito e responde bastante: acertar 24 de 29 vale mais do que 2 de 2. Só conta a primeira tentativa de cada questão neste período; repetir não soma. A seta compara com o fechamento de ontem. NEW entrou depois disso.'
          : 'Pontos de 0 a 100: acertar muito e responder bastante vale mais. Só conta a primeira tentativa de cada questão.'
          : 'A dedicação soma questões novas e dias com estudo. Repetir uma questão não soma ponto. A seta compara com o fechamento de ontem. NEW entrou depois disso.'}
      {period === 'week' ? ' A semana reinicia toda segunda-feira às 00h.' : ''}
    </Txt>
  );

  const state = isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : isError || !data ? <Notice tone="danger" title="Não foi possível carregar o ranking" text={getApiErrorMessage(error, 'Tente de novo.')} />
    : null;
  const empty = <Txt tone="subtle">{closed ? 'Ninguém entrou no ranking da semana passada.' : 'Ninguém entrou no ranking neste período ainda.'}</Txt>;
  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (isDesktop) {
    const shown = expanded ? rows : rows.slice(0, DESKTOP_ROWS);
    const meMissing = me && !shown.some((r) => r.is_me);
    const rest = (data?.participants ?? 0) - shown.length - (meMissing ? 1 : 0);
    const max = performance ? 100 : Math.max(1, ...rows.map((r) => r.score ?? 0));
    const line = (r: RankingRow) => (
      <RankLine key={`${r.position}-${r.name}-${r.is_me}`} pos={r.position} movement={r.movement ?? null} movementStatus={r.movement_status}
        movementReferenceAt={r.movement_reference_at ?? data?.movement_reference_at} initials={initials(r.name)} name={cleanName(r.name)}
        photoUrl={r.photo_url} me={r.is_me}
        note={r.retakes ? `+${r.retakes} ${r.retakes === 1 ? 'repetida, não conta' : 'repetidas, não contam'}` : null}
        values={performance
          ? [String(r.questions), String(r.first_attempt_correct ?? r.correct), r.accuracy == null ? '—' : `${fmt1(r.accuracy).replace(',0', '')}%`]
          : [String(r.questions), String(r.active_days ?? 0), String(r.streak ?? 0)]}
        score={r.score ?? 0} scoreLabel={points(r.score)} max={max} />
    );
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody>
          <View style={{ maxWidth: 980, width: '100%' }}>
            <PageHeader title="Ranking"
              subtitle={(performance ? 'Quem mais acerta de primeira no banco de questões' : 'Quem mais estuda: questões novas e dias com estudo') + courseLabel}
              actions={<View style={{ width: 300 }}>{modePicker}</View>} />
          </View>
          <View style={{ maxWidth: 980, width: '100%', gap: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              <View style={{ width: 520 }}>
                <SegmentedControl label="Período" options={PERIODS.map((x) => x.label)} value={Math.max(0, PERIODS.findIndex((x) => x.id === period))}
                  onChange={(i) => { setPeriod(PERIODS[i].id); reset(); }} />
              </View>
              <View style={{ flex: 1 }} />
              {courses.length > 1 ? (
                <SelectButton label="Curso:" value={courseId ?? data?.course_id ?? 0} onChange={(id) => { setCourseId(id || null); reset(); }}
                  options={courses.map((course) => ({ value: course.id, label: course.name }))} />
              ) : null}
              <SelectButton label="Disciplina:" value={subjectId ?? 0} onChange={(id) => { setSubjectId(id || null); setTopicId(null); reset(); }}
                options={[{ value: 0, label: 'Todas' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]} />
              <SelectButton label="Assunto:" value={topicId ?? 0} onChange={(id) => { setTopicId(id || null); reset(); }}
                options={[{ value: 0, label: 'Todos' }, ...topics.map((t) => ({ value: t.id, label: t.name }))]} />
            </View>
            {state ?? (
              <>
                {meCard}
                {weekRange ? <Txt variant="overline" tone="subtle">{closed ? 'Resultado final' : 'Semana'} · {weekRange}</Txt> : null}
                {rows.length ? (
                  <Card padding="none" style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
                    <RankHead labels={performance ? ['Questões', 'Acertos', 'Aproveit.', 'Pontos'] : ['Questões', 'Dias', 'Sequência', 'Pontos']} />
                    {shown.map(line)}
                    {meMissing && me ? <>{<View style={{ height: 1, backgroundColor: p.line, marginVertical: 4 }} />}{line(me)}</> : null}
                    {rest > 0 || expanded ? (
                      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4, borderTopWidth: 1, borderTopColor: p.line, marginHorizontal: -8 }}>
                        <Button variant="ghost" size="sm" iconRight={expanded ? 'chevron-up' : 'chevron-down'}
                          label={expanded ? 'Mostrar menos' : `Ver os outros ${rest} ${rest === 1 ? 'aluno' : 'alunos'}`} onPress={() => setExpanded((v) => !v)} />
                      </View>
                    ) : null}
                  </Card>
                ) : empty}
                {footnote}
              </>
            )}
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  // ── Celular ───────────────────────────────────────────────────────────────
  const row = (r: RankingRow) => (
    <RankRow key={`${r.position}-${r.name}-${r.is_me}`} pos={r.position} movement={r.movement ?? null} movementStatus={r.movement_status}
      movementReferenceAt={r.movement_reference_at ?? data?.movement_reference_at} initials={initials(r.name)} name={cleanName(r.name)}
      photoUrl={r.photo_url} rate={r.accuracy} count={r.questions} me={r.is_me} score={r.score ?? 0} scoreDecimals={performance ? 1 : 0} />
  );
  // Lista curta: top 3, você e o próximo (ou o top 5, se você já estiver no pódio).
  const short = (() => {
    if (expanded) return rows;
    if (!me || me.position <= 3) return rows.slice(0, 5);
    const around = [me, rows.find((r) => r.position === me.position + 1)].filter((r): r is RankingRow => !!r);
    return [...rows.slice(0, 3), ...around];
  })();
  const hidden = Math.max(0, (data?.participants ?? 0) - short.length);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Ranking" subtitle={(performance ? 'Quem mais acerta de primeira' : 'Quem mais estuda') + courseLabel}
        leading={<IconButton icon="arrow-left" label="Voltar" onPress={() => navigation.goBack()} />} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={space[4]} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {modePicker}
          {courses.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}>
              {courses.map((course) => (
                <Chip key={course.id} label={course.name} selected={(courseId ?? data?.course_id) === course.id} onPress={() => { setCourseId(course.id); reset(); }} />
              ))}
            </ScrollView>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}>
            {PERIODS.map((x) => <Chip key={x.id} label={x.label} selected={period === x.id} onPress={() => { setPeriod(x.id); reset(); }} />)}
          </ScrollView>
          {state ?? (
            <>
              {meCard}
              {rows.length ? (
                <Card padding="none" style={{ padding: 6 }}>
                  {short.map(row)}
                  {!expanded && hidden > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, paddingHorizontal: space[4] }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
                      <Txt variant="caption" tone="subtle">mais {hidden} {hidden === 1 ? 'aluno' : 'alunos'}</Txt>
                      <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
                    </View>
                  ) : null}
                  {hidden > 0 || expanded ? (
                    <Button variant="ghost" block size="sm" label={expanded ? 'Mostrar menos' : 'Ver ranking completo'} onPress={() => setExpanded((v) => !v)} />
                  ) : null}
                </Card>
              ) : empty}
              {footnote}
            </>
          )}
        </ScreenBody>
      </ScrollView>
      <BottomBar>
        <View style={{ flex: 1 }}><Button block size="lg" cta icon="play" label="Praticar para subir" onPress={practice} /></View>
      </BottomBar>
    </View>
  );
}
