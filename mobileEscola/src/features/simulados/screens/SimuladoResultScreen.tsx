import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RichText from '../../../components/RichText';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import type { ReviewQuestion } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useAttemptResult } from '../hooks';
import { QuestionImage } from '../components/ReviewQuestionCard';
import {
  AnswerOption, BottomBar, Button, Card, EmptyState, Icon, IconButton, Notice, ProgressBar, QuestionNavigator, ScreenBody, Sheet,
  Tag, Txt, layout, radius, space, subjectColor, type, usePalette, type AnswerState,
} from '../../../ui';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoResult'>;
const LETTERS = 'ABCDEFGHIJ';

function sortedOptions(q: ReviewQuestion) {
  return q.options.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function isRightOption(q: ReviewQuestion, option: ReviewQuestion['options'][number]) {
  return option.is_correct === true || option.id === q.correction?.correct_option_id
    || (option.selected && q.correction?.is_correct === true && option.is_correct == null);
}

/** Correção (protótipo "TelaCorrecao"): uma questão por vez, com a resposta certa e a sua. */
export function SimuladoResultScreen({ route, navigation }: Props) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { attemptId } = route.params;
  const { data: resultado, isLoading, isError, error, refetch } = useAttemptResult(attemptId);
  const [atual, setAtual] = useState(0);
  const [mapaAberto, setMapaAberto] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const fechar = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('SimuladosList'));
  const top = (title: string, center?: React.ReactNode, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: insets.top + space[2], paddingHorizontal: space[2], paddingBottom: space[2] }}>
      <IconButton icon="x" label="Fechar correção" onPress={fechar} />
      {center ?? <Txt variant="title" numberOfLines={1} style={{ flex: 1, fontSize: 17 }}>{title}</Txt>}
      {right}
    </View>
  );

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={p.brand} /></View>;
  }
  if (isError || !resultado) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {top('Correção')}
        <ScreenBody gap={space[3]}>
          <Notice tone="danger" title="Não foi possível carregar a correção" text={isError ? getApiErrorMessage(error, 'Tente de novo em instantes.') : 'Resultado não encontrado.'} />
          <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
        </ScreenBody>
      </View>
    );
  }

  const questoes = resultado.questions ?? [];
  if (resultado.result_release_pending || !questoes.length) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {top(resultado.exam?.title ?? 'Correção')}
        <ScreenBody gap={space[3]}>
          {resultado.result_release_pending
            ? <Notice tone="info" icon="key" title="Correção bloqueada" text="O gabarito aparece depois do prazo final do simulado." />
            : <EmptyState icon="clipboard" title="Correção indisponível" text="A correção aparece aqui quando a escola liberar." />}
        </ScreenBody>
      </View>
    );
  }

  const q = questoes[Math.min(atual, questoes.length - 1)];
  const pendente = q.correction === null || q.correction.is_correct === null;
  const certa = q.correction?.is_correct === true;
  const opcoes = sortedOptions(q);
  const letraCerta = opcoes.findIndex((o) => isRightOption(q, o));
  const ultima = atual >= questoes.length - 1;
  const right = questoes.map((x, i) => (x.correction?.is_correct === true ? i + 1 : 0)).filter(Boolean);
  const wrong = questoes.map((x, i) => (x.correction?.is_correct === false ? i + 1 : 0)).filter(Boolean);
  const answered = !!q.student_answer && (!!q.student_answer.option_id || !!q.student_answer.text_answer);

  const stateFor = (option: ReviewQuestion['options'][number]): AnswerState => {
    if (pendente) return option.selected ? 'selected' : 'dimmed';
    const ok = isRightOption(q, option);
    if (option.selected && ok) return 'correct';
    if (option.selected) return 'incorrect';
    if (ok) return 'missed';
    return 'dimmed';
  };

  const irPara = (i: number) => {
    setAtual(Math.max(0, Math.min(questoes.length - 1, i)));
    (scrollRef.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void })?.scrollTo?.({ y: 0, animated: false });
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {top('Correção',
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.bodySm, { color: p.inkSubtle, textAlign: 'center' }]}>
            <Text style={{ color: p.ink, fontFamily: type.button.fontFamily }}>Questão {atual + 1}</Text> de {questoes.length}
          </Text>
          <ProgressBar value={atual + 1} max={questoes.length} size="sm" label="Progresso da correção" />
        </View>,
        <IconButton icon="grid" label="Resumo e mapa das questões" onPress={() => setMapaAberto(true)} />)}

      <ScrollView ref={scrollRef}>
        <ScreenBody gap={18} style={{ paddingTop: space[3], width: '100%', maxWidth: layout.readingMax, alignSelf: 'center' }}>
          {pendente ? (
            <Notice tone="warning" icon="clock" title="Em correção" text="O professor ainda vai corrigir esta questão." />
          ) : (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: certa ? p.successSoft : p.dangerSoft }}>
              <Icon name={certa ? 'circle-check' : 'alert'} size={22} color={certa ? p.success : p.dangerInk} />
              <View style={{ flex: 1 }}>
                <Txt variant="titleSm" style={{ fontSize: 15, lineHeight: 20, color: certa ? p.success : p.dangerInk }}>{certa ? 'Resposta correta' : answered ? 'Resposta incorreta' : 'Sem resposta'}</Txt>
                {!certa && letraCerta >= 0 ? <Txt variant="bodySm" tone="muted">A alternativa correta é a {LETTERS[letraCerta]}.</Txt> : null}
                {certa && q.correction ? <Txt variant="bodySm" tone="muted">{q.correction.points_earned} de {q.correction.max_points} pontos</Txt> : null}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {q.subject ? <Tag tone="outline" dot={subjectColor(p, q.subject.id)} label={q.subject.name} /> : null}
            <Tag label={q.type === 'essay' ? 'Discursiva' : 'Objetiva'} />
          </View>
          <Txt variant="reading"><RichText value={q.question_text} /></Txt>
          {q.image_url ? <QuestionImage uri={q.image_url} maxWidth={Math.max(0, Math.min(width, layout.readingMax) - space[4] * 2)} /> : null}

          {q.type === 'multiple_choice' ? (
            <View style={{ gap: 10 }}>
              {opcoes.map((op, i) => (
                <AnswerOption key={op.id} letter={LETTERS[i] ?? String(i + 1)} state={stateFor(op)} note={pendente && op.selected ? 'Sua resposta' : undefined}>
                  <Txt><RichText value={op.option_text} /></Txt>
                </AnswerOption>
              ))}
              {!answered ? <Txt variant="bodySm" tone="subtle">Você não marcou nenhuma alternativa.</Txt> : null}
            </View>
          ) : (
            <Card style={{ gap: 4 }}>
              <Txt variant="caption" tone="subtle">Sua resposta</Txt>
              <Txt>{q.student_answer?.text_answer?.trim() ? q.student_answer.text_answer : 'Você não respondeu esta questão.'}</Txt>
            </Card>
          )}
          {q.type === 'multiple_choice' && q.student_answer?.text_answer ? (
            <Card style={{ gap: 4 }}>
              <Txt variant="caption" tone="subtle">Texto enviado</Txt>
              <Txt>{q.student_answer.text_answer}</Txt>
            </Card>
          ) : null}
        </ScreenBody>
      </ScrollView>

      <BottomBar>
        <Button variant="secondary" icon="chevron-left" label="Anterior" disabled={atual === 0} onPress={() => irPara(atual - 1)} />
        {ultima ? (
          <Button block size="lg" cta icon="check" label="Concluir correção" onPress={() => navigation.navigate('SimuladosList')} />
        ) : (
          <Button block size="lg" cta iconRight="arrow-right" label="Próxima questão" onPress={() => irPara(atual + 1)} />
        )}
      </BottomBar>

      <Sheet visible={mapaAberto} title="Resumo da correção" onClose={() => setMapaAberto(false)}>
        <View style={{ gap: space[4] }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken }}>
              <Txt variant="bodySm" tone="muted">Aproveitamento</Txt>
              <Txt variant="title" style={{ fontSize: 22, lineHeight: 28 }}>{resultado.percentage != null ? `${resultado.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</Txt>
            </View>
            <View style={{ flex: 1, padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken }}>
              <Txt variant="bodySm" tone="muted">Acertos</Txt>
              <Txt variant="title" style={{ fontSize: 22, lineHeight: 28 }}>{right.length} de {questoes.length}</Txt>
            </View>
          </View>
          <QuestionNavigator total={questoes.length} current={atual + 1} right={right} wrong={wrong} legend={false}
            onSelect={(n) => { irPara(n - 1); setMapaAberto(false); }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
            <Tag tone="success" icon="check" label={`${right.length} certas`} />
            <Tag tone="danger" icon="x" label={`${wrong.length} erradas`} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
