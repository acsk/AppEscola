import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ConfirmModal from '../../../components/ConfirmModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  detalharSimulado,
  enviarResposta,
  finalizarSimulado,
  buscarTentativa,
  SimuladoDetail,
  Question,
  AttemptFinish,
} from '../../../services/simulados.service';
import { colors } from '../../../theme';

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
  const exigeTexto =
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
            onPress={() => {
              const deveExibirTexto = op.triggers_text_input || questao.allow_text_answer;
              onChange({
                ...resposta,
                optionId: op.id,
                textAnswer: deveExibirTexto ? resposta.textAnswer : undefined,
              });
            }}
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

      {exigeTexto && (
        <TextInput
          style={qStyles.textInput}
          placeholder={
            questao.type === 'essay'
              ? 'Digite sua resposta…'
              : opcaoSelecionada?.triggers_text_input
              ? 'Especifique sua resposta…'
              : 'Justifique sua resposta…'
          }
          placeholderTextColor={colors.muted}
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
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerEsq:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  numeroBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center',
  },
  numeroTexto:  { fontSize: 14, fontWeight: '700', color: colors.primary },
  subjectPill:  { backgroundColor: colors.soft, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  subjectTexto: { fontSize: 11, fontWeight: '600', color: colors.primary },
  tipoPill:     { backgroundColor: colors.soft, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tipoTexto:    { fontSize: 11, color: colors.muted },
  pontos:       { backgroundColor: colors.soft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  pontosTexto:  { fontSize: 12, color: colors.muted, fontWeight: '500' },
  enunciado:    { fontSize: 15, color: colors.ink, lineHeight: 22, marginBottom: 14 },
  opcao: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    marginBottom: 8, gap: 10,
  },
  opcaoSelecionada:      { borderColor: colors.primary, backgroundColor: colors.soft },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  radioSelecionado:      { borderColor: colors.primary },
  radioPonto:            { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  opcaoTexto:            { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  opcaoTextoSelecionado: { color: colors.primary, fontWeight: '600' },
  textInput: {
    marginTop: 10, backgroundColor: colors.soft,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.ink, minHeight: 100,
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
  const [verificando, setVerificando] = useState(false);
  const scrollRef                 = useRef<ScrollView>(null);
  const bypassRemoveRef            = useRef(false);

  // Modal de confirmação de saída
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction]   = useState<(() => void) | null>(null);

  function pedirConfirmacaoSaida(onConfirm: () => void) {
    setConfirmAction(() => onConfirm);
    setConfirmVisible(true);
  }

  // Botão voltar customizado: garante que sempre há botão, mesmo via deep link
  useEffect(() => {
    function doVoltar() {
      bypassRemoveRef.current = true;
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('SimuladoDetalhe', { examId });
      }
    }

    function handleVoltar() {
      if (fase === 'realizando' || fase === 'finalizando') {
        pedirConfirmacaoSaida(doVoltar);
      } else {
        doVoltar();
      }
    }

    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleVoltar} style={{ paddingRight: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.surface} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, fase, examId]);

  // Confirmação ao sair durante o exame (gesto de swipe / botão físico)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (bypassRemoveRef.current) {
        bypassRemoveRef.current = false;
        return;
      }
      if (fase === 'resultado' || fase === 'carregando' || fase === 'erro') return;
      e.preventDefault();
      pedirConfirmacaoSaida(() => {
        bypassRemoveRef.current = true;
        navigation.dispatch(e.data.action);
      });
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

    const faltantesTexto: number[] = [];
    for (const q of detalhe.questions) {
      const r = respostas[q.id];
      if (!r) continue;

      if (q.type === 'essay') {
        if (!r.textAnswer?.trim()) faltantesTexto.push(q.order);
        continue;
      }

      if (r.optionId === undefined) continue;
      const op = q.options.find((o) => o.id === r.optionId);
      const exigeTexto = q.allow_text_answer || !!op?.triggers_text_input;
      if (exigeTexto && !r.textAnswer?.trim()) faltantesTexto.push(q.order);
    }

    if (faltantesTexto.length > 0) {
      setErroMsg(`Preencha o texto obrigatório na(s) questão(ões): ${faltantesTexto.join(', ')}.`);
      return;
    }

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

  async function verificarResultadoPendencia() {
    setVerificando(true);
    try {
      const atualizado = await buscarTentativa(attemptId);
      setResultado(atualizado);
    } catch {
      // Mantém na tela de aguardo; o usuário pode tentar novamente depois.
    } finally {
      setVerificando(false);
    }
  }

  // Enquanto estiver pendente de correção ou aguardando liberação, faz polling periódico do resultado.
  useEffect(() => {
    if (fase !== 'resultado' || (resultado?.status !== 'pending_review' && resultado?.status !== 'awaiting_release')) return;

    verificarResultadoPendencia();

    const intervalId = setInterval(() => {
      verificarResultadoPendencia();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fase, resultado?.status, attemptId]);

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (fase === 'carregando') {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.carregandoTexto}>Carregando questões…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (fase === 'erro') {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
        <Text style={styles.erroTexto}>{erroMsg}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={carregarQuestoes} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Resultado ───────────────────────────────────────────────────────────────
  if (fase === 'resultado' && resultado) {
    // Aguardando correção manual ou aguardando liberação automática
    if (resultado.status === 'pending_review' || resultado.status === 'awaiting_release') {
      const aguardandoLiberacao = resultado.status === 'awaiting_release';
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={[styles.resultadoCard, { borderTopColor: aguardandoLiberacao ? '#0891B2' : '#F59E0B' }]}> 
            <View style={[styles.resultadoIconCircle, { backgroundColor: aguardandoLiberacao ? '#ECFEFF' : '#FFFBEB' }]}>
              <Ionicons name={aguardandoLiberacao ? 'lock-closed-outline' : 'hourglass-outline'} size={64} color={aguardandoLiberacao ? '#0891B2' : '#F59E0B'} />
            </View>
            <Text style={styles.resultadoTitulo}>{aguardandoLiberacao ? 'Aguardando liberação' : 'Aguardando correção'}</Text>
            {aguardandoLiberacao ? (
              <Text style={styles.resultadoSub}>
                Sua tentativa já foi corrigida, mas o resultado ficará visível somente após o encerramento do período do simulado.
              </Text>
            ) : (
              <>
                <Text style={styles.resultadoSub}>
                  {resultado.pending_answers_count
                    ? `${resultado.pending_answers_count} resposta${resultado.pending_answers_count !== 1 ? 's precisam' : ' precisa'} de correção manual pelo professor.`
                    : 'Suas respostas foram enviadas e aguardam correção manual pelo professor.'}
                </Text>
                <Text style={styles.resultadoSub}>
                  Seu simulado foi entregue! Algumas respostas serão corrigidas pelo professor. Você será notificado quando o resultado estiver disponível.
                </Text>
              </>
            )}

            <View style={styles.resultadoNumeros}>
              <View style={styles.resultadoItem}>
                <Text style={styles.resultadoValor}>{resultado.max_score}</Text>
                <Text style={styles.resultadoLabel}>Pontos totais</Text>
              </View>
              <View style={styles.resultadoDivisor} />
              <View style={styles.resultadoItem}>
                <Text style={[styles.resultadoValor, { color: aguardandoLiberacao ? '#0891B2' : '#F59E0B' }]}> 
                  {aguardandoLiberacao ? 'Bloq.' : (resultado.pending_answers_count ?? '—')}
                </Text>
                <Text style={styles.resultadoLabel}>{aguardandoLiberacao ? 'Resultado' : 'Pendente(s)'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.botaoAguardo, aguardandoLiberacao && { backgroundColor: '#ECFEFF', borderColor: '#0891B2' }, verificando && { opacity: 0.6 }]}
              onPress={verificarResultadoPendencia}
              disabled={verificando}
              activeOpacity={0.8}
            >
              {verificando ? (
                <ActivityIndicator size="small" color={aguardandoLiberacao ? '#0891B2' : '#B45309'} style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="refresh-outline" size={18} color={aguardandoLiberacao ? '#0891B2' : '#B45309'} style={{ marginRight: 8 }} />
              )}
              <Text style={[styles.botaoAguardoTexto, aguardandoLiberacao && { color: '#0891B2' }]}>
                {verificando ? 'Verificando…' : 'Verificar resultado'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.botaoVoltar}
              onPress={() => navigation.navigate('SimuladosList')}
              activeOpacity={0.8}
            >
              <Ionicons name="list-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.botaoVoltarTexto}>Ver todos os simulados</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    const aprovado = resultado.passed;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.resultadoCard, { borderTopColor: aprovado ? colors.credit : colors.debit }]}>
          <View style={[styles.resultadoIconCircle, { backgroundColor: aprovado ? '#ECFDF5' : '#FEF2F2' }]}>
            <Ionicons
              name={aprovado ? 'checkmark-circle' : 'close-circle'}
              size={64}
              color={aprovado ? colors.credit : colors.debit}
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
              <Text style={styles.resultadoValor}>{resultado.percentage?.toFixed(1) ?? '—'}%</Text>
              <Text style={styles.resultadoLabel}>Aproveitamento</Text>
            </View>
            <View style={styles.resultadoDivisor} />
            <View style={styles.resultadoItem}>
              <Text style={styles.resultadoValor}>{resultado.score ?? '—'}</Text>
              <Text style={styles.resultadoLabel}>Pontos obtidos</Text>
            </View>
            <View style={styles.resultadoDivisor} />
            <View style={styles.resultadoItem}>
              <Text style={styles.resultadoValor}>{resultado.max_score}</Text>
              <Text style={styles.resultadoLabel}>Pontos totais</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.botaoRevisar}
            onPress={() => navigation.replace('SimuladoResult', { attemptId })}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.surface} style={{ marginRight: 8 }} />
            <Text style={styles.botaoRevisarTexto}>Revisar simulado</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.botaoVoltar}
            onPress={() => navigation.navigate('SimuladosList')}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
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
      if (r.optionId === undefined) return false;
      const op = q.options.find((o) => o.id === r.optionId);
      const exigeTexto = q.allow_text_answer || !!op?.triggers_text_input;
      return exigeTexto ? !!r.textAnswer?.trim() : true;
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
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <>
                  <Ionicons name="checkmark-done" size={18} color={colors.surface} style={{ marginRight: 8 }} />
                  <Text style={styles.botaoFinalizarTexto}>Finalizar simulado</Text>
                </>}
          </TouchableOpacity>
        </ScrollView>

        <ConfirmModal
          visible={confirmVisible}
          title="Sair do simulado?"
          message="Suas respostas ainda não foram enviadas e serão perdidas."
          confirmLabel="Sair"
          cancelLabel="Cancelar"
          confirmDestructive
          icon="exit-outline"
          iconColor={colors.debit}
          onConfirm={() => {
            setConfirmVisible(false);
            confirmAction?.();
          }}
          onCancel={() => setConfirmVisible(false)}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { padding: 16 },

  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: colors.background,
  },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: colors.muted },
  erroTexto: {
    fontSize: 14, color: colors.text, textAlign: 'center',
    marginTop: 12, lineHeight: 20,
  },
  botaoTentar: {
    marginTop: 20, backgroundColor: colors.primary,
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
  },
  botaoTentarTexto: { color: colors.surface, fontWeight: '600', fontSize: 15 },

  erroInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12,
  },
  erroInlineTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },

  examContainer:      { flex: 1, backgroundColor: colors.background },
  progressoContainer: {
    backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  progressoTexto: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressoLabel: { fontSize: 13, color: colors.muted },
  progressoPct:   { fontSize: 13, fontWeight: '700', color: colors.primary },
  progressoBar:   { height: 6, backgroundColor: '#E0E7FF', borderRadius: 3, overflow: 'hidden' },
  progressoFill:  { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  questoesScroll: { flex: 1 },
  questoesContent:{ padding: 16 },

  botaoFinalizar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.credit, borderRadius: 14,
    paddingVertical: 14, marginTop: 8, marginBottom: 16,
  },
  botaoFinalizarTexto: { color: colors.surface, fontWeight: '700', fontSize: 16 },
  botaoDisabled:       { opacity: 0.6 },

  resultadoCard: {
    backgroundColor: colors.surface, borderRadius: 20,
    borderTopWidth: 6, padding: 24, alignItems: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  resultadoIconCircle: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  resultadoTitulo: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  resultadoSub:    {
    fontSize: 14, color: colors.muted, textAlign: 'center',
    lineHeight: 20, marginBottom: 24,
  },
  resultadoNumeros: {
    flexDirection: 'row', width: '100%',
    backgroundColor: colors.soft, borderRadius: 16, padding: 16, marginBottom: 16,
  },
  resultadoItem:    { flex: 1, alignItems: 'center' },
  resultadoValor:   { fontSize: 22, fontWeight: '800', color: colors.ink },
  resultadoLabel:   { fontSize: 11, color: colors.muted, marginTop: 4, textAlign: 'center' },
  resultadoDivisor: { width: 1, backgroundColor: colors.border, marginHorizontal: 8 },
  avisoDiscursiva:  {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.soft, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  avisoDiscursivaTexto: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 16 },
  botaoRevisar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 16, marginBottom: 8,
  },
  botaoRevisarTexto: { color: colors.surface, fontWeight: '600', fontSize: 15 },
  botaoVoltar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 4,
  },
  botaoVoltarTexto: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  botaoAguardo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFBEB', borderWidth: 1.5, borderColor: '#F59E0B',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24, marginTop: 16, marginBottom: 8,
  },
  botaoAguardoTexto: { color: '#B45309', fontWeight: '600', fontSize: 15 },
});
