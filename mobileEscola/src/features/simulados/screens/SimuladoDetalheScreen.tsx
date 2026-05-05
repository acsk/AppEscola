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
  detalharSimulado,
  iniciarSimulado,
  buscarRevisao,
  AttemptStatus,
  SimuladoDetail,
  AttemptReview,
  subjectIconName,
} from '../../../services/simulados.service';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoDetalhe'>;

const PRIMARY = '#4F46E5';
const INK = '#1E1B4B';
const TEXT = '#312E81';
const MUTED = '#64748B';
const SOFT = '#EEF2FF';
const BORDER = '#DDE3F5';
const SURFACE = '#FFFFFF';
const BACKGROUND = '#F6F7FB';

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

function parseStartErrorMessage(e: any): string {
  const examIdErrors =
    e?.response?.data?.body?.errors?.exam_id ??
    e?.response?.data?.errors?.exam_id;
  if (Array.isArray(examIdErrors) && examIdErrors.length > 0) {
    return String(examIdErrors[0]);
  }

  const apiErrors = e?.response?.data?.body?.errors ?? e?.response?.data?.errors;
  if (apiErrors) {
    return Object.values(apiErrors as Record<string, string[]>).flat().join(' ');
  }

  return e?.response?.data?.message ?? 'Não foi possível iniciar o simulado.';
}

export function SimuladoDetalheScreen({ route, navigation }: Props) {
  const { examId } = route.params;

  const [detalhe, setDetalhe]         = useState<SimuladoDetail | null>(null);
  const [carregando, setCarregando]   = useState(true);
  const [erroMsg, setErroMsg]         = useState<string | null>(null);
  const [iniciando, setIniciando]     = useState(false);
  const [erroAcao, setErroAcao]       = useState<string | null>(null);
  const [revisao, setRevisao]         = useState<AttemptReview | null>(null);
  const [carregandoRevisao, setCarregandoRevisao] = useState(false);

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
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => { carregar(); }, [examId]);

  async function carregar() {
    setCarregando(true);
    setErroMsg(null);
    try {
      const d = await detalharSimulado(examId);
      setDetalhe(d);
      navigation.setOptions({ title: d.title });

      const efetivo = (d.attempt_status || (d.can_start ? 'not_started' : '')) as AttemptStatus;
      const precisaRevisao =
        efetivo === 'completed' ||
        efetivo === 'pending_review' ||
        efetivo === 'awaiting_release';
      if (precisaRevisao && d.attempt_id) {
        setCarregandoRevisao(true);
        try {
          const rev = await buscarRevisao(d.attempt_id);
          setRevisao(rev);
        } catch {
          // falha silenciosa — visualização ficará sem dados de correção
        } finally {
          setCarregandoRevisao(false);
        }
      }
    } catch (e: any) {
      setErroMsg(e?.response?.data?.message ?? 'Não foi possível carregar o simulado.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleIniciar() {
    if (!detalhe) return;
    setIniciando(true);
    setErroAcao(null);
    try {
      const attempt = await iniciarSimulado(detalhe.id);
      navigation.replace('SimuladoExam', {
        examId: detalhe.id,
        attemptId: attempt.id,
      });
    } catch (e: any) {
      setErroAcao(parseStartErrorMessage(e));
    } finally {
      setIniciando(false);
    }
  }

  function handleContinuar() {
    if (!detalhe?.attempt_id) return;
    navigation.replace('SimuladoExam', {
      examId: detalhe.id,
      attemptId: detalhe.attempt_id,
    });
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.carregandoTexto}>Carregando simulado…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (erroMsg || !detalhe) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color={BORDER} />
        <Text style={styles.erroTexto}>{erroMsg ?? 'Simulado não encontrado.'}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={carregar} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const subjectColor  = detalhe.subject?.color ?? PRIMARY;
  const statusEfetivo: AttemptStatus = (
    detalhe.attempt_status || (detalhe.can_start ? 'not_started' : 'in_progress')
  ) as AttemptStatus;
  const emAndamento   = statusEfetivo === 'in_progress';
  const pendingReview = statusEfetivo === 'pending_review';
  const awaitingRelease =
    statusEfetivo === 'awaiting_release' ||
    revisao?.status === 'awaiting_release' ||
    revisao?.result_release_pending === true;
  const podeComecar   = detalhe.can_start && statusEfetivo === 'not_started';
  const concluido     = statusEfetivo === 'completed';
  const concluidoComVisualizacao =
    statusEfetivo === 'completed' ||
    statusEfetivo === 'pending_review' ||
    awaitingRelease;
  const retakeThreshold = detalhe.min_score_to_retake ?? detalhe.passing_score;
  const dataResumo = [
    detalhe.starts_at ? `Início: ${formatDate(detalhe.starts_at)}` : null,
    detalhe.ends_at ? `Prazo: ${formatDate(detalhe.ends_at)}` : null,
  ].filter(Boolean).join('  •  ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.card, { borderTopWidth: 4, borderTopColor: subjectColor }]}>

        {/* Chips: disciplina + tipo + status */}
        <View style={styles.chipsRow}>
          {detalhe.subject && (
            <View style={[styles.chip, { backgroundColor: subjectColor + '18' }]}> 
              <Ionicons name={subjectIconName(detalhe.subject.icon) as any} size={16} color={subjectColor} />
              <Text style={[styles.chipTexto, { color: subjectColor }]}>{detalhe.subject.name}</Text>
            </View>
          )}
          {detalhe.exam_type_label ? (
            <View style={styles.chipGray}>
              <Text style={styles.chipGrayTexto}>{detalhe.exam_type_label}</Text>
            </View>
          ) : null}
          {detalhe.status_label ? (
            <View style={styles.chipGray}>
              <Text style={styles.chipGrayTexto}>{detalhe.status_label}</Text>
            </View>
          ) : null}
          {concluido ? (
            <View style={styles.statusTopBadge}>
              <Ionicons name="checkmark-circle" size={15} color={PRIMARY} />
              <Text style={styles.statusTopBadgeTexto}>Simulado concluído</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.titulo}>{detalhe.title}</Text>

        {detalhe.course && (
          <View style={styles.cursoRow}>
            <Ionicons name="school-outline" size={17} color={MUTED} />
            <Text style={styles.cursoTexto}>{detalhe.course.name}</Text>
          </View>
        )}

        {detalhe.description ? (
          <Text style={styles.descricao}>{detalhe.description}</Text>
        ) : null}

        {/* Grade de métricas */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="help-circle-outline" size={28} color={MUTED} />
            <Text style={styles.gridValor}>{detalhe.total_questions}</Text>
            <Text style={styles.gridLabel}>Questões</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="time-outline" size={28} color={MUTED} />
            <Text style={styles.gridValor}>{formatMinutes(detalhe.duration_minutes)}</Text>
            <Text style={styles.gridLabel}>Duração</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="ribbon-outline" size={28} color={MUTED} />
            <Text style={styles.gridValor}>{detalhe.passing_score}%</Text>
            <Text style={styles.gridLabel}>Para passar</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="star-outline" size={28} color={MUTED} />
            <Text style={styles.gridValor}>{detalhe.total_points}</Text>
            <Text style={styles.gridLabel}>Pontos</Text>
          </View>
        </View>

        {/* Datas */}
        {dataResumo ? (
          <View style={styles.dataLinha}>
            <Ionicons name="calendar-outline" size={18} color={MUTED} />
            <Text style={styles.dataTexto} numberOfLines={1}>{dataResumo}</Text>
          </View>
        ) : null}

        {/* Regras de retentativa */}
        <View style={[styles.banner, { backgroundColor: detalhe.allow_retake ? '#ECFDF5' : SOFT, marginTop: 10 }]}>
          <Ionicons
            name={detalhe.allow_retake ? 'refresh-circle-outline' : 'ban-outline'}
            size={18}
            color={detalhe.allow_retake ? '#059669' : MUTED}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.bannerTexto, { color: detalhe.allow_retake ? '#059669' : MUTED, flex: 1 }]}>
            {detalhe.allow_retake
              ? `Retentativa habilitada${detalhe.max_attempts ? ` · Máx: ${detalhe.max_attempts} tentativa(s)` : ' · Tentativas ilimitadas'} · Limite por nota: ${retakeThreshold ?? 0}%`
              : 'Retentativa desabilitada para este simulado.'}
          </Text>
        </View>

        {/* Erro de ação (ex: iniciar falhou) */}
        {erroAcao ? (
          <View style={styles.erroInline}>
            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" style={{ marginRight: 6 }} />
            <Text style={styles.erroInlineTexto}>{erroAcao}</Text>
          </View>
        ) : null}

        {/* Ação principal */}
        {(emAndamento || pendingReview || awaitingRelease) ? (
          pendingReview ? (
            <View style={[styles.banner, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="hourglass-outline" size={18} color="#B45309" style={{ marginRight: 8 }} />
              <Text style={[styles.bannerTexto, { color: '#B45309', flex: 1 }]}>
                Aguardando correção manual. O resultado será liberado em breve.
              </Text>
            </View>
          ) : awaitingRelease ? (
            <View style={[styles.banner, { backgroundColor: '#ECFEFF' }]}>
              <Ionicons name="lock-closed-outline" size={18} color="#0891B2" style={{ marginRight: 8 }} />
              <Text style={[styles.bannerTexto, { color: '#0891B2', flex: 1 }]}> 
                Correção concluída. O resultado ficará disponível após o encerramento do período do simulado.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.botaoAcao, { backgroundColor: subjectColor }]}
              onPress={handleContinuar}
              activeOpacity={0.8}
            >
              <Ionicons name="play-forward" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.botaoAcaoTexto}>Continuar simulado</Text>
            </TouchableOpacity>
          )
        ) : concluido ? (
          <View style={[styles.banner, { backgroundColor: '#F5F3FF' }]}> 
            <Ionicons name="checkmark-done-outline" size={18} color={PRIMARY} style={{ marginRight: 8 }} />
            <Text style={[styles.bannerTexto, { color: PRIMARY, flex: 1 }]}>Simulado finalizado</Text>
          </View>
        ) : podeComecar ? (
          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }, iniciando && styles.botaoDisabled]}
            onPress={handleIniciar}
            disabled={iniciando}
            activeOpacity={0.8}
          >
            {iniciando
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons
                    name="play"
                    size={18} color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.botaoAcaoTexto}>Iniciar simulado</Text>
                </>}
          </TouchableOpacity>
        ) : (
          <View style={[styles.banner, { backgroundColor: '#FEF9C3' }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#B45309" style={{ marginRight: 8 }} />
            <Text style={[styles.bannerTexto, { color: '#B45309' }]}>Fora do período permitido</Text>
          </View>
        )}

        {concluidoComVisualizacao && (
          <View style={styles.previewWrap}>
            <View style={styles.previewHeader}>
              <Ionicons name="document-text-outline" size={18} color={PRIMARY} style={{ marginRight: 8 }} />
              <Text style={styles.previewTitulo}>Visualização do simulado</Text>
            </View>
            <Text style={styles.previewSubtitulo}>
              Conteúdo em modo leitura, apenas para consulta.
            </Text>

            {carregandoRevisao ? (
              <ActivityIndicator size="small" color={PRIMARY} style={{ marginTop: 12 }} />
            ) : revisao?.questions?.length ? (
              revisao.questions.map((q, index) => {
                const emCorrecao = !awaitingRelease && (q.correction === null || q.correction.is_correct === null);
                const isCorreta  = !awaitingRelease && q.correction?.is_correct === true;
                const isErrada   = !awaitingRelease && q.correction?.is_correct === false;
                return (
                <View key={q.id} style={[
                  styles.previewQuestao,
                  isCorreta  && styles.previewQuestaoCorreta,
                  isErrada   && styles.previewQuestaoErrada,
                  emCorrecao && styles.previewQuestaoEmCorrecao,
                ]}>
                  <View style={styles.previewQuestaoTopo}>
                    <Text style={styles.previewNumero}>{index + 1}.</Text>
                    <Text style={styles.previewEnunciado}>{q.question_text}</Text>
                  </View>

                  {/* Indicador "Em correção" */}
                  {emCorrecao && (
                    <View style={styles.emCorrecaoBadge}>
                      <Ionicons name="hourglass-outline" size={13} color="#B45309" style={{ marginRight: 4 }} />
                      <Text style={styles.emCorrecaoBadgeTexto}>Em correção</Text>
                    </View>
                  )}
                  {awaitingRelease && (
                    <View style={[styles.emCorrecaoBadge, { backgroundColor: '#CFFAFE' }]}>
                      <Ionicons name="lock-closed-outline" size={13} color="#0E7490" style={{ marginRight: 4 }} />
                      <Text style={[styles.emCorrecaoBadgeTexto, { color: '#0E7490' }]}>Resultado bloqueado</Text>
                    </View>
                  )}

                  {q.type === 'multiple_choice' ? (
                    <View style={styles.previewOpcoes}>
                      {q.options
                        .slice()
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((op) => {
                          const selecionada    = op.selected;
                          const questaoCorreta = !awaitingRelease && q.correction?.is_correct === true;
                          const questaoErrada  = !awaitingRelease && q.correction?.is_correct === false;
                          // op.is_correct pode ser null quando o backend não revela o gabarito;
                          // nesse caso usa o resultado da questão para a opção selecionada
                          const gabarito =
                            !awaitingRelease &&
                            (op.is_correct === true || (selecionada && questaoCorreta && op.is_correct === null));
                          const errada =
                            !awaitingRelease &&
                            ((selecionada && op.is_correct === false) || (selecionada && questaoErrada && op.is_correct === null));

                          return (
                            <View
                              key={op.id}
                              style={[
                                styles.previewOpcaoItem,
                                gabarito   && styles.previewOpcaoCorreta,
                                errada     && styles.previewOpcaoErrada,
                                emCorrecao && selecionada && styles.previewOpcaoSelecionadaPendente,
                              ]}
                            >
                              <View
                                style={[
                                  styles.previewRadio,
                                  gabarito
                                    ? styles.previewRadioCorreta
                                    : errada
                                      ? styles.previewRadioErrada
                                      : selecionada
                                        ? styles.previewRadioSelecionada
                                        : styles.previewRadioVazia,
                                ]}
                              >
                                {(gabarito || errada) ? (
                                  <Ionicons
                                    name={gabarito ? 'checkmark' : 'close'}
                                    size={13}
                                    color="#FFFFFF"
                                  />
                                ) : selecionada ? (
                                  <View style={styles.previewRadioDot} />
                                ) : null}
                              </View>
                              <Text style={[
                                styles.previewOpcaoTexto,
                                gabarito && styles.previewOpcaoTextoCorreta,
                                errada   && styles.previewOpcaoTextoErrada,
                                emCorrecao && selecionada && styles.previewOpcaoTextoSelecionadaPendente,
                              ]}>
                                {op.option_text}
                              </Text>
                            </View>
                          );
                        })}

                      {q.student_answer?.text_answer ? (
                        <View style={styles.previewTextoResposta}>
                          <Text style={styles.previewTextoLabel}>Texto enviado:</Text>
                          <Text style={styles.previewTextoConteudo}>{q.student_answer.text_answer}</Text>
                        </View>
                      ) : null}

                      {!q.student_answer && (
                        <Text style={styles.previewNaoRespondida}>Não respondida</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.previewTextoResposta}>
                      <Text style={styles.previewTextoLabel}>Texto enviado:</Text>
                      <Text style={styles.previewTextoConteudo}>
                        {q.student_answer?.text_answer?.trim() ? q.student_answer.text_answer : 'Não respondida'}
                      </Text>
                    </View>
                  )}
                </View>
                );
              })
            ) : (
              <Text style={styles.previewNaoRespondida}>Não foi possível carregar a revisão.</Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  content:   { padding: 16 },

  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: BACKGROUND,
  },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: MUTED },
  erroTexto: {
    fontSize: 14, color: TEXT, textAlign: 'center',
    marginTop: 12, lineHeight: 20,
  },
  botaoTentar: {
    marginTop: 20, backgroundColor: PRIMARY,
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
  },
  botaoTentarTexto: { color: '#fff', fontWeight: '600', fontSize: 15 },

  card: {
    backgroundColor: SURFACE, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  statusTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 6,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusTopBadgeTexto: {
    fontSize: 13,
    fontWeight: '800',
    color: PRIMARY,
  },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
  },
  chipTexto:     { fontSize: 13, fontWeight: '700' },
  chipGray:      { backgroundColor: SOFT, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  chipGrayTexto: { fontSize: 13, fontWeight: '600', color: MUTED },
  titulo:    { fontSize: 20, fontWeight: '800', color: INK, marginBottom: 8 },
  cursoRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cursoTexto:{ fontSize: 13, color: MUTED },
  descricao: { fontSize: 14, color: MUTED, lineHeight: 20, marginBottom: 16 },

  grid: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: SOFT, borderRadius: 16, padding: 16, marginBottom: 14,
  },
  gridItem:  { alignItems: 'center', flex: 1, gap: 6 },
  gridValor: { fontSize: 16, fontWeight: '800', color: INK },
  gridLabel: { fontSize: 12, color: MUTED, textAlign: 'center' },

  dataLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dataTexto: { flex: 1, fontSize: 14, color: TEXT },

  botaoAcao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 16,
  },
  botaoAcaoTexto: { color: '#fff', fontWeight: '600', fontSize: 16 },
  botaoDisabled:  { opacity: 0.6 },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginTop: 16,
  },
  bannerTexto: { fontSize: 14, fontWeight: '600' },

  erroInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginTop: 12,
  },
  erroInlineTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },

  previewWrap: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  previewSubtitulo: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 12,
  },
  previewQuestao: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: SURFACE,
  },
  previewQuestaoCorreta: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  previewQuestaoErrada: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  previewQuestaoTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  previewNumero: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
    marginRight: 8,
    marginTop: 1,
  },
  previewEnunciado: {
    flex: 1,
    fontSize: 15,
    color: INK,
    lineHeight: 22,
  },
  previewOpcoes: {
    gap: 7,
  },
  previewOpcaoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  previewRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  previewRadioCorreta: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  previewRadioErrada: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  previewRadioSelecionada: {
    backgroundColor: '#EEF2FF',
    borderColor: PRIMARY,
  },
  previewRadioVazia: {
    backgroundColor: '#FFFFFF',
    borderColor: BORDER,
  },
  previewRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
  },
  previewOpcaoCorreta: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  previewOpcaoErrada: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  previewOpcaoTexto: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    lineHeight: 20,
  },
  previewOpcaoTextoCorreta: {
    color: '#166534',
    fontWeight: '600',
  },
  previewOpcaoTextoErrada: {
    color: '#DC2626',
    fontWeight: '600',
  },
  previewQuestaoEmCorrecao: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  emCorrecaoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  emCorrecaoBadgeTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },
  previewOpcaoSelecionadaPendente: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
  },
  previewOpcaoTextoSelecionadaPendente: {
    color: '#4338CA',
    fontWeight: '600',
  },
  previewTextoResposta: {
    marginTop: 8,
    backgroundColor: SOFT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewTextoLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewTextoConteudo: {
    fontSize: 14,
    color: TEXT,
    lineHeight: 20,
  },
  previewNaoRespondida: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    fontStyle: 'italic',
  },
  previewDiscursivaTexto: {
    fontSize: 13,
    color: MUTED,
  },
});
