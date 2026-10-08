import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import RichText from '../../../components/RichText';
import type { ReviewQuestion } from '../../../services/simulados.service';
import { AnswerOption, Card, Tag, Txt, radius, space, usePalette, type AnswerState, type TagTone, type IconName } from '../../../ui';

const LETTERS = 'ABCDEFGHIJ';

export function QuestionImage({ uri, maxWidth }: { uri: string; maxWidth: number }) {
  const [height, setHeight] = useState(180);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    Image.getSize(uri, (w, h) => { if (w > 0 && maxWidth > 0) setHeight((maxWidth * h) / w); }, () => setError(true));
  }, [uri, maxWidth]);
  if (error) return null;
  return (
    <Image source={{ uri }} resizeMode="contain" onError={() => setError(true)} accessibilityLabel="Imagem da questão"
      style={{ width: '100%', height, borderRadius: radius.md }} />
  );
}

/**
 * Questão corrigida (protótipo "TelaCorrecao"): marcada certa (correct), marcada errada (incorrect),
 * a certa não marcada (missed, tracejada) e as demais esmaecidas. Sem resultado liberado, mostra só a marcada.
 */
export function ReviewQuestionCard({
  question, index, awaitingRelease, imageWidth,
}: { question: ReviewQuestion; index: number; awaitingRelease: boolean; imageWidth: number }) {
  const p = usePalette();
  const correction = question.correction;
  const pending = !awaitingRelease && (correction === null || correction.is_correct === null);
  const released = !awaitingRelease && !pending;
  const status: { label: string; tone: TagTone; icon: IconName } | null = pending
    ? { label: 'Em correção', tone: 'warning', icon: 'clock' }
    : awaitingRelease
      ? { label: 'Resultado bloqueado', tone: 'info', icon: 'key' }
      : correction?.is_correct
        ? { label: 'Correta', tone: 'success', icon: 'check' }
        : { label: 'Incorreta', tone: 'danger', icon: 'x' };
  const answered = !!question.student_answer && (!!question.student_answer.option_id || !!question.student_answer.text_answer);

  const stateFor = (option: ReviewQuestion['options'][number]): AnswerState => {
    const selected = option.selected;
    if (!released) return selected ? 'selected' : 'dimmed';
    const isRight = option.is_correct === true || option.id === correction?.correct_option_id
      || (selected && correction?.is_correct === true && option.is_correct == null);
    if (selected && isRight) return 'correct';
    if (selected) return 'incorrect';
    if (isRight) return 'missed';
    return 'dimmed';
  };

  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Txt variant="titleSm">Questão {index + 1}</Txt>
        {status ? <Tag tone={status.tone} icon={status.icon} label={status.label} /> : null}
      </View>
      <Txt variant="reading"><RichText value={question.question_text} /></Txt>
      {question.image_url ? <QuestionImage uri={question.image_url} maxWidth={imageWidth} /> : null}
      {question.type === 'multiple_choice' ? (
        <View style={{ gap: 10 }}>
          {question.options.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((option, i) => (
            <AnswerOption key={option.id} letter={LETTERS[i] ?? String(i + 1)} state={stateFor(option)}
              note={!released && option.selected ? 'Sua resposta' : undefined}>
              <Txt><RichText value={option.option_text} /></Txt>
            </AnswerOption>
          ))}
          {question.student_answer?.text_answer ? (
            <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken }}>
              <Txt variant="caption" tone="subtle">Texto enviado</Txt>
              <Txt>{question.student_answer.text_answer}</Txt>
            </View>
          ) : null}
          {!answered ? <Txt variant="bodySm" tone="subtle">Você não marcou nenhuma alternativa.</Txt> : null}
        </View>
      ) : (
        <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken, gap: 2 }}>
          <Txt variant="caption" tone="subtle">Sua resposta</Txt>
          <Txt>{question.student_answer?.text_answer?.trim() ? question.student_answer.text_answer : 'Você não respondeu esta questão.'}</Txt>
        </View>
      )}
    </Card>
  );
}
