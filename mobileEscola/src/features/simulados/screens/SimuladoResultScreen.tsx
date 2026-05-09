import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  buscarTentativaDetalhada,
  AttemptReview,
  subjectIconName,
} from '../../../services/simulados.service';
import { colors } from '../../../theme';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoResult'>;

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}

function calcularDuracao(startedAt: string, finishedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(finishedAt);
  const diffMs = end.getTime() - start.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  return formatMinutes(diffMin);
}

export function SimuladoResultScreen({ route, navigation }: Props) {
  const { attemptId } = route.params;

  const [resultado, setResultado]   = useState<AttemptReview | null>(null);
  const [carregando, setCarregando]  = useState(true);
  const [erroMsg, setErroMsg]        = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('SimuladosList');
            }
          }}
          style={{ paddingRight: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.surface} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => { carregar(); }, [attemptId]);

  async function carregar() {
    setCarregando(true);
    setErroMsg(null);
    try {
      const res = await buscarTentativaDetalhada(attemptId);
      console.log('🎯 Resultado carregado:', JSON.stringify(res, null, 2));
      console.log('📊 Score:', res.score, 'Max:', res.max_score, 'Display:', res.score_display);
      console.log('❓ Questões:', res.questions?.length ?? 0, 'items');
      console.log('🔒 Result release pending:', res.result_release_pending);
      console.log('✅ Status:', res.status);
      setResultado(res);
      navigation.setOptions({ title: res.exam?.title ?? 'Resultado' });
    } catch (e: any) {
      console.log('❌ Erro ao carregar resultado:', e);
      console.log('Response:', e?.response?.data);
      setErroMsg(e?.response?.data?.message ?? 'Não foi possível carregar o resultado.');
    } finally {
      setCarregando(false);
    }
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.carregandoTexto}>Carregando resultado…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (erroMsg || !resultado) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
        <Text style={styles.erroTexto}>{erroMsg ?? 'Resultado não encontrado.'}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={carregar} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const exam = resultado.exam;
  const subjectColor = exam?.subject?.color ?? colors.primary;
  const passou = resultado.passed === true;
  const duracao = (resultado.started_at && resultado.finished_at)
    ? calcularDuracao(resultado.started_at, resultado.finished_at)
    : null;
  const podeExibirScore = resultado.score !== null && resultado.score !== undefined;
  const podeExibirQuestoes = resultado.questions && resultado.questions.length > 0 && !resultado.result_release_pending;
  
  console.log('🎨 Render - Score visible:', podeExibirScore);
  console.log('🎨 Render - Questions visible:', podeExibirQuestoes);
  console.log('🎨 Render - Questions length:', resultado.questions?.length ?? 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Cabeçalho com Score ──────────────────────────────────────────────── */}
      <View style={[styles.card, { borderTopWidth: 4, borderTopColor: subjectColor }]}>
        
        {/* Assunto e Tipo */}
        <View style={styles.chipsRow}>
          {exam?.subject && (
            <View style={[styles.chip, { backgroundColor: subjectColor + '18' }]}>
              <Ionicons name={subjectIconName(exam.subject.icon) as any} size={16} color={subjectColor} />
              <Text style={[styles.chipTexto, { color: subjectColor }]}>{exam.subject.name}</Text>
            </View>
          )}
          {exam?.exam_type_label && (
            <View style={styles.chipGray}>
              <Text style={styles.chipGrayTexto}>{exam.exam_type_label}</Text>
            </View>
          )}
        </View>

        {/* Título do exame */}
        <Text style={styles.titulo}>{exam?.title ?? 'Simulado'}</Text>

        {/* Score Display em Destaque */}
        {podeExibirScore && (
          <View style={[
            styles.scoreCard,
            { backgroundColor: passou ? '#ECFDF5' : '#FEF2F2', borderColor: passou ? '#86EFAC' : '#FECACA' }
          ]}>
            <View style={styles.scoreLeft}>
              <Ionicons
                name={passou ? 'checkmark-circle' : 'close-circle'}
                size={32}
                color={passou ? '#16A34A' : '#DC2626'}
              />
              <View style={styles.scoreTextos}>
                <Text style={styles.scorePrincipal}>
                  {resultado.score_display || `${resultado.score ?? 0}/${resultado.max_score ?? 0}`}
                </Text>
                <Text style={[styles.scoreLabel, { color: passou ? '#166534' : '#991B1B' }]}>
                  {passou ? 'Aprovado' : 'Reprovado'}
                </Text>
              </View>
            </View>
            <View style={styles.scoreRight}>
              <Text style={styles.percentualGrande}>{resultado.percentage ? resultado.percentage.toFixed(1) : '0'}%</Text>
            </View>
          </View>
        )}

        {/* Resultado bloqueado */}
        {resultado.result_release_pending && (
          <View style={styles.lockBanner}>
            <Ionicons name="lock-closed-outline" size={18} color="#0891B2" style={{ marginRight: 8 }} />
            <Text style={styles.lockBannerTexto}>
              Resultado será liberado após o encerramento do período.
            </Text>
          </View>
        )}

        {/* Status da tentativa */}
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.muted} />
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValor}>{
              resultado.status === 'completed' ? 'Concluído' :
              resultado.status === 'pending_review' ? 'Aguardando revisão' :
              resultado.status === 'awaiting_release' ? 'Resultado bloqueado' :
              resultado.status || 'Desconhecido'
            }</Text>
          </View>
          {duracao && (
            <View style={styles.statusItem}>
              <Ionicons name="time-outline" size={18} color={colors.muted} />
              <Text style={styles.statusLabel}>Duração</Text>
              <Text style={styles.statusValor}>{duracao}</Text>
            </View>
          )}
        </View>

        {/* Timeline */}
        {resultado.started_at && (
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineLabel}>Início</Text>
                <Text style={styles.timelineData}>{formatDate(resultado.started_at)}</Text>
              </View>
            </View>
            {resultado.finished_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineLabel}>Término</Text>
                  <Text style={styles.timelineData}>{formatDate(resultado.finished_at)}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Revisão das Questões ─────────────────────────────────────────────── */}
      {podeExibirQuestoes && (
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.revistaHeader}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.revistaTitulo}>Revisão das questões</Text>
          </View>
          <Text style={styles.revistaSubtitulo}>
            Conteúdo em modo leitura, apenas para consulta.
          </Text>

          {resultado.questions && resultado.questions.map((q, index) => {
            const emCorrecao = q.correction === null || q.correction.is_correct === null;
            const isCorreta = q.correction?.is_correct === true;
            const isErrada = q.correction?.is_correct === false;

            return (
              <View
                key={q.id}
                style={[
                  styles.questaoItem,
                  isCorreta && styles.questaoCorreta,
                  isErrada && styles.questaoErrada,
                  emCorrecao && styles.questaoEmCorrecao,
                ]}
              >
                <View style={styles.questaoTopo}>
                  <Text style={styles.questaoNumero}>{index + 1}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.questaoTexto}>{q.question_text}</Text>
                    {q.points && (
                      <Text style={styles.questaoPoints}>Pontos: {q.points}</Text>
                    )}
                  </View>
                </View>

                {/* Indicador de correção */}
                {emCorrecao && (
                  <View style={styles.correcaoBadge}>
                    <Ionicons name="hourglass-outline" size={13} color="#B45309" style={{ marginRight: 4 }} />
                    <Text style={styles.correcaoBadgeTexto}>Em correção</Text>
                  </View>
                )}

                {/* Alternativas múltipla escolha */}
                {q.type === 'multiple_choice' && q.options && (
                  <View style={styles.opcoes}>
                    {q.options
                      .slice()
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((op) => {
                        const selecionada = op.selected;
                        const questaoCorreta = q.correction?.is_correct === true;
                        const questaoErrada = q.correction?.is_correct === false;
                        const gabarito = op.is_correct === true || (selecionada && questaoCorreta && op.is_correct === null);
                        const errada = (selecionada && op.is_correct === false) || (selecionada && questaoErrada && op.is_correct === null);

                        return (
                          <View
                            key={op.id}
                            style={[
                              styles.opcaoItem,
                              gabarito && styles.opcaoCorreta,
                              errada && styles.opcaoErrada,
                              emCorrecao && selecionada && styles.opcaoSelecionadaPendente,
                            ]}
                          >
                            <View
                              style={[
                                styles.radio,
                                gabarito ? styles.radioCorreta : errada ? styles.radioErrada : selecionada ? styles.radioSelecionada : styles.radioVazia,
                              ]}
                            >
                              {(gabarito || errada) ? (
                                <Ionicons
                                  name={gabarito ? 'checkmark' : 'close'}
                                  size={13}
                                  color={colors.surface}
                                />
                              ) : selecionada ? (
                                <View style={styles.radioDot} />
                              ) : null}
                            </View>
                            <Text
                              style={[
                                styles.opcaoTexto,
                                gabarito && styles.opcaoTextoCorreta,
                                errada && styles.opcaoTextoErrada,
                              ]}
                            >
                              {op.option_text}
                            </Text>
                          </View>
                        );
                      })}
                  </View>
                )}

                {/* Resposta de texto */}
                {q.type === 'essay' && q.student_answer?.text_answer && (
                  <View style={styles.respostaTexto}>
                    <Text style={styles.respostaTextoLabel}>Texto enviado:</Text>
                    <Text style={styles.respostaTextoConteudo}>{q.student_answer.text_answer}</Text>
                  </View>
                )}

                {/* Não respondida */}
                {(!q.student_answer || (!q.student_answer.option_id && !q.student_answer.text_answer)) && (
                  <Text style={styles.naoRespondida}>Não respondida</Text>
                )}

                {/* Resultado */}
                {q.correction && (
                  <View style={styles.resultadoQuestao}>
                    <View style={styles.resultadoItem}>
                      <Text style={styles.resultadoLabel}>Sua resposta:</Text>
                      <Text style={[
                        styles.resultadoValor,
                        q.correction.is_correct ? styles.resultadoValorCorreto : styles.resultadoValorErrado,
                      ]}>
                        {q.correction.points_earned}/{q.correction.max_points} pt
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Resultado bloqueado ──────────────────────────────────────────────── */}
      {resultado.result_release_pending && (
        <View style={[styles.card, { marginTop: 16, backgroundColor: '#ECFEFF' }]}>
          <Ionicons name="lock-closed-outline" size={32} color="#0891B2" style={{ marginBottom: 12, alignSelf: 'center' }} />
          <Text style={{ textAlign: 'center', color: '#0891B2', fontWeight: '600', marginBottom: 8 }}>
            Resultado bloqueado
          </Text>
          <Text style={{ textAlign: 'center', color: '#0E7490', fontSize: 13, lineHeight: 18 }}>
            As questões e resultados estarão disponíveis após o encerramento do período do simulado.
          </Text>
        </View>
      )}

      {/* Espaço final */}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },

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

  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },

  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
  },
  chipTexto: { fontSize: 13, fontWeight: '700' },
  chipGray: { backgroundColor: colors.soft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  chipGrayTexto: { fontSize: 13, fontWeight: '600', color: colors.muted },

  titulo: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 16 },

  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 2,
    padding: 18,
    marginBottom: 16,
  },
  scoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreTextos: { gap: 4 },
  scorePrincipal: { fontSize: 28, fontWeight: '800', color: colors.ink },
  scoreLabel: { fontSize: 13, fontWeight: '700' },
  scoreRight: { alignItems: 'center' },
  percentualGrande: { fontSize: 32, fontWeight: '800', color: colors.primary },

  lockBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#06B6D4',
    borderRadius: 12, padding: 14, marginBottom: 16,
  },
  lockBannerTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0E7490' },

  statusRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statusItem: { flex: 1, gap: 6 },
  statusLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  statusValor: { fontSize: 13, color: colors.text, fontWeight: '700' },

  timeline: { marginTop: 12, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border, marginTop: 4, marginLeft: -19 },
  timelineLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  timelineData: { fontSize: 13, color: colors.text, marginTop: 2 },

  revistaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  revistaTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  revistaSubtitulo: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },

  questaoItem: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: colors.surface,
  },
  questaoCorreta: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  questaoErrada: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  questaoEmCorrecao: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },

  questaoTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  questaoNumero: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 1,
  },
  questaoTexto: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  questaoPoints: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },

  correcaoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  correcaoBadgeTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },

  opcoes: { gap: 7, marginTop: 10 },
  opcaoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  opcaoCorreta: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  opcaoErrada: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  opcaoSelecionadaPendente: {
    backgroundColor: colors.soft,
    borderColor: '#A5B4FC',
  },
  opcaoTexto: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  opcaoTextoCorreta: {
    color: '#166534',
    fontWeight: '600',
  },
  opcaoTextoErrada: {
    color: '#DC2626',
    fontWeight: '600',
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioCorreta: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  radioErrada: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  radioSelecionada: {
    backgroundColor: colors.soft,
    borderColor: colors.primary,
  },
  radioVazia: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  respostaTexto: {
    marginTop: 10,
    backgroundColor: colors.soft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  respostaTextoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 4,
  },
  respostaTextoConteudo: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  naoRespondida: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 10,
    fontStyle: 'italic',
  },

  resultadoQuestao: {
    marginTop: 10,
    backgroundColor: colors.soft,
    borderRadius: 10,
    padding: 10,
  },
  resultadoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultadoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  resultadoValor: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultadoValorCorreto: {
    color: '#16A34A',
  },
  resultadoValorErrado: {
    color: '#DC2626',
  },
});
