import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  detalharSimulado,
  enviarResposta,
  finalizarSimulado,
  SimuladoDetail,
  Question,
  AttemptFinish,
} from '../../../services/simulados.service';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoExam'>;

type Fase = 'carregando' | 'realizando' | 'finalizando' | 'resultado' | 'erro';

interface Resposta {
  optionId?: number;
  textAnswer?: string;
}

// ── Questão individual ────────────────────────────────────────────────────────

function ItemQuestao({
  questao,
  numero,
  resposta,
  onChange,
}: {
  questao: Question;
  numero: number;
  resposta: Resposta;
  onChange: (r: Resposta) => void;
}) {
  const opcaoSelecionada = questao.options.find((o) => o.id === resposta.optionId);
  const exibirTexto =
    questao.type === 'essay' ||
    opcaoSelecionada?.triggers_text_input ||
    (questao.allow_text_answer && resposta.optionId !== undefined);

  return (
    <View style={qStyles.container}>
      <View style={qStyles.header}>
        <View style={qStyles.headerEsq}>
          <View style={qStyles.numeroBadge}>
            <Text style={qStyles.numeroTexto}>{numero}</Text>
          </View>
          {questao.subject && (
            <View style={qStyles.subjectPill}>
              <Text style={qStyles.subjectTexto}>{questao.subject.name}</Text>
            </View>
          )}
          <View style={qStyles.tipoPill}>
            <Text style={qStyles.tipoTexto}>
              {questao.type === 'essay' ? 'Discursiva' : 'Objetiva'}
            </Text>
          </View>
        </View>
        <View style={qStyles.pontos}>
          <Text style={qStyles.pontosTexto}>{questao.points} pt{questao.points !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      <Text style={qStyles.enunciado}>{questao.question_text}</Text>

      {questao.type === 'multiple_choice' && questao.options.map((op) => {
        const selecionada = resposta.optionId === op.id;
        return (
          <TouchableOpacity
            key={op.id}
            style={[qStyles.opcao, selecionada && qStyles.opcaoSelecionada]}
            onPress={() => onChange({ ...resposta, optionId: op.id })}
            activeOpacity={0.75}
          >
            <View style={[qStyles.radio, selecionada && qStyles.radioSelecionado]}>
              {selecionada && <View style={qStyles.radioPonto} />}
            </View>
            <Text style={[qStyles.opcaoTexto, selecionada && qStyles.opcaoTextoSelecionado]}>
              {op.option_text}
            </Text>
          </TouchableOpacity>
        );
      })}

      {exibirTexto && (
        <TextInput
          style={qStyles.textInput}
          placeholder={
            questao.type === 'essay'
              ? 'Digite sua resposta…'
              : opcaoSelecionada?.triggers_text_input
              ? 'Especifique sua resposta…'
              : 'Justifique sua resposta…'
          }
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={resposta.textAnswer ?? ''}
          onChangeText={(v) => onChange({ ...resposta, textAnswer: v })}
        />
      )}
    </View>
  );
}

const qStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerEsq:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  numeroBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center',
  },
  numeroTexto:  { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  subjectPill:  { backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  subjectTexto: { fontSize: 11, fontWeight: '600', color: '#059669' },
  tipoPill:     { backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tipoTexto:    { fontSize: 11, color: '#9CA3AF' },
  pontos:       { backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  pontosTexto:  { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  enunciado:    { fontSize: 15, color: '#111827', lineHeight: 22, marginBottom: 14 },
  opcao: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    marginBottom: 8, gap: 10,
  },
  opcaoSelecionada:      { borderColor: '#7C3AED', backgroundColor: '#FAF5FF' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  radioSelecionado:      { borderColor: '#7C3AED' },
  radioPonto:            { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },
  opcaoTexto:            { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  opcaoTextoSelecionado: { color: '#7C3AED', fontWeight: '500' },
  textInput: {
    marginTop: 10, backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111827', minHeight: 100,
  },
});

// ── Tela principal ────────────────────────────────────────────────────────────

export function SimuladoExamScreen({ route, navigation }: Props) {
  const { examId, attemptId } = route.params;

  const [fase, setFase]           = useState<Fase>('carregando');
  const [detalhe, setDetalhe]     = useState<SimuladoDetail | null>(null);
  const [respostas, setRespostas] = useState<Record<number, Resposta>>({});
  const [resultado, setResultado] = useState<AttemptFinish | null>(null);
  const [erroMsg, setErroMsg]     = useState<string>('');
  const scrollRef                 = useRef<ScrollView>(null);

  // Botão voltar customizado: garante que sempre há botão, mesmo via deep link
  useEffect(() => {
    function handleVoltar() {
      if (fase === 'realizando' || fase === 'finalizando') {
        Alert.alert(
          'Sair do simulado?',
          'Suas respostas ainda não foram enviadas e serão perdidas.',
          [
            { text: 'Continuar respondendo', style: 'cancel' },
            {
              text: 'Sair', style: 'destructive',
              onPress: () => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('SimuladoDetalhe', { examId });
                }
              },
            },
          ],
        );
      } else {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('SimuladoDetalhe', { examId });
        }
      }
    }

    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleVoltar} style={{ paddingRight: 8 }}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, fase, examId]);

  // Confirmação ao sair durante o exame (gesto de swipe / botão físico)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (fase === 'resultado' || fase === 'carregando' || fase === 'erro') return;
      e.preventDefault();
      Alert.alert(
        'Sair do simulado?',
        'Suas respostas ainda não foram enviadas e serão perdidas.',
        [
          { text: 'Continuar respondendo', style: 'cancel' },
          { text: 'Sair', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, fase]);

  useEffect(() => { carregarQuestoes(); }, [examId]);

  async function carregarQuestoes() {
    setFase('carregando');
    try {
      const d = await detalharSimulado(examId);
      setDetalhe(d);
      navigation.setOptions({ title: d.title });
      setFase('realizando');
    } catch (e: any) {
      setErroMsg(e?.response?.data?.message ?? 'Não foi possível carregar as questões.');
      setFase('erro');
    }
  }

  async function handleFinalizar() {
    if (!detalhe) return;
    setFase('finalizando');
    try {
      for (const questao of detalhe.questions) {
        const resp = respostas[questao.id];
        if (!resp) continue;
        if (questao.type === 'essay') {
          if (resp.textAnswer?.trim()) {
            await enviarResposta(attemptId, questao.id, undefined, resp.textAnswer);
          }
        } else {
          if (resp.optionId !== undefined) {
            await enviarResposta(attemptId, questao.id, resp.optionId, resp.textAnswer);
          }
        }
      }
      const res = await finalizarSimulado(attemptId);
      setResultado(res);
      setFase('resultado');
    } catch (e: any) {
      setErroMsg(e?.response?.data?.message ?? 'Erro ao finalizar. Tente novamente.');
      setFase('realizando');
    }
  }

  function setResposta(questionId: number, resp: Resposta) {
    setRespostas((prev) => ({ ...prev, [questionId]: resp }));
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (fase === 'carregando') {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.carregandoTexto}>Carregando questões…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (fase === 'erro') {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
        <Text style={styles.erroTexto}>{erroMsg}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={carregarQuestoes} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Resultado ───────────────────────────────────────────────────────────────
  if (fase === 'resultado' && resultado) {
    const aprovado = resultado.passed;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.resultadoCard, { borderTopColor: aprovado ? '#10B981' : '#EF4444' }]}>
          <View style={[styles.resultadoIconCircle, { backgroundColor: aprovado ? '#ECFDF5' : '#FEF2F2' }]}>
            <Ionicons
              name={aprovado ? 'checkmark-circle' : 'close-circle'}
              size={64}
              color={aprovado ? '#10B981' : '#EF4444'}
            />
          </View>
          <Text style={styles.resultadoTitulo}>{aprovado ? 'Parabéns!' : 'Não foi desta vez'}</Text>
          <Text style={styles.resultadoSub}>
            {aprovado
              ? 'Você atingiu a pontuação mínima e foi aprovado.'
              : `Você não atingiu a pontuação mínima de ${detalhe?.passing_score ?? 0}%.`}
          </Text>

          <View style={styles.resultadoNumeros}>
            <View style={styles.resultadoItem}>
              <Text style={styles.resultadoValor}>{resultado.percentage.toFixed(1)}%</Text>
              <Text style={styles.resultadoLabel}>Aproveitamento</Text>
            </View>
            <View style={styles.resultadoDivisor} />
            <View style={styles.resultadoItem}>
              <Text style={styles.resultadoValor}>{resultado.score}</Text>
              <Text style={styles.resultadoLabel}>Pontos obtidos</Text>
            </View>
            <View style={styles.resultadoDivisor} />
            <View style={styles.resultadoItem}>
              <Text style={styles.resultadoValor}>{resultado.max_score}</Text>
              <Text style={styles.resultadoLabel}>Pontos totais</Text>
            </View>
          </View>

          {detalhe?.questions.some((q) => q.type === 'essay') && (
            <View style={styles.avisoDiscursiva}>
              <Ionicons name="information-circle-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={styles.avisoDiscursivaTexto}>
                Questões discursivas aguardam correção manual. A nota pode ser atualizada.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.botaoVoltar}
            onPress={() => navigation.navigate('SimuladosList')}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
            <Text style={styles.botaoVoltarTexto}>Ver todos os simulados</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Realizando / Finalizando ────────────────────────────────────────────────
  if ((fase === 'realizando' || fase === 'finalizando') && detalhe) {
    const respondidas = detalhe.questions.filter((q) => {
      const r = respostas[q.id];
      if (!r) return false;
      if (q.type === 'essay') return !!r.textAnswer?.trim();
      return r.optionId !== undefined;
    }).length;
    const total = detalhe.questions.length;
    const pct   = total > 0 ? (respondidas / total) * 100 : 0;

    return (
      <View style={styles.examContainer}>
        <View style={styles.progressoContainer}>
          <View style={styles.progressoTexto}>
            <Text style={styles.progressoLabel}>{respondidas} de {total} respondidas</Text>
            <Text style={styles.progressoPct}>{Math.round(pct)}%</Text>
          </View>
          <View style={styles.progressoBar}>
            <View style={[styles.progressoFill, { width: `${pct}%` as any }]} />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.questoesScroll}
          contentContainerStyle={styles.questoesContent}
          showsVerticalScrollIndicator={false}
        >
          {detalhe.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((q, i) => (
              <ItemQuestao
                key={q.id}
                questao={q}
                numero={i + 1}
                resposta={respostas[q.id] ?? {}}
                onChange={(r) => setResposta(q.id, r)}
              />
            ))}

          {erroMsg ? (
            <View style={[styles.erroInline, { marginBottom: 12 }]}>
              <Ionicons name="alert-circle-outline" size={15} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.erroInlineTexto}>{erroMsg}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.botaoFinalizar, fase === 'finalizando' && styles.botaoDisabled]}
            onPress={handleFinalizar}
            disabled={fase === 'finalizando'}
            activeOpacity={0.8}
          >
            {fase === 'finalizando'
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="checkmark-done" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.botaoFinalizarTexto}>Finalizar simulado</Text>
                </>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content:   { padding: 16 },

  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: '#F3F4F6',
  },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  erroTexto: {
    fontSize: 14, color: '#374151', textAlign: 'center',
    marginTop: 12, lineHeight: 20,
  },
  botaoTentar: {
    marginTop: 20, backgroundColor: '#4F46E5',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
  },
  botaoTentarTexto: { color: '#fff', fontWeight: '600', fontSize: 15 },

  erroInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12,
  },
  erroInlineTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },

  examContainer:      { flex: 1, backgroundColor: '#F3F4F6' },
  progressoContainer: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  progressoTexto: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressoLabel: { fontSize: 13, color: '#6B7280' },
  progressoPct:   { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  progressoBar:   { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  progressoFill:  { height: '100%', backgroundColor: '#4F46E5', borderRadius: 3 },
  questoesScroll: { flex: 1 },
  questoesContent:{ padding: 16 },

  botaoFinalizar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981', borderRadius: 14,
    paddingVertical: 14, marginTop: 8, marginBottom: 16,
  },
  botaoFinalizarTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  botaoDisabled:       { opacity: 0.6 },

  resultadoCard: {
    backgroundColor: '#fff', borderRadius: 20,
    borderTopWidth: 6, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  resultadoIconCircle: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  resultadoTitulo: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 8 },
  resultadoSub:    {
    fontSize: 14, color: '#6B7280', textAlign: 'center',
    lineHeight: 20, marginBottom: 24,
  },
  resultadoNumeros: {
    flexDirection: 'row', width: '100%',
    backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  resultadoItem:    { flex: 1, alignItems: 'center' },
  resultadoValor:   { fontSize: 22, fontWeight: '800', color: '#111827' },
  resultadoLabel:   { fontSize: 11, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },
  resultadoDivisor: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  avisoDiscursiva:  {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  avisoDiscursivaTexto: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 16 },
  botaoVoltar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#4F46E5', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 4,
  },
  botaoVoltarTexto: { color: '#4F46E5', fontWeight: '600', fontSize: 15 },
});
