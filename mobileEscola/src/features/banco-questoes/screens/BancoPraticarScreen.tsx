import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { QuestoesStackParamList } from '../../../navigation/stacks/QuestoesStack';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { getApiErrorMessage } from '../../../lib/apiError';
import { fetchNextPracticeQuestion, type PracticeFeedback, type PracticeQuestion } from '../../../services/practice.service';
import { useAnswerPracticeQuestion, usePracticeFilters } from '../hooks';
import { PracticeQuestionView } from '../components/PracticeQuestionView';

type Props = NativeStackScreenProps<QuestoesStackParamList, 'BancoPraticar'>;

/** Prática avulsa: uma questão por vez, filtrada por disciplina/assunto, com correção logo após responder. */
export function BancoPraticarScreen({ route }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const filters = usePracticeFilters();
  const answer = useAnswerPracticeQuestion();
  const [subjectId, setSubjectId] = useState<number | null>(route.params?.subjectId ?? null);
  const [topicId, setTopicId] = useState<number | null>(route.params?.topicId ?? null);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState({ answered: 0, correct: 0 });

  const subject = filters.data?.subjects.find((s) => s.id === subjectId) ?? null;

  const loadNext = useCallback(async (excludeId: number | null = null) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setFeedback(null);
    try {
      setQuestion(await fetchNextPracticeQuestion({ subject_id: subjectId, topic_id: topicId, exclude_id: excludeId }));
    } catch (cause) {
      setQuestion(null);
      setError(getApiErrorMessage(cause, 'Não foi possível carregar a questão.'));
    } finally {
      setLoading(false);
    }
  }, [subjectId, topicId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const submit = () => {
    if (!question || selected == null) return;
    answer.mutate(
      { questionId: question.id, optionId: selected },
      {
        onSuccess: (result) => {
          setFeedback(result);
          setSession((prev) => ({ answered: prev.answered + 1, correct: prev.correct + (result.is_correct ? 1 : 0) }));
        },
        onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível enviar a resposta.')),
      },
    );
  };

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <TouchableOpacity key={key} onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.85}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chip(`Todas (${filters.data?.total ?? 0})`, subjectId == null, () => { setSubjectId(null); setTopicId(null); }, 'all')}
          {filters.data?.subjects.map((s) =>
            chip(`${s.name} (${s.total})`, s.id === subjectId, () => { setSubjectId(s.id); setTopicId(null); }, `s-${s.id}`),
          )}
        </ScrollView>
        {subject && subject.topics.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {chip('Todos os assuntos', topicId == null, () => setTopicId(null), 'all-topics')}
            {subject.topics.map((t) => chip(`${t.name} (${t.total})`, t.id === topicId, () => setTopicId(t.id), `t-${t.id}`))}
          </ScrollView>
        ) : null}
        <Text style={styles.session}>
          Nesta sessão: {session.answered} respondida{session.answered !== 1 ? 's' : ''} · {session.correct} acerto{session.correct !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : error && !question ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => loadNext()}>
              <Text style={styles.primaryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : !question ? (
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>Nenhuma questão disponível com esses filtros. Escolha outra disciplina ou assunto.</Text>
          </View>
        ) : (
          <PracticeQuestionView question={question} selectedId={selected} onSelect={setSelected} feedback={feedback}
            disabled={answer.isPending} />
        )}
        {error && question ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>

      {question && !loading ? (
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          {feedback ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => loadNext(question.id)} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Próxima questão</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, (selected == null || answer.isPending) && styles.buttonDisabled]}
              disabled={selected == null || answer.isPending}
              onPress={submit}
              activeOpacity={0.85}
            >
              {answer.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Responder</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    filters: { paddingTop: 10, paddingBottom: 6, gap: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    chipRow: { paddingHorizontal: 16, gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.soft, maxWidth: 240 },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
    chipTextActive: { color: colors.surface },
    session: { fontSize: 12, color: colors.muted, paddingHorizontal: 16 },
    content: { padding: 16, paddingBottom: 32 },
    emptyBox: { alignItems: 'center', gap: 12, padding: 24, marginTop: 24 },
    emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
    errorInline: { marginTop: 12, fontSize: 13, color: '#DC2626', textAlign: 'center' },
    footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    primaryButtonText: { color: colors.surface, fontWeight: '800', fontSize: 15 },
    buttonDisabled: { opacity: 0.5 },
  });
}
