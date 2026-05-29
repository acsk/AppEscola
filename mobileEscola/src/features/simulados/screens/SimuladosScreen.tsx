import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  SimuladoListItem,
  AttemptStatus,
  subjectIconName,
  formatExamDuration,
  filtrarSimulados,
  extrairDisciplinasDosSimulados,
} from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useSimuladosList } from '../hooks';
import {
  SimuladosFilters,
  DEFAULT_SIMULADOS_FILTERS,
  type SimuladosFilterState,
} from '../components/SimuladosFilters';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { isPeriodBlockingStart, resolveExamPeriodStatus } from '../lib/exam-period';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'SimuladosList'>;

const STATUS_LABEL: Record<AttemptStatus, string> = {
  not_started:      'Disponível',
  in_progress:      'Em andamento',
  pending_review:   'Aguardando correção',
  awaiting_release: 'Aguardando liberação',
  completed:        'Concluído',
  abandoned:        'Tempo esgotado',
};

const STATUS_COLOR: Record<AttemptStatus, string> = {
  not_started:      '#22C55E',
  in_progress:      '#F97316',
  pending_review:   '#F97316',
  awaiting_release: '#F97316',
  completed:        '#22C55E',
  abandoned:        '#94A3B8',
};

const STATUS_ICON: Record<AttemptStatus, React.ComponentProps<typeof Ionicons>['name']> = {
  not_started:      'play-circle-outline',
  in_progress:      'time-outline',
  pending_review:   'hourglass-outline',
  awaiting_release: 'lock-closed-outline',
  completed:        'checkmark-circle-outline',
  abandoned:        'timer-outline',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusColor(status: AttemptStatus, colors: ThemeColors): string {
  return STATUS_COLOR[status] ?? colors.muted;
}

function tint(hex: string | undefined, alpha: string, fallback: string): string {
  if (!hex || !hex.startsWith('#')) return fallback;
  return `${hex}${alpha}`;
}

export function SimuladosScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createSimuladosStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [filtros, setFiltros] = useState<SimuladosFilterState>(DEFAULT_SIMULADOS_FILTERS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const {
    data: todosSimulados = [],
    isLoading: carregando,
    isRefetching: atualizando,
    isError,
    error,
    refetch,
  } = useSimuladosList();

  const disciplinas = useMemo(
    () => extrairDisciplinasDosSimulados(todosSimulados),
    [todosSimulados],
  );

  const simulados = useMemo(
    () => filtrarSimulados(todosSimulados, {
      period: filtros.period,
      subject_id: filtros.subject_id ?? undefined,
      attempt_status: filtros.attempt_status ?? undefined,
    }),
    [todosSimulados, filtros],
  );

  const erro = isError
    ? getApiErrorMessage(error, 'Não foi possível carregar os simulados.')
    : null;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // ── Render: card disponível ────────────────────────────────────────────────
  function renderDisponivel({ item }: { item: SimuladoListItem }) {
    const periodStatus = resolveExamPeriodStatus(item);
    const periodBloqueia = isPeriodBlockingStart(periodStatus, item.attempt_status);
    const cor   = periodBloqueia
      ? periodStatus === 'upcoming'
        ? '#B45309'
        : '#64748B'
      : statusColor(item.attempt_status, colors);
    const label = periodBloqueia
      ? periodStatus === 'upcoming'
        ? 'Em breve'
        : 'Encerrado'
      : STATUS_LABEL[item.attempt_status];
    const icon  = periodBloqueia
      ? periodStatus === 'upcoming'
        ? 'calendar-outline'
        : 'lock-closed-outline'
      : STATUS_ICON[item.attempt_status];
    const subjectColor = item.subject?.color ?? colors.primary;
    const aproveitamentoAprovado =
      item.aproveitamento != null && item.passing_score != null
        ? item.aproveitamento >= item.passing_score
        : null;
    const aproveitamentoColor =
      aproveitamentoAprovado === true
        ? '#22C55E'
        : aproveitamentoAprovado === false
        ? '#EF4444'
        : colors.muted;
    const aproveitamentoIcon =
      aproveitamentoAprovado === true
        ? 'checkmark-circle'
        : aproveitamentoAprovado === false
        ? 'close-circle'
        : 'stats-chart-outline';
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: tint(subjectColor, '10', colors.soft),
            borderColor: tint(subjectColor, '35', colors.soft),
            shadowColor: subjectColor,
          },
        ]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SimuladoDetalhe', { examId: item.id })}
      >
        {item.subject && (
          <View style={[styles.cardAccent, { backgroundColor: subjectColor }]} />
        )}
        <View style={styles.cardTopo}>
          <View style={styles.cardTopoEsq}>
            {item.subject && (
              <View style={[styles.subjectChip, { backgroundColor: tint(subjectColor, '18', colors.soft) }]}>
                <Ionicons name={subjectIconName(item.subject.icon) as any} size={12} color={subjectColor} />
                <Text style={[styles.subjectNome, { color: subjectColor }]}>{item.subject.name}</Text>
              </View>
            )}
            {item.exam_type_label ? (
              <View style={styles.tipoChip}>
                <Text style={styles.tipoTexto}>{item.exam_type_label}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: cor }]}>
            <Ionicons name={icon} size={13} color={colors.surface} style={{ marginRight: 4 }} />
            <Text style={styles.badgeTexto}>{label}</Text>
          </View>
        </View>
        {item.period_closed ? (
          <View style={styles.periodoEncerrado}>
            <Ionicons name="calendar-outline" size={12} color="#64748B" />
            <Text style={styles.periodoEncerradoTexto}>Período encerrado</Text>
          </View>
        ) : null}
        {periodBloqueia && item.period_message ? (
          <View style={styles.foraPeriodo}>
            <Ionicons
              name={periodStatus === 'upcoming' ? 'calendar-outline' : 'lock-closed-outline'}
              size={12}
              color={colors.muted}
            />
            <Text style={styles.foraPeriodoTexto} numberOfLines={2}>{item.period_message}</Text>
          </View>
        ) : null}
        <Text style={styles.cardTitulo} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardRodape}>
          <View style={styles.infoItem}>
            <Ionicons name="help-circle-outline" size={14} color={colors.muted} />
            <Text style={styles.infoTexto}>
              {item.total_questions ?? 0} questão{(item.total_questions ?? 0) !== 1 ? 'ões' : ''}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={styles.infoTexto}>{formatExamDuration(item.duration_minutes)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="ribbon-outline" size={14} color={colors.muted} />
            <Text style={styles.infoTexto}>Mínimo {item.passing_score}%</Text>
          </View>
        </View>
        {item.aproveitamento != null && (
          <View style={styles.aproveitamentoRow}>
            <View style={styles.aproveitamentoLeft}>
              <Ionicons name={aproveitamentoIcon as any} size={18} color={aproveitamentoColor} />
              <Text style={styles.aproveitamentoLabel}>Aproveitamento</Text>
            </View>
            <Text style={[styles.aproveitamentoValor, { color: aproveitamentoColor }]}>
              {item.aproveitamento.toLocaleString('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              })}
              %
            </Text>
          </View>
        )}
        {item.ends_at && item.attempt_status !== 'completed' && (
          <View style={styles.prazoRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.muted} />
            <Text style={styles.prazoTexto}>Prazo: {formatDate(item.ends_at)}</Text>
          </View>
        )}
        {item.attempt_status === 'awaiting_release' && (
          <View style={styles.prazoRow}>
            <Ionicons name="lock-closed-outline" size={12} color="#0891B2" />
            <Text style={[styles.prazoTexto, { color: '#0891B2' }]}>Resultado bloqueado até o fechamento do período</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Header fixo ────────────────────────────────────────────────────────────
  const header = (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerGlowPrimary} />
      <View style={styles.headerGlowSecondary} />
      <View style={styles.headerTituloRow}>
        <MenuButton />
        <Text style={styles.headerTitulo}>Simulados</Text>
        <TouchableOpacity
          style={styles.headerLinkBtn}
          onPress={() => navigation.navigate('ProvasAnteriores')}
          activeOpacity={0.85}
        >
          <Ionicons name="archive-outline" size={16} color={colors.surface} />
          <Text style={styles.headerLinkTexto}>Provas anteriores</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (carregando) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.carregandoTexto}>Carregando simulados…</Text>
        </View>
      </View>
    );
  }
  if (erro) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centrado}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
          <Text style={styles.erroTexto}>{erro}</Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={simulados}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderDisponivel}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.lista, simulados.length === 0 && styles.listaComVazio]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => refetch()} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.cabecalho}>
              {simulados.length} de {todosSimulados.length} simulado{todosSimulados.length !== 1 ? 's' : ''}
            </Text>
            <SimuladosFilters
              expanded={filtrosAbertos}
              onToggleExpanded={() => setFiltrosAbertos((v) => !v)}
              filters={filtros}
              onChange={setFiltros}
              subjects={disciplinas}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Ionicons name="filter-outline" size={56} color={colors.border} />
            <Text style={styles.vazioTitulo}>
              {todosSimulados.length === 0
                ? 'Nenhum simulado disponível'
                : 'Nenhum simulado com esses filtros'}
            </Text>
            <Text style={styles.vazioSub}>
              {todosSimulados.length === 0
                ? 'Verifique sua matrícula ou tente mais tarde.'
                : 'Ajuste período, disciplina ou status da tentativa.'}
            </Text>
            {todosSimulados.length > 0 ? (
              <TouchableOpacity
                style={styles.botaoTentar}
                onPress={() => setFiltros({ ...DEFAULT_SIMULADOS_FILTERS })}
                activeOpacity={0.8}
              >
                <Text style={styles.botaoTentarTexto}>Limpar filtros</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

function createSimuladosStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },

  // Header
  headerWrap: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOpacity: 0.08, shadowRadius: 18, elevation: 3,
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
    paddingBottom: 14,
  },
  headerTitulo: { flex: 1, fontSize: 22, fontWeight: '800', color: '#111827' },
  headerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerLinkTexto: { fontSize: 11, fontWeight: '700', color: colors.surface },
  lista: { padding: 16, paddingTop: 12 },
  listaComVazio: { flexGrow: 1 },
  listHeader: { marginBottom: 12, gap: 10 },
  cabecalho:  { fontSize: 13, color: colors.muted },
  periodoEncerrado: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  periodoEncerradoTexto: { fontSize: 11, color: '#64748B', fontWeight: '600' },

  card: {
    backgroundColor: colors.surface, borderRadius: 18, padding: 16, paddingLeft: 20,
    marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 2,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTopoEsq: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  subjectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  subjectNome: { fontSize: 11, fontWeight: '800' },
  tipoChip: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  tipoTexto: { fontSize: 11, color: '#64748B', fontWeight: '800' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  badgeTexto: { fontSize: 12, fontWeight: '800', color: colors.surface },
  foraPeriodo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foraPeriodoTexto: { fontSize: 11, color: colors.muted },
  cardTitulo: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 12, lineHeight: 22 },
  cardRodape: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoTexto: { fontSize: 12, color: colors.muted },
  aproveitamentoRow: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aproveitamentoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  aproveitamentoLabel: { fontSize: 12, color: colors.muted, fontWeight: '800' },
  aproveitamentoValor: { fontSize: 16, fontWeight: '900' },
  prazoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  prazoTexto: { fontSize: 11, color: colors.muted },

  // Histórico
  histMetricas: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10, gap: 0,
  },
  histMetricaItem: { flex: 1, alignItems: 'center' },
  histMetricaValor: { fontSize: 15, fontWeight: '700', color: colors.ink },
  histMetricaLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  histMetricaSep: { width: 1, height: 32, backgroundColor: colors.border },

  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F6F7FB' },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: colors.muted },
  erroTexto: { fontSize: 14, color: colors.text, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  botaoTentar: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  botaoTentarTexto: { color: colors.surface, fontWeight: '600', fontSize: 15 },
  vazio: { alignItems: 'center', padding: 32 },
  vazioTitulo: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 16, textAlign: 'center' },
  vazioSub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
}
