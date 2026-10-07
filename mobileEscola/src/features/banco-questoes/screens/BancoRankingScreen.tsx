import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { RankingPeriod, RankingRow } from '../../../services/practice.service';
import { usePracticeRanking } from '../hooks';
import { formatPercent } from '../lib/format';

const PERIODS: Array<{ id: RankingPeriod; label: string }> = [
  { id: 'week', label: '7 dias' },
  { id: 'month', label: '30 dias' },
  { id: 'all', label: 'Geral' },
];

const MEDAL = ['#F59E0B', '#94A3B8', '#B45309'];

/** Ranking de quem mais responde no banco de questões da escola (questões diferentes; empate pelos acertos). */
export function BancoRankingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [period, setPeriod] = useState<RankingPeriod>('month');
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticeRanking(period);
  const meInList = !!data?.ranking.some((row) => row.is_me);

  const renderRow = (row: RankingRow, highlight = false) => (
    <View style={[styles.row, (row.is_me || highlight) && styles.rowMe]}>
      <View style={[styles.position, row.position <= 3 && { backgroundColor: MEDAL[row.position - 1] }]}>
        <Text style={[styles.positionText, row.position <= 3 && { color: colors.surface }]}>{row.position}º</Text>
      </View>
      {row.photo_url ? (
        <Image source={{ uri: row.photo_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Ionicons name="person" size={16} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{row.name}{row.is_me ? ' (você)' : ''}</Text>
        <Text style={styles.meta}>{formatPercent(row.accuracy)} de acerto</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.count}>{row.questions}</Text>
        <Text style={styles.meta}>questões</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={[styles.chip, period === p.id && styles.chipActive]}
            accessibilityRole="tab" accessibilityState={{ selected: period === p.id }}>
            <Text style={[styles.chipText, period === p.id && styles.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{getApiErrorMessage(error, 'Não foi possível carregar o ranking.')}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => refetch()}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data.ranking}
          keyExtractor={(row) => `${row.position}-${row.name}-${row.is_me}`}
          renderItem={({ item }) => renderRow(item)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 6 }}>
              {data.me && !meInList ? (
                <>
                  <Text style={styles.sectionLabel}>Sua posição</Text>
                  {renderRow(data.me, true)}
                </>
              ) : null}
              {!data.me ? (
                <View style={styles.tip}>
                  <Ionicons name="flash-outline" size={16} color={colors.primary} />
                  <Text style={styles.tipText}>Responda questões no banco para entrar no ranking.</Text>
                </View>
              ) : null}
              <Text style={styles.sectionLabel}>{data.participants} aluno{data.participants !== 1 ? 's' : ''} no período</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.muted}>Ninguém respondeu questões do banco neste período ainda.</Text>}
          ListFooterComponent={
            <Text style={styles.footnote}>
              Conta quantas questões diferentes cada aluno respondeu (prática e simulados do banco finalizados). Repetir a
              mesma questão não sobe posição.
            </Text>
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    periods: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
    chip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: colors.soft },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '800', color: colors.text },
    chipTextActive: { color: colors.surface },
    list: { padding: 16, paddingTop: 8, gap: 8, paddingBottom: 32 },
    centered: { alignItems: 'center', gap: 12, padding: 24 },
    muted: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
    retry: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
    retryText: { color: colors.surface, fontWeight: '700' },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
    tip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.soft, borderRadius: 12, padding: 12 },
    tipText: { flex: 1, fontSize: 13, color: colors.text },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    rowMe: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.soft },
    position: { minWidth: 36, height: 30, borderRadius: 15, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft },
    positionText: { fontSize: 13, fontWeight: '900', color: colors.text },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarEmpty: { backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 14, fontWeight: '800', color: colors.ink },
    meta: { fontSize: 11, color: colors.muted },
    count: { fontSize: 18, fontWeight: '900', color: colors.primary },
    footnote: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 12 },
  });
}
