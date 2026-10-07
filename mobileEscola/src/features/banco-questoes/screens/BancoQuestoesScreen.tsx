import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { QuestionSetSummary } from '../../../services/practice.service';
import { usePracticeSummary, useQuestionSets } from '../hooks';
import { formatPercent } from '../lib/format';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'BancoQuestoes'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Área do banco de questões: prática avulsa, simulados do banco, desempenho por assunto e ranking. */
export function BancoQuestoesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const summary = usePracticeSummary();
  const sets = useQuestionSets();

  useFocusEffect(
    useCallback(() => {
      summary.refetch();
      sets.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao voltar para a tela
    }, []),
  );

  const shortcuts: Array<{ icon: IconName; title: string; subtitle: string; onPress: () => void }> = [
    { icon: 'flash-outline', title: 'Praticar questões', subtitle: 'Uma por vez, com correção na hora', onPress: () => navigation.navigate('BancoPraticar') },
    { icon: 'analytics-outline', title: 'O que estudar', subtitle: 'Desempenho por disciplina e assunto', onPress: () => navigation.navigate('BancoDesempenho') },
    { icon: 'trophy-outline', title: 'Ranking', subtitle: 'Quem mais responde na escola', onPress: () => navigation.navigate('BancoRanking') },
  ];

  const openSet = (set: QuestionSetSummary) =>
    navigation.navigate('BancoSimulado', set.open_attempt_id ? { attemptId: set.open_attempt_id, title: set.title } : { setId: set.id, title: set.title });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching || sets.isRefetching}
          onRefresh={() => { summary.refetch(); sets.refetch(); }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.data?.answered ?? '—'}</Text>
          <Text style={styles.summaryLabel}>respondidas</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.data?.correct ?? '—'}</Text>
          <Text style={styles.summaryLabel}>acertos</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatPercent(summary.data?.accuracy)}</Text>
          <Text style={styles.summaryLabel}>de acerto</Text>
        </View>
      </View>

      {shortcuts.map((item) => (
        <TouchableOpacity key={item.title} style={styles.shortcut} onPress={item.onPress} activeOpacity={0.85}>
          <View style={styles.shortcutIcon}>
            <Ionicons name={item.icon} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shortcutTitle}>{item.title}</Text>
            <Text style={styles.shortcutSubtitle}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Simulados do banco</Text>
      <Text style={styles.sectionHint}>Montados pela escola. Não valem nota: a correção aparece quando você finaliza.</Text>
      {sets.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : sets.isError ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{getApiErrorMessage(sets.error, 'Não foi possível carregar os simulados.')}</Text>
          <TouchableOpacity onPress={() => sets.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : !sets.data?.length ? (
        <View style={styles.emptyBox}>
          <Ionicons name="documents-outline" size={40} color={colors.border} />
          <Text style={styles.emptyText}>Nenhum simulado do banco publicado ainda. Enquanto isso, pratique questões avulsas.</Text>
        </View>
      ) : (
        sets.data.map((set) => (
          <TouchableOpacity key={set.id} style={styles.setCard} onPress={() => openSet(set)} activeOpacity={0.85}>
            <View style={styles.setTop}>
              <View style={styles.setLogo}>
                {set.exam_type?.logo_url ? (
                  <Image source={{ uri: set.exam_type.logo_url }} style={styles.setLogoImage} resizeMode="contain" />
                ) : (
                  <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setTitle} numberOfLines={2}>{set.title}</Text>
                <Text style={styles.setMeta}>
                  {set.questions_count} questão{set.questions_count !== 1 ? 'ões' : ''}
                  {set.exam_type ? ` · ${set.exam_type.label}` : ''}
                  {set.origin === 'pdf_import' ? ' · Prova importada' : ''}
                </Text>
              </View>
            </View>
            {set.description ? <Text style={styles.setDescription} numberOfLines={2}>{set.description}</Text> : null}
            <View style={styles.setFooter}>
              <Text style={styles.setResult}>
                {set.last_result ? `Melhor resultado: ${set.last_result.correct}/${set.last_result.total}` : 'Ainda não respondido'}
              </Text>
              <View style={styles.setAction}>
                <Text style={styles.setActionText}>
                  {set.open_attempt_id ? 'Continuar' : set.attempts_count ? 'Refazer' : 'Começar'}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.surface} />
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 10 },
    summaryCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, marginBottom: 4,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 22, fontWeight: '900', color: colors.surface },
    summaryLabel: { fontSize: 12, color: colors.surface, opacity: 0.85, marginTop: 2 },
    summarySep: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.3)' },
    shortcut: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    shortcutIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
    shortcutTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
    shortcutSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 14 },
    sectionHint: { fontSize: 12, color: colors.muted, marginTop: -4 },
    emptyBox: { alignItems: 'center', gap: 10, padding: 24, backgroundColor: colors.surface, borderRadius: 16 },
    emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
    retry: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
    retryText: { color: colors.surface, fontWeight: '700' },
    setCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
    setTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    setLogo: {
      width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    setLogoImage: { width: 34, height: 34 },
    setTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
    setMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    setDescription: { fontSize: 13, color: colors.text, lineHeight: 18 },
    setFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    setResult: { fontSize: 12, color: colors.muted, flexShrink: 1 },
    setAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    setActionText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  });
}
