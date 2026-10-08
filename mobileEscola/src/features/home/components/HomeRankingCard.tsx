import React from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import type { RankingRow } from '../../../services/practice.service';
import { usePracticeRanking } from '../../banco-questoes/hooks';
import { formatPercent, rankingWeekRange } from '../../banco-questoes/lib/format';
import { Button, Card, Icon, LinkButton, RankMovement, Section, Txt, font, space, usePalette } from '../../../ui';

const TOP = 5;
const MEDAL = ['#F59E0B', '#94A3B8', '#B45309'];

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

/** Top 5 da semana corrente (segunda a domingo) no banco de questões, mais o campeão da semana anterior já fechada. */
export function HomeRankingCard({ onOpen, onPractice }: { onOpen: () => void; onPractice: () => void }) {
  const p = usePalette();
  const { data, isLoading, isError, refetch } = usePracticeRanking('week');
  const lastWeek = usePracticeRanking('last_week').data;
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
        <View style={{ minWidth: 32, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: medal ?? p.surfaceSunken }}>
          <Text style={{ ...font.extrabold, fontSize: 12, color: medal ? '#FFFFFF' : p.ink }}>{row.position}º</Text>
        </View>
        <View style={{ width: 28, alignItems: 'flex-start' }}>
          <RankMovement movement={row.movement} />
        </View>
        {row.photo_url ? (
          <Image source={{ uri: row.photo_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...font.bold, fontSize: 11, color: p.inkMuted }}>{initials(row.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" numberOfLines={1}>{row.name}{row.is_me ? ' (você)' : ''}</Txt>
          <Txt variant="caption" tone="subtle">{formatPercent(row.accuracy)} de acerto</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt variant="titleSm" tone="brand">{row.questions}</Txt>
          <Txt variant="caption" tone="subtle">questões</Txt>
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
            Quem mais respondeu questões {weekRange ? `de ${weekRange}` : 'nesta semana'} · reinicia toda segunda
          </Txt>
        </View>
        {champions.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[2], borderRadius: 12, backgroundColor: p.surfaceSunken, marginBottom: space[1] }}>
            <Icon name="trophy" size={16} color={MEDAL[0]} />
            <Txt variant="bodySm" style={{ flex: 1 }} numberOfLines={2}>
              {champions.length === 1 ? 'Campeão da semana anterior: ' : 'Campeões da semana anterior: '}
              <Txt variant="bodySm" style={font.bold}>
                {champions.map((row) => `${row.name}${row.is_me ? ' (você)' : ''}`).join(', ')}
              </Txt>
              {` · ${champions[0].questions} ${champions[0].questions === 1 ? 'questão' : 'questões'}`}
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
            <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center' }}>Ninguém respondeu questões nesta semana. Seja o primeiro!</Txt>
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
