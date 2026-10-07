import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { getApiErrorMessage } from '../../../lib/apiError';
import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  type PerformanceScore,
  type PerformanceSubject,
  type StudyFocusItem,
} from '../../../services/practice.service';
import { usePracticePerformance } from '../hooks';
import { formatPercent } from '../lib/format';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'BancoDesempenho'>;

function scoreLine(score: PerformanceScore & { available: number }): string {
  if (score.answered === 0) return `${score.available} questão${score.available !== 1 ? 'ões' : ''} para praticar`;
  return `${score.correct} de ${score.answered} certas`;
}

/** Desempenho na prática do banco por disciplina → assunto, com os assuntos que mais precisam de estudo. */
export function BancoDesempenhoScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch, isRefetching } = usePracticePerformance();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const practice = (subjectId: number | null, topicId: number | null) =>
    navigation.navigate('BancoPraticar', { subjectId: subjectId ?? undefined, topicId: topicId ?? undefined });

  const LevelBadge = ({ score }: { score: PerformanceScore }) => (
    <View style={[styles.badge, { backgroundColor: `${LEVEL_COLOR[score.level]}22` }]}>
      <Text style={[styles.badgeText, { color: LEVEL_COLOR[score.level] }]}>{LEVEL_LABEL[score.level]}</Text>
    </View>
  );

  const Bar = ({ score }: { score: PerformanceScore }) => (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, score.accuracy ?? 0)}%`, backgroundColor: LEVEL_COLOR[score.level] }]} />
    </View>
  );

  const focusReason = (item: StudyFocusItem) =>
    item.reason === 'low_accuracy'
      ? `${formatPercent(item.accuracy)} de acerto em ${item.answered} questões`
      : `Ainda não praticado · ${item.available} questão${item.available !== 1 ? 'ões' : ''}`;

  const renderSubject = (subject: PerformanceSubject) => {
    const key = String(subject.id ?? 'none');
    const open = !!expanded[key];
    return (
      <View key={key} style={styles.subjectCard}>
        <TouchableOpacity onPress={() => setExpanded((prev) => ({ ...prev, [key]: !open }))} activeOpacity={0.85}
          accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={styles.rowBetween}>
            <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
            <Text style={styles.subjectPct}>{formatPercent(subject.accuracy)}</Text>
          </View>
          <Bar score={subject} />
          <View style={styles.rowBetween}>
            <Text style={styles.meta}>{scoreLine(subject)} · {subject.topics.length} assunto{subject.topics.length !== 1 ? 's' : ''}</Text>
            <View style={styles.rowGap}>
              <LevelBadge score={subject} />
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </View>
          </View>
        </TouchableOpacity>
        {open ? (
          <View style={styles.topics}>
            {subject.topics.map((topic) => (
              <View key={String(topic.id ?? 'none')} style={styles.topicRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.topicName} numberOfLines={2}>{topic.name}</Text>
                    <Text style={styles.topicPct}>{formatPercent(topic.accuracy)}</Text>
                  </View>
                  <Bar score={topic} />
                  <View style={styles.rowBetween}>
                    <Text style={styles.meta}>{scoreLine(topic)}</Text>
                    <LevelBadge score={topic} />
                  </View>
                </View>
                {topic.available > 0 && subject.id != null ? (
                  <TouchableOpacity style={styles.practiceIcon} onPress={() => practice(subject.id, topic.id)}
                    accessibilityLabel={`Praticar ${topic.name}`}>
                    <Ionicons name="play" size={16} color={colors.surface} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (isError || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{getApiErrorMessage(error, 'Não foi possível carregar seu desempenho.')}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => refetch()}>
          <Text style={styles.primaryButtonText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View style={styles.overall}>
        <Text style={styles.overallValue}>{formatPercent(data.overall.accuracy, 1)}</Text>
        <Text style={styles.overallLabel}>
          de acerto em {data.overall.answered} resposta{data.overall.answered !== 1 ? 's' : ''} no banco de questões
        </Text>
      </View>

      <Text style={styles.sectionTitle}>O que estudar agora</Text>
      {data.study_focus.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            {data.overall.answered === 0
              ? 'Responda algumas questões para descobrir seus pontos fracos.'
              : 'Nenhum assunto em alerta. Continue praticando para manter o ritmo!'}
          </Text>
        </View>
      ) : (
        data.study_focus.map((item) => (
          <View key={`${item.subject.id}-${item.topic.id}`} style={styles.focusCard}>
            <View style={[styles.focusIcon, { backgroundColor: `${LEVEL_COLOR[item.level]}22` }]}>
              <Ionicons name={item.reason === 'low_accuracy' ? 'alert-circle' : 'sparkles'} size={20} color={LEVEL_COLOR[item.level]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle} numberOfLines={2}>{item.topic.name}</Text>
              <Text style={styles.meta}>{item.subject.name} · {focusReason(item)}</Text>
            </View>
            {item.available > 0 && item.subject.id != null ? (
              <TouchableOpacity style={styles.practiceButton} onPress={() => practice(item.subject.id, item.topic.id)}>
                <Text style={styles.practiceButtonText}>Praticar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Por disciplina e assunto</Text>
      {data.subjects.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Ainda não há questões do banco disponíveis para praticar.</Text>
        </View>
      ) : (
        data.subjects.map(renderSubject)
      )}

      <Text style={styles.legend}>
        “Reforçar”: menos de 50% de acerto · “Atenção”: de 50% a 69% · “Bom”: 70% ou mais. Com menos de {data.min_sample} respostas
        o assunto aparece como “Poucos dados”. Contam as questões avulsas e os simulados do banco finalizados.
      </Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.background },
    muted: { fontSize: 13, color: colors.muted, lineHeight: 19, textAlign: 'center' },
    overall: { backgroundColor: colors.primary, borderRadius: 18, padding: 18, alignItems: 'center' },
    overallValue: { fontSize: 32, fontWeight: '900', color: colors.surface },
    overallLabel: { fontSize: 13, color: colors.surface, opacity: 0.9, textAlign: 'center', marginTop: 2 },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 12 },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
    focusCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    focusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    focusTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
    practiceButton: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    practiceButtonText: { color: colors.surface, fontWeight: '800', fontSize: 12 },
    subjectCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    subjectName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.ink },
    subjectPct: { fontSize: 16, fontWeight: '900', color: colors.ink },
    meta: { fontSize: 12, color: colors.muted, flexShrink: 1 },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.soft, overflow: 'hidden', marginVertical: 6 },
    barFill: { height: 8, borderRadius: 4 },
    badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    topics: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 4 },
    topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    topicName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
    topicPct: { fontSize: 13, fontWeight: '800', color: colors.ink },
    practiceIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    legend: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 8 },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20 },
    primaryButtonText: { color: colors.surface, fontWeight: '800' },
  });
}
