import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import ConfirmModal from '../../../components/ConfirmModal';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useAnswerInAttempt, useFinishAttempt, usePracticeAttempt, useStartQuestionSet } from '../hooks';
import { PracticeQuestionView } from '../components/PracticeQuestionView';
import { formatPercent } from '../lib/format';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'BancoSimulado'>;

/**
 * Simulado do banco: o aluno marca as respostas no próprio ritmo (ficam salvas) e só vê a correção ao finalizar.
 * Sem cronômetro e sem nota oficial.
 */
export function BancoSimuladoScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [attemptId, setAttemptId] = useState<number | null>(route.params.attemptId ?? null);
  const start = useStartQuestionSet();
  const attempt = usePracticeAttempt(attemptId);
  const answer = useAnswerInAttempt(attemptId ?? 0);
  const finish = useFinishAttempt(attemptId ?? 0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attemptId == null && route.params.setId) {
      start.mutate(route.params.setId, {
        onSuccess: (payload) => setAttemptId(payload.attempt.id),
        onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível abrir o simulado.')),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inicia uma vez ao abrir
  }, []);

  const payload = attempt.data;
  const questions = payload?.questions ?? [];
  const finished = !!payload?.attempt.finished_at;

  useEffect(() => {
    if (!payload) return;
    navigation.setOptions({ title: payload.question_set?.title ?? route.params.title ?? 'Simulado do banco' });
    setAnswers(Object.fromEntries(
      payload.questions.filter((q) => q.selected_option_id != null).map((q) => [q.id, q.selected_option_id as number]),
    ));
  }, [payload, navigation, route.params.title]);

  const select = (questionId: number, optionId: number) => {
    const previous = answers[questionId];
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setError(null);
    answer.mutate({ questionId, optionId }, {
      onError: (cause) => {
        setAnswers((prev) => {
          const next = { ...prev };
          if (previous == null) delete next[questionId];
          else next[questionId] = previous;
          return next;
        });
        setError(getApiErrorMessage(cause, 'Não foi possível salvar a resposta. Tente de novo.'));
      },
    });
  };

  const doFinish = () => {
    setConfirmFinish(false);
    finish.mutate(undefined, {
      onSuccess: () => setIndex(0),
      onError: (cause) => setError(getApiErrorMessage(cause, 'Não foi possível finalizar o simulado.')),
    });
  };

  if ((attemptId == null && !error) || (attempt.isLoading && attemptId != null)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Abrindo simulado…</Text>
      </View>
    );
  }
  if (!payload) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={44} color={colors.border} />
        <Text style={styles.muted}>{error ?? getApiErrorMessage(attempt.error, 'Não foi possível carregar o simulado.')}</Text>
        {attemptId != null ? (
          <TouchableOpacity style={styles.primaryButton} onPress={() => attempt.refetch()}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const answeredCount = questions.filter((q) => answers[q.id] != null).length;
  const current = questions[Math.min(index, questions.length - 1)];
  const correct = payload.attempt.correct_count ?? 0;
  const total = payload.attempt.question_count || questions.length;

  return (
    <View style={styles.container}>
      {finished ? (
        <View style={styles.resultBar}>
          <Text style={styles.resultTitle}>{correct} de {total} acertos</Text>
          <Text style={styles.resultSub}>{formatPercent(total ? (correct / total) * 100 : null)} de aproveitamento · revise abaixo</Text>
        </View>
      ) : (
        <View style={styles.progressBar}>
          <Text style={styles.progressText}>{answeredCount} de {questions.length} respondidas</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }]} />
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dotsScroll} contentContainerStyle={styles.dots}>
        {questions.map((q, i) => {
          const done = answers[q.id] != null;
          const tone = finished ? (q.is_correct ? '#16A34A' : '#DC2626') : done ? colors.primary : colors.soft;
          return (
            <TouchableOpacity key={q.id} onPress={() => setIndex(i)} style={[styles.dot, { backgroundColor: tone }, i === index && styles.dotCurrent]}
              accessibilityLabel={`Questão ${i + 1}`}>
              <Text style={[styles.dotText, { color: finished || done ? colors.surface : colors.text }]}>{i + 1}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {current ? (
          <>
            <Text style={styles.questionNumber}>Questão {index + 1} de {questions.length}</Text>
            <PracticeQuestionView
              question={current}
              selectedId={answers[current.id] ?? null}
              onSelect={(optionId) => select(current.id, optionId)}
              feedback={finished ? { is_correct: current.is_correct ?? null, correct_option_id: current.correct_option_id ?? null, explanation: current.explanation ?? null } : null}
              disabled={finish.isPending}
            />
          </>
        ) : (
          <Text style={styles.muted}>Este simulado não tem questões disponíveis no momento.</Text>
        )}
        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <TouchableOpacity style={[styles.navButton, index === 0 && styles.buttonDisabled]} disabled={index === 0}
          onPress={() => setIndex((i) => i - 1)}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        {finished ? (
          <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Concluir revisão</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.primaryButton, { flex: 1 }, finish.isPending && styles.buttonDisabled]}
            disabled={finish.isPending} onPress={() => setConfirmFinish(true)}>
            {finish.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Finalizar e ver correção</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.navButton, index >= questions.length - 1 && styles.buttonDisabled]}
          disabled={index >= questions.length - 1} onPress={() => setIndex((i) => i + 1)}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={confirmFinish}
        title="Finalizar simulado?"
        message={answeredCount < questions.length
          ? `Você respondeu ${answeredCount} de ${questions.length}. As não respondidas contam como erro. Depois de finalizar, não dá para mudar as respostas.`
          : 'Depois de finalizar, não dá para mudar as respostas. Você verá a correção de cada questão.'}
        confirmLabel="Finalizar"
        onConfirm={doFinish}
        onCancel={() => setConfirmFinish(false)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.background },
    muted: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
    progressBar: { paddingHorizontal: 16, paddingTop: 12, gap: 6, backgroundColor: colors.surface },
    progressText: { fontSize: 12, color: colors.muted, fontWeight: '700' },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.soft, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: colors.primary },
    resultBar: { padding: 16, backgroundColor: colors.primary, gap: 2 },
    resultTitle: { fontSize: 20, fontWeight: '900', color: colors.surface },
    resultSub: { fontSize: 13, color: colors.surface, opacity: 0.9 },
    dotsScroll: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    dots: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dotCurrent: { borderWidth: 2, borderColor: colors.ink },
    dotText: { fontSize: 13, fontWeight: '800' },
    content: { padding: 16, paddingBottom: 32, gap: 8 },
    questionNumber: { fontSize: 13, fontWeight: '800', color: colors.primary },
    errorInline: { marginTop: 12, fontSize: 13, color: '#DC2626', textAlign: 'center' },
    footer: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12,
      backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    },
    navButton: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    primaryButtonText: { color: colors.surface, fontWeight: '800', fontSize: 15 },
    buttonDisabled: { opacity: 0.4 },
  });
}
