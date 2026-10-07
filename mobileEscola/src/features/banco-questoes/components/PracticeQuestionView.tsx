import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RichText from '../../../components/RichText';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import type { PracticeFeedback, PracticeQuestion } from '../../../services/practice.service';

const LETTERS = 'ABCDEFGHIJ';
const CORRECT = '#16A34A';
const WRONG = '#DC2626';

type Props = {
  question: PracticeQuestion;
  selectedId: number | null;
  onSelect?: (optionId: number) => void;
  /** Com correção: alternativas travadas, certa em verde e a marcada errada em vermelho. */
  feedback?: PracticeFeedback | null;
  disabled?: boolean;
};

export function PracticeQuestionView({ question, selectedId, onSelect, feedback, disabled }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const locked = disabled || !!feedback;
  const meta = [question.subject?.name, question.topics.join(', '), question.source_exam_name].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {question.question_text ? <RichText style={styles.statement} value={question.question_text} /> : null}
      {question.image_url ? (
        <Image source={{ uri: question.image_url }} style={styles.image} resizeMode="contain" accessibilityLabel="Imagem do enunciado" />
      ) : null}

      <View style={styles.options}>
        {question.options.map((option, index) => {
          const selected = option.id === selectedId;
          const isCorrect = !!feedback && option.id === feedback.correct_option_id;
          const isWrong = !!feedback && selected && !isCorrect;
          const accent = isCorrect ? CORRECT : isWrong ? WRONG : selected ? colors.primary : colors.border;
          return (
            <TouchableOpacity
              key={option.id}
              disabled={locked}
              onPress={() => onSelect?.(option.id)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: locked }}
              style={[
                styles.option,
                { borderColor: accent, backgroundColor: isCorrect ? '#F0FDF4' : isWrong ? '#FEF2F2' : selected ? colors.soft : colors.surface },
              ]}
            >
              <View style={[styles.letter, { backgroundColor: selected || isCorrect ? accent : colors.soft }]}>
                <Text style={[styles.letterText, { color: selected || isCorrect ? colors.surface : colors.text }]}>
                  {LETTERS[index] ?? index + 1}
                </Text>
              </View>
              <RichText style={styles.optionText} value={option.option_text} />
              {isCorrect ? <Ionicons name="checkmark-circle" size={20} color={CORRECT} /> : null}
              {isWrong ? <Ionicons name="close-circle" size={20} color={WRONG} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {feedback ? (
        <View style={[styles.feedback, { borderColor: feedback.is_correct ? CORRECT : feedback.is_correct === false ? WRONG : colors.border }]}>
          <Text style={[styles.feedbackTitle, { color: feedback.is_correct ? CORRECT : feedback.is_correct === false ? WRONG : colors.muted }]}>
            {feedback.is_correct ? 'Resposta correta!' : feedback.is_correct === false ? 'Resposta incorreta' : 'Não respondida'}
          </Text>
          {feedback.explanation ? <RichText style={styles.explanation} value={feedback.explanation} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    meta: { fontSize: 12, color: colors.muted, fontWeight: '600' },
    statement: { fontSize: 16, lineHeight: 24, color: colors.ink },
    image: { width: '100%', height: 240, borderRadius: 12, backgroundColor: colors.surface },
    options: { gap: 10 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    letter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    letterText: { fontSize: 13, fontWeight: '800' },
    optionText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink },
    feedback: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 6, backgroundColor: colors.surface },
    feedbackTitle: { fontSize: 15, fontWeight: '800' },
    explanation: { fontSize: 14, lineHeight: 21, color: colors.text },
  });
}
