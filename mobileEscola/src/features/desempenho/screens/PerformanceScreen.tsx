import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchStudentPerformance,
  PerformanceBySubject,
  StudentPerformance,
} from '../../../services/performance.service';
import { subjectIconName } from '../../../services/simulados.service';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { platformShadow } from '../../../lib/shadow';
import { colors } from '../../../theme';

const MONTH_OPTIONS = [6, 12] as const;

function formatPct(value: number | null | undefined, fractionDigits = 1): string {
  if (value == null) return '—';
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

function trendColor(change: number | null | undefined): string {
  if (change == null || change === 0) return colors.muted;
  return change > 0 ? '#22C55E' : '#EF4444';
}

function BarChart({
  values,
  labels,
  maxHeight = 120,
}: {
  values: Array<number | null>;
  labels: string[];
  maxHeight?: number;
}) {
  const max = Math.max(100, ...values.filter((v): v is number => v != null));

  return (
    <View style={styles.chartRow}>
      {values.map((value, index) => {
        const height = value != null ? Math.max(8, (value / max) * maxHeight) : 4;
        const hasValue = value != null;
        return (
          <View key={`${labels[index]}-${index}`} style={styles.chartCol}>
            <Text style={styles.chartValue}>{hasValue ? formatPct(value, 0) : '—'}</Text>
            <View style={[styles.chartBarTrack, { height: maxHeight }]}>
              <View
                style={[
                  styles.chartBarFill,
                  {
                    height,
                    backgroundColor: hasValue ? colors.primary : '#E5E7EB',
                  },
                ]}
              />
            </View>
            <Text style={styles.chartLabel} numberOfLines={1}>
              {labels[index]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SubjectCard({ item }: { item: PerformanceBySubject }) {
  const subjectColor = item.subject.color || colors.primary;
  const approved =
    item.avg_percentage != null && item.passing_score_avg != null
      ? item.avg_percentage >= item.passing_score_avg
      : null;

  return (
    <View style={[styles.subjectCard, platformShadow({ color: '#111827', opacity: 0.06, radius: 12, elevation: 2 })]}>
      <View style={styles.subjectHeader}>
        <View style={[styles.subjectIcon, { backgroundColor: `${subjectColor}22` }]}>
          <Ionicons
            name={subjectIconName(item.subject.icon ?? '') as any}
            size={20}
            color={subjectColor}
          />
        </View>
        <View style={styles.subjectInfo}>
          <Text style={styles.subjectName}>{item.subject.name}</Text>
          <Text style={styles.subjectMeta}>
            {item.attempts_count} simulado{item.attempts_count !== 1 ? 's' : ''}
            {item.passing_score_avg != null ? ` · mín. ${formatPct(item.passing_score_avg, 0)}` : ''}
          </Text>
        </View>
        <Text style={[styles.subjectAvg, { color: approved === false ? '#EF4444' : approved === true ? '#22C55E' : colors.ink }]}>
          {formatPct(item.avg_percentage)}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(100, item.avg_percentage ?? 0)}%`,
              backgroundColor: subjectColor,
            },
          ]}
        />
      </View>

      <View style={styles.subjectFooter}>
        <Text style={styles.subjectFooterText}>
          Último: {formatPct(item.latest_percentage)}
        </Text>
        {item.month_change != null && (
          <View style={styles.trendPill}>
            <Ionicons
              name={item.month_change >= 0 ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={trendColor(item.month_change)}
            />
            <Text style={[styles.trendText, { color: trendColor(item.month_change) }]}>
              {item.month_change > 0 ? '+' : ''}
              {item.month_change.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp vs mês ant.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function PerformanceScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>(6);
  const [data, setData] = useState<StudentPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchStudentPerformance(months);
      setData(result);
    } catch {
      setError('Não foi possível carregar seu desempenho.');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [months]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const overview = data?.overview;
  const chartLabels = data?.monthly_evolution.map((m) => m.label) ?? [];
  const chartValues = data?.monthly_evolution.map((m) => m.avg_percentage) ?? [];

  const header = (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerGlowPrimary} />
      <View style={styles.headerGlowSecondary} />
      <View style={styles.headerTituloRow}>
        <MenuButton />
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitulo}>Aproveitamento</Text>
          <Text style={styles.headerSubtitulo}>Evolução por disciplina e por mês</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {header}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.periodRow}>
          {MONTH_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setMonths(option)}
              style={[styles.periodChip, months === option && styles.periodChipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.periodChipText, months === option && styles.periodChipTextActive]}>
                {option} meses
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !data ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            <View style={styles.overviewGrid}>
              <View style={[styles.overviewCard, styles.overviewCardPrimary]}>
                <Text style={styles.overviewLabel}>Média geral</Text>
                <Text style={styles.overviewValue}>{formatPct(overview?.avg_percentage)}</Text>
              </View>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewLabel}>Este mês</Text>
                <Text style={styles.overviewValue}>{formatPct(overview?.month_avg_percentage)}</Text>
                {overview?.month_change != null && (
                  <Text style={[styles.overviewChange, { color: trendColor(overview.month_change) }]}>
                    {overview.month_change > 0 ? '+' : ''}
                    {overview.month_change} pp
                  </Text>
                )}
              </View>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewLabel}>Simulados</Text>
                <Text style={styles.overviewValue}>{overview?.total_attempts ?? 0}</Text>
              </View>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewLabel}>Disciplinas</Text>
                <Text style={styles.overviewValue}>{overview?.subjects_count ?? 0}</Text>
              </View>
            </View>

            {overview?.best_subject && (
              <View style={styles.insightBox}>
                <Ionicons name="trophy-outline" size={18} color="#A16207" />
                <Text style={styles.insightText}>
                  Melhor média em{' '}
                  <Text style={styles.insightStrong}>{overview.best_subject.name}</Text>
                  {' '}({formatPct(overview.best_subject.avg_percentage)})
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Evolução mensal</Text>
            <View style={[styles.card, platformShadow({ color: '#111827', opacity: 0.05, radius: 10, elevation: 2 })]}>
              {chartValues.some((v) => v != null) ? (
                <BarChart values={chartValues} labels={chartLabels} />
              ) : (
                <Text style={styles.emptyText}>Sem simulados concluídos no período.</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Por disciplina</Text>
            {data.by_subject.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>Conclua simulados para ver o desempenho por disciplina.</Text>
              </View>
            ) : (
              data.by_subject.map((item) => <SubjectCard key={String(item.subject_id ?? 'general')} item={item} />)
            )}

            <Text style={styles.sectionTitle}>Detalhe mês a mês</Text>
            {data.monthly_evolution.map((month) => (
              <View key={month.month} style={[styles.monthCard, platformShadow({ color: '#111827', opacity: 0.04, radius: 8, elevation: 1 })]}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthTitle}>{month.label}</Text>
                  <Text style={styles.monthAvg}>{formatPct(month.avg_percentage)}</Text>
                </View>
                {month.by_subject.length === 0 ? (
                  <Text style={styles.monthEmpty}>Nenhum simulado neste mês</Text>
                ) : (
                  month.by_subject.map((subject) => (
                    <View key={`${month.month}-${subject.subject_id ?? 'g'}`} style={styles.monthSubjectRow}>
                      <Text style={styles.monthSubjectName} numberOfLines={1}>
                        {subject.subject_name}
                      </Text>
                      <Text style={styles.monthSubjectMeta}>
                        {subject.attempts_count} · {formatPct(subject.avg_percentage, 0)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ))}
          </>
        ) : null}
        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  scroll: { flex: 1 },
  headerWrap: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    right: -104,
    top: -150,
    backgroundColor: '#F0E9FF',
    opacity: 0.92,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -76,
    top: 58,
    backgroundColor: '#F7F2FF',
    opacity: 0.98,
  },
  headerTituloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 18,
    paddingBottom: 6,
  },
  headerTextWrap: { flex: 1 },
  headerTitulo: { fontSize: 22, fontWeight: '800', color: '#111827' },
  headerSubtitulo: { fontSize: 13, color: colors.muted, marginTop: 2 },
  content: { padding: 16, gap: 12 },
  contentCompact: { padding: 12 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  periodChipTextActive: { color: colors.surface },
  centered: { paddingVertical: 48, alignItems: 'center' },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#B91C1C', fontSize: 14 },
  retryButton: { marginTop: 12, alignSelf: 'flex-start' },
  retryText: { color: colors.primary, fontWeight: '700' },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  overviewCardPrimary: { backgroundColor: '#F5F0FF' },
  overviewLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  overviewValue: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 4 },
  overviewChange: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  insightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  insightText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  insightStrong: { fontWeight: '800', color: '#78350F' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 8 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', minWidth: 36 },
  chartValue: { fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  chartBarTrack: { width: '72%', justifyContent: 'flex-end', backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  chartBarFill: { width: '100%', borderRadius: 8 },
  chartLabel: { fontSize: 10, color: colors.muted, marginTop: 6, textAlign: 'center' },
  subjectCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 10,
  },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  subjectInfo: { flex: 1 },
  subjectName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  subjectMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  subjectAvg: { fontSize: 18, fontWeight: '800' },
  progressTrack: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  subjectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  subjectFooterText: { fontSize: 12, color: colors.muted },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 11, fontWeight: '600' },
  monthCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 8,
  },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  monthTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  monthAvg: { fontSize: 14, fontWeight: '800', color: colors.primary },
  monthEmpty: { fontSize: 12, color: colors.muted },
  monthSubjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F9FAFB',
    gap: 8,
  },
  monthSubjectName: { flex: 1, fontSize: 13, color: colors.ink },
  monthSubjectMeta: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
