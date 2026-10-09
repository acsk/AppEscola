import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import type { RankingRow } from '../../../services/practice.service';
import { usePracticeRanking } from '../../banco-questoes/hooks';
import { formatPercent, rankingWeekRange } from '../../banco-questoes/lib/format';
import { Button, Card, Chip, Icon, LinkButton, RankMovement, Section, Txt, font, space, usePalette } from '../../../ui';

const TOP = 5;
const MEDAL = ['🥇', '🥈', '🥉'];
const points = (score?: number | null) => (score ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

/** Top 5 de desempenho da semana (Wilson, primeira tentativa), mais o campeão da semana anterior. */
export function HomeRankingCard({ onOpen, onPractice }: { onOpen: () => void; onPractice: () => void }) {
  const p = usePalette();
  const [courseId, setCourseId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = usePracticeRanking('week', { criterion: 'wilson', courseId });
  const lastWeek = usePracticeRanking('last_week', { criterion: 'wilson', courseId }).data;
  const top = data?.ranking.slice(0, TOP) ?? [];
  const weekRange = data ? rankingWeekRange(data) : null;
  const champions = lastWeek?.ranking.filter((row) => row.position === 1) ?? [];
  const meOutside = data?.me && !top.some((row) => row.is_me) ? data.me : null;

  const renderRow = (row: RankingRow) => {
    const medal = row.position <= 3 ? MEDAL[row.position - 1] : null;
    return (
      <View key={`${row.position}-${row.name}-${row.is_me}`}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], paddingHorizontal: space[2],
          borderRadius: 12, backgroundColor: row.is_me ? p.brandSoft : 'transparent',
        }}>
        <View style={{ minWidth: 32, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surfaceSunken }}>
          <Text style={{ ...font.extrabold, fontSize: 12, color: p.ink }}>{row.position}º</Text>
        </View>
        <View style={{ width: 36, alignItems: 'flex-start' }}>
          <RankMovement movement={row.movement} status={row.movement_status} referenceAt={row.movement_reference_at} />
        </View>
        <View style={{ width: 32, height: 32, overflow: 'visible' }}>
          {row.photo_url ? (
            <Image source={{ uri: row.photo_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...font.bold, fontSize: 11, color: p.inkMuted }}>{initials(row.name)}</Text>
            </View>
          )}
          {medal ? (
            <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', bottom: -9, left: 0, right: 0, textAlign: 'center', fontSize: 16, lineHeight: 18 }}>{medal}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" numberOfLines={1}>{row.name}{row.is_me ? ' (você)' : ''}</Txt>
          <Txt variant="caption" tone="subtle">{row.questions} {row.questions === 1 ? 'questão' : 'questões'} · {formatPercent(row.accuracy)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt variant="titleSm" tone="brand">{points(row.score)}</Txt>
          <Txt variant="caption" tone="subtle">pontos</Txt>
        </View>
      </View>
    );
  };

  return (
    <Section title="Ranking da semana" action={<LinkButton label="Ver ranking" onPress={onOpen} />}>
      <Card style={{ gap: space[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
          <Icon name="trophy" size={16} color={p.inkMuted} />
          <Txt variant="bodySm" tone="subtle" style={{ flex: 1 }}>
            Quem mais acerta de primeira {weekRange ? `de ${weekRange}` : 'nesta semana'}
            {data?.course_name ? ` · ${data.course_name}` : ''} · reinicia toda segunda
          </Txt>
        </View>
        {(data?.courses?.length ?? 0) > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[2] }}>
            {data?.courses?.map((course) => (
              <Chip key={course.id} label={course.name} selected={(courseId ?? data.course_id) === course.id} onPress={() => setCourseId(course.id)} />
            ))}
          </View>
        ) : null}
        {champions.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[2], borderRadius: 12, backgroundColor: p.surfaceSunken, marginBottom: space[1] }}>
            <Text style={{ fontSize: 16, lineHeight: 18 }}>{MEDAL[0]}</Text>
            <Txt variant="bodySm" style={{ flex: 1 }} numberOfLines={2}>
              {champions.length === 1 ? 'Campeão da semana anterior: ' : 'Campeões da semana anterior: '}
              <Txt variant="bodySm" style={font.bold}>
                {champions.map((row) => `${row.name}${row.is_me ? ' (você)' : ''}`).join(', ')}
              </Txt>
              {` · ${points(champions[0].score)} pontos`}
            </Txt>
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={p.brand} style={{ marginVertical: space[4] }} />
        ) : isError || !data ? (
          <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[3] }}>
            <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center' }}>Não foi possível carregar o ranking.</Txt>
            <Button variant="secondary" size="sm" icon="refresh" label="Tentar novamente" onPress={() => refetch()} />
          </View>
        ) : top.length === 0 ? (
          <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[3] }}>
            <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center' }}>Ninguém pontuou nesta semana. Seja o primeiro!</Txt>
            <Button variant="secondary" size="sm" icon="play" label="Praticar agora" onPress={onPractice} />
          </View>
        ) : (
          <>
            {top.map(renderRow)}
            {meOutside ? (
              <>
                <View style={{ height: 1, backgroundColor: p.line, marginVertical: space[1] }} />
                {renderRow(meOutside)}
              </>
            ) : !data.me ? (
              <Txt variant="caption" tone="subtle" style={{ marginTop: space[1] }}>Responda questões no banco para entrar no ranking.</Txt>
            ) : null}
          </>
        )}
      </Card>
    </Section>
  );
}
