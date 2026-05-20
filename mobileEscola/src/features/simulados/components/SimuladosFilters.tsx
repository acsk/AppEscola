import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AttemptStatus, SimuladoPeriodFilter, SimuladoSubject } from '../../../services/simulados.service';
import { colors } from '../../../theme';

export interface SimuladosFilterState {
  period: SimuladoPeriodFilter;
  subject_id: number | null;
  attempt_status: AttemptStatus | null;
}

export const DEFAULT_SIMULADOS_FILTERS: SimuladosFilterState = {
  period: 'open',
  subject_id: null,
  attempt_status: null,
};

const PERIOD_OPTIONS: { value: SimuladoPeriodFilter; label: string }[] = [
  { value: 'open', label: 'Em aberto' },
  { value: 'closed', label: 'Encerrados' },
  { value: 'all', label: 'Todos' },
];

const STATUS_OPTIONS: { value: AttemptStatus | null; label: string }[] = [
  { value: null, label: 'Qualquer status' },
  { value: 'not_started', label: 'Disponível' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'pending_review', label: 'Aguardando correção' },
  { value: 'awaiting_release', label: 'Aguardando liberação' },
  { value: 'completed', label: 'Concluído' },
  { value: 'abandoned', label: 'Tempo esgotado' },
];

function countActiveFilters(filters: SimuladosFilterState): number {
  let n = 0;
  if (filters.period !== DEFAULT_SIMULADOS_FILTERS.period) n++;
  if (filters.subject_id != null) n++;
  if (filters.attempt_status != null) n++;
  return n;
}

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  filters: SimuladosFilterState;
  onChange: (next: SimuladosFilterState) => void;
  subjects: SimuladoSubject[];
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipAtivo]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipTexto, active && styles.chipTextoAtivo]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SimuladosFilters({
  expanded,
  onToggleExpanded,
  filters,
  onChange,
  subjects,
}: Props) {
  const activeCount = countActiveFilters(filters);

  function limpar() {
    onChange({ ...DEFAULT_SIMULADOS_FILTERS });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.filtroBotao} onPress={onToggleExpanded} activeOpacity={0.85}>
          <Ionicons name="options-outline" size={18} color={colors.primary} />
          <Text style={styles.filtroBotaoTexto}>Filtros</Text>
          {activeCount > 0 ? (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountTexto}>{activeCount}</Text>
            </View>
          ) : null}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.muted}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
        {activeCount > 0 ? (
          <TouchableOpacity onPress={limpar} activeOpacity={0.85}>
            <Text style={styles.limparTexto}>Limpar</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.painel}>
          <Text style={styles.grupoLabel}>Período do simulado</Text>
          <View style={styles.chipRow}>
            {PERIOD_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={filters.period === opt.value}
                onPress={() => onChange({ ...filters, period: opt.value })}
              />
            ))}
          </View>

          <Text style={styles.grupoLabel}>Disciplina</Text>
          <View style={styles.chipRow}>
            <FilterChip
              label="Todas"
              active={filters.subject_id == null}
              onPress={() => onChange({ ...filters, subject_id: null })}
            />
            {subjects.map((s) => (
              <FilterChip
                key={s.id}
                label={s.name}
                active={filters.subject_id === s.id}
                onPress={() => onChange({ ...filters, subject_id: s.id })}
              />
            ))}
          </View>

          <Text style={styles.grupoLabel}>Status da sua tentativa</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.label}
                label={opt.label}
                active={filters.attempt_status === opt.value}
                onPress={() => onChange({ ...filters, attempt_status: opt.value })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, gap: 8 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filtroBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filtroBotaoTexto: { fontSize: 13, fontWeight: '700', color: colors.primary },
  badgeCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeCountTexto: { fontSize: 11, fontWeight: '800', color: colors.surface },
  limparTexto: { fontSize: 13, fontWeight: '600', color: colors.muted },
  painel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  grupoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    maxWidth: '100%',
  },
  chipAtivo: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  chipTexto: { fontSize: 13, fontWeight: '600', color: colors.muted, flexShrink: 1 },
  chipTextoAtivo: { color: colors.primary },
});
