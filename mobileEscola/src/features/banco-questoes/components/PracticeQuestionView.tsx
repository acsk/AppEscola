import React from 'react';
import { Image, View } from 'react-native';
import { QuestionShield } from '../../../components/QuestionShield';
import RichText from '../../../components/RichText';
import type { PracticeFeedback, PracticeQuestion } from '../../../services/practice.service';
import { AnswerOption, Card, Icon, IconButton, NewPill, Tag, Txt, radius, space, subjectColor, usePalette, type AnswerState } from '../../../ui';

const LETTERS = 'ABCDEFGHIJ';

function formatReviewWhen(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type Props = {
  question: PracticeQuestion;
  selectedId: number | null;
  onSelect?: (optionId: number) => void;
  /** Com correção: alternativas travadas, a certa em verde e a marcada errada em vermelho. */
  feedback?: PracticeFeedback | null;
  disabled?: boolean;
  /** Questão nova para o aluno: pílula azul "Nova". */
  isNew?: boolean;
  /** Praticar no desktop: alternativas riscadas, letra maior, ampliar imagem; cabeçalho e comentário ficam fora. */
  eliminated?: number[];
  onEliminate?: (optionId: number) => void;
  textScale?: number;
  onZoomImage?: (uri: string) => void;
  hideHeader?: boolean;
  hideExplanation?: boolean;
};

/** Questão do banco (protótipos "TelaResponderQuestao" / "TelaCorrecao"). */
export function PracticeQuestionView({
  question, selectedId, onSelect, feedback, disabled, isNew, eliminated = [], onEliminate, textScale = 1, onZoomImage, hideHeader, hideExplanation,
}: Props) {
  const p = usePalette();
  const locked = disabled || !!feedback;
  const correctIndex = feedback ? question.options.findIndex((o) => o.id === feedback.correct_option_id) : -1;
  const examName = question.exam_title || question.source_exam_name;

  const stateFor = (optionId: number): AnswerState => {
    const selected = optionId === selectedId;
    if (!feedback) return selected ? 'selected' : 'default';
    const isRight = optionId === feedback.correct_option_id;
    if (selected && isRight) return 'correct';
    if (selected) return 'incorrect';
    if (isRight) return 'missed';
    return 'dimmed';
  };

  return (
    <QuestionShield style={{ gap: 18 }}>
      {feedback && feedback.is_correct !== null ? (
        <View accessibilityRole="alert" style={{
          flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.md,
          backgroundColor: feedback.is_correct ? p.successSoft : p.dangerSoft,
        }}>
          <Icon name={feedback.is_correct ? 'circle-check' : 'alert'} size={22} color={feedback.is_correct ? p.success : p.dangerInk} />
          <View style={{ flex: 1 }}>
            <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20, color: feedback.is_correct ? p.success : p.dangerInk }}>
              {feedback.is_correct ? 'Resposta correta' : 'Resposta incorreta'}
            </Txt>
            {!feedback.is_correct && correctIndex >= 0 ? <Txt variant="bodySm" tone="muted">A alternativa correta é a {LETTERS[correctIndex]}.</Txt> : null}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space[2] }}>
        {hideHeader ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="clipboard" size={14} color={p.inkSubtle} />
          <Txt variant="caption" tone="subtle" style={{ flexShrink: 1 }} numberOfLines={2}>
            Questão #{question.id}{examName ? ` · ${examName}` : ''}
          </Txt>
        </View>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {question.subject ? <Tag tone="outline" dot={subjectColor(p, question.subject.id)} label={question.subject.name} /> : null}
          {question.topics.slice(0, 2).map((t) => <Tag key={t} label={t} />)}
          {question.difficulty ? <Tag label={question.difficulty} /> : null}
          {isNew ? <NewPill label="Nova" /> : null}
        </View>
      </View>

      {question.question_text ? <Txt variant="reading" style={textScale !== 1 ? { fontSize: 17 * textScale, lineHeight: 27 * textScale } : undefined}><RichText value={question.question_text} /></Txt> : null}
      {question.image_url ? (
        <View style={{ position: 'relative', alignSelf: 'stretch', backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.md, padding: space[2] }}>
          <View pointerEvents="none">
            <Image source={{ uri: question.image_url }} resizeMode="contain" accessibilityLabel="Imagem do enunciado"
              style={{ width: '100%', height: 220 * Math.min(textScale, 1.3), borderRadius: radius.sm }} />
          </View>
          {onZoomImage ? (
            <View style={{ position: 'absolute', top: 8, right: 8 }}>
              <IconButton icon="zoom" label="Ampliar imagem" variant="outline" onPress={() => onZoomImage(question.image_url as string)} />
            </View>
          ) : null}
        </View>
      ) : null}

      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        {question.options.map((option, index) => (
          <AnswerOption key={option.id} letter={LETTERS[index] ?? String(index + 1)} state={stateFor(option.id)}
            eliminated={eliminated.includes(option.id)} onEliminate={!locked && onEliminate ? () => onEliminate(option.id) : undefined}
            onPress={locked ? undefined : () => onSelect?.(option.id)}>
            <Txt style={[
              textScale !== 1 ? { fontSize: 15 * textScale, lineHeight: 22 * textScale } : null,
              eliminated.includes(option.id) && !feedback ? { textDecorationLine: 'line-through', color: p.inkSubtle } : null,
            ]}><RichText value={option.option_text} /></Txt>
          </AnswerOption>
        ))}
      </View>

      {question.reviews && question.reviews.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20 }}>Histórico de revisão</Txt>
          {question.reviews.map((review, index) => (
            <View key={`${review.reviewed_at ?? 'revisao'}-${index}`} style={{ gap: 2 }}>
              <Txt variant="bodySm" tone="muted">
                {`Revisada em ${formatReviewWhen(review.reviewed_at)} por ${review.reviewer_name}.`}
              </Txt>
              <Txt variant="bodySm" tone="subtle">
                {review.had_error ? 'Havia erro e a questão foi corrigida.' : 'Não havia erro.'}
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      {feedback?.explanation && !hideExplanation ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="message" size={18} color={p.ink} />
            <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20 }}>Comentário do professor</Txt>
          </View>
          <Txt tone="muted" style={{ lineHeight: 23 }}><RichText value={feedback.explanation} /></Txt>
        </Card>
      ) : null}
    </QuestionShield>
  );
}
