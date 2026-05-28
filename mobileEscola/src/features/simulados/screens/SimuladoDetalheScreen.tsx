import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  AttemptStatus,
  SimuladoDetail,
  SupportMaterial,
  subjectIconName,
  formatExamDuration,
  formatTimerSeconds,
} from '../../../services/simulados.service';
import { gerarPdfSimulado } from '../../../services/pdf-simulado.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import {
  useSimuladoDetail,
  useSimuladoMateriais,
  useAttemptReview,
  useStartSimulado,
} from '../hooks';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import {
  canShowExamPdf,
  getPeriodStatusDisplay,
  isPeriodBlockingStart,
  resolveExamPeriodStatus,
} from '../lib/exam-period';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoDetalhe'>;

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

function statusInfo(status: AttemptStatus, awaitingRelease: boolean, colors: ThemeColors) {
  if (awaitingRelease) {
    return {
      icon: 'lock-closed-outline',
      label: 'Resultado bloqueado',
      text: 'O resultado ficará disponível após o encerramento do período.',
      bg: '#ECFEFF',
      color: '#0891B2',
    };
  }

  const map: Record<AttemptStatus, { icon: string; label: string; text: string; bg: string; color: string }> = {
    not_started: {
      icon: 'play-circle-outline',
      label: 'Disponível para iniciar',
      text: 'Confira as regras e inicie quando estiver pronto.',
      bg: '#EEF2FF',
      color: colors.primary,
    },
    in_progress: {
      icon: 'time-outline',
      label: 'Em andamento',
      text: 'Você já iniciou este simulado. Continue de onde parou.',
      bg: '#EFF6FF',
      color: '#2563EB',
    },
    pending_review: {
      icon: 'hourglass-outline',
      label: 'Aguardando correção',
      text: 'Há respostas aguardando correção manual.',
      bg: '#FFFBEB',
      color: '#B45309',
    },
    awaiting_release: {
      icon: 'lock-closed-outline',
      label: 'Resultado bloqueado',
      text: 'O resultado será liberado após o prazo final.',
      bg: '#ECFEFF',
      color: '#0891B2',
    },
    completed: {
      icon: 'checkmark-done-outline',
      label: 'Simulado finalizado',
      text: 'Sua tentativa foi concluída e está disponível para consulta.',
      bg: '#ECFDF5',
      color: '#059669',
    },
    abandoned: {
      icon: 'timer-outline',
      label: 'Tempo esgotado',
      text: 'A tentativa anterior foi encerrada por tempo. Você pode iniciar novamente se o simulado permitir.',
      bg: '#F1F5F9',
      color: '#64748B',
    },
  };

  return map[status];
}

function tint(hex: string | undefined, alpha: string, fallback: string): string {
  if (!hex || !hex.startsWith('#')) return fallback;
  return `${hex}${alpha}`;
}

function needsReview(detalhe: SimuladoDetail): boolean {
  const efetivo = (detalhe.attempt_status || (detalhe.can_start ? 'not_started' : '')) as AttemptStatus;
  return (
    efetivo === 'completed' ||
    efetivo === 'pending_review' ||
    efetivo === 'awaiting_release'
  );
}

interface QuestionImageProps {
  uri: string;
  maxWidth: number;
}

function QuestionImage({ uri, maxWidth }: QuestionImageProps) {
  const [altura, setAltura] = useState(180);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setErro(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && maxWidth > 0) {
          setAltura((maxWidth * h) / w);
        }
      },
      () => setErro(true),
    );
  }, [uri, maxWidth]);

  if (erro) return null;

  return (
    <Image
      source={{ uri }}
      style={{
        width: '100%',
        height: altura,
        borderRadius: 10,
        marginTop: 8,
        marginBottom: 10,
        backgroundColor: '#F1F5F9',
      }}
      resizeMode="contain"
      onError={() => setErro(true)}
      accessibilityLabel="Imagem da questão"
    />
  );
}

function materialIconName(material: SupportMaterial): string {
  if (material.type === 'link') return 'link-outline';
  switch (material.file_type) {
    case 'pdf':      return 'document-text-outline';
    case 'image':    return 'image-outline';
    case 'video':    return 'videocam-outline';
    case 'document': return 'document-attach-outline';
    default:         return 'document-outline';
  }
}

async function abrirMaterial(url: string) {
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  } catch (e) {
    console.warn('[SupportMaterial] não foi possível abrir', url, e);
  }
}

interface SupportMaterialsSectionProps {
  materiais: SupportMaterial[];
  carregando: boolean;
  accentColor: string;
  styles: ReturnType<typeof createSimuladoDetalheStyles>;
}

function SupportMaterialsSection({
  materiais,
  carregando,
  accentColor,
  styles,
}: SupportMaterialsSectionProps) {
  if (carregando) {
    return (
      <View style={styles.materiaisWrap}>
        <View style={styles.materiaisHeader}>
          <Ionicons name="library-outline" size={18} color={accentColor} style={{ marginRight: 8 }} />
          <Text style={styles.materiaisTitulo}>Materiais de apoio</Text>
        </View>
        <ActivityIndicator size="small" color={accentColor} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (!materiais.length) return null;

  return (
    <View style={styles.materiaisWrap}>
      <View style={styles.materiaisHeader}>
        <Ionicons name="library-outline" size={18} color={accentColor} style={{ marginRight: 8 }} />
        <Text style={styles.materiaisTitulo}>Materiais de apoio</Text>
      </View>

      <View style={styles.materiaisLista}>
        {materiais.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.materialChip, { borderColor: accentColor }]}
            onPress={() => abrirMaterial(m.content)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={materialIconName(m) as any}
              size={16}
              color={accentColor}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.materialChipTexto, { color: accentColor }]} numberOfLines={1}>
              {m.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function SimuladoDetalheScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createSimuladoDetalheStyles(colors), [colors]);
  const { examId } = route.params;
  const { width } = useWindowDimensions();
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  const {
    data: detalhe,
    isLoading: carregando,
    isError: detalheErro,
    error: detalheError,
    refetch: refetchDetalhe,
  } = useSimuladoDetail(examId);

  const { data: materiais = [], isLoading: carregandoMateriais } = useSimuladoMateriais(examId);

  const precisaRevisao = detalhe != null && needsReview(detalhe);

  const {
    data: revisao,
    isLoading: carregandoRevisao,
    isError: revisaoErro,
  } = useAttemptReview(detalhe?.attempt_id, precisaRevisao);

  const startMutation = useStartSimulado();
  const iniciando = startMutation.isPending;

  const erroMsg = detalheErro
    ? getApiErrorMessage(detalheError, 'Não foi possível carregar o simulado.')
    : null;

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
          style={styles.headerBackButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (detalhe?.title) {
      navigation.setOptions({ title: detalhe.title });
    }
  }, [detalhe?.title, navigation]);

  async function handleIniciar() {
    if (!detalhe) return;
    setErroAcao(null);
    try {
      const attempt = await startMutation.mutateAsync({ examId: detalhe.id });
      navigation.replace('SimuladoExam', {
        examId: detalhe.id,
        attemptId: attempt.id,
      });
    } catch (e: unknown) {
      setErroAcao(parseStartErrorMessage(e));
    }
  }

  function handleContinuar() {
    if (!detalhe?.attempt_id) return;
    navigation.replace('SimuladoExam', {
      examId: detalhe.id,
      attemptId: detalhe.attempt_id,
    });
  }

  async function handleGerarPdf() {
    if (!detalhe || gerandoPdf) return;
    setErroPdf(null);
    setGerandoPdf(true);
    try {
      await gerarPdfSimulado(detalhe);
    } catch (e: any) {
      console.warn('[PDF] erro ao gerar', e);
      setErroPdf('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setGerandoPdf(false);
    }
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.carregandoTexto}>Carregando simulado…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (erroMsg || !detalhe) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
        <Text style={styles.erroTexto}>{erroMsg ?? 'Simulado não encontrado.'}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={() => refetchDetalhe()} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const subjectColor  = detalhe.subject?.color ?? colors.primary;
  const statusEfetivo: AttemptStatus = (detalhe.attempt_status ?? 'not_started') as AttemptStatus;
  const periodStatus = resolveExamPeriodStatus(detalhe);
  const periodBloqueiaInicio = isPeriodBlockingStart(periodStatus, statusEfetivo);
  const emAndamento   = statusEfetivo === 'in_progress';
  const abandonado    = statusEfetivo === 'abandoned';
  const pendingReview = statusEfetivo === 'pending_review';
  const awaitingRelease =
    statusEfetivo === 'awaiting_release' ||
    revisao?.status === 'awaiting_release' ||
    revisao?.result_release_pending === true;
  const podeIniciar   =
    detalhe.can_start &&
    !periodBloqueiaInicio &&
    (statusEfetivo === 'not_started' || abandonado);
  const mostrarPdf = canShowExamPdf(periodStatus, statusEfetivo);
  const tempoRestante = emAndamento ? detalhe.time_remaining_seconds : null;
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
  const statusAtual = periodBloqueiaInicio
    ? getPeriodStatusDisplay(periodStatus, detalhe, colors)
    : statusInfo(statusEfetivo, awaitingRelease, colors);
  const metricWidth = width < 390 ? '48%' : '23%';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: tint(subjectColor, '0D', colors.soft),
            borderColor: tint(subjectColor, '35', colors.soft),
            borderTopColor: subjectColor,
            shadowColor: subjectColor,
          },
        ]}
      >
        <View style={[styles.cardGlow, { backgroundColor: tint(subjectColor, '18', colors.soft) }]} />
        <View style={styles.headerBlock}>
          <View style={styles.titleGroup}>
            {detalhe.subject ? (
              <View style={[styles.subjectBadge, { backgroundColor: tint(subjectColor, '18', colors.soft) }]}>
                <Ionicons name={subjectIconName(detalhe.subject.icon) as any} size={15} color={subjectColor} />
                <Text style={[styles.subjectBadgeText, { color: subjectColor }]}>{detalhe.subject.name}</Text>
              </View>
            ) : null}
            <Text style={styles.titulo}>{detalhe.title}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusAtual.bg }]}>
            <Ionicons name={statusAtual.icon as any} size={15} color={statusAtual.color} />
            <Text style={[styles.statusBadgeText, { color: statusAtual.color }]}>{statusAtual.label}</Text>
          </View>
        </View>

        {detalhe.description ? (
          <Text style={styles.descricao}>{detalhe.description}</Text>
        ) : null}

        <View style={styles.metaBox}>
          {detalhe.course ? (
            <View style={styles.metaRow}>
              <Ionicons name="school-outline" size={16} color={colors.muted} />
              <Text style={styles.metaLabel}>Curso</Text>
              <Text style={styles.metaValue}>{detalhe.course.name}</Text>
            </View>
          ) : null}
          {detalhe.exam_type_label ? (
            <View style={styles.metaRow}>
              <Ionicons name="layers-outline" size={16} color={colors.muted} />
              <Text style={styles.metaLabel}>Tipo</Text>
              <Text style={styles.metaValue}>{detalhe.exam_type_label}</Text>
            </View>
          ) : null}
          {dataResumo ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.muted} />
              <Text style={styles.metaLabel}>Período</Text>
              <Text style={styles.metaValue}>{dataResumo}</Text>
            </View>
          ) : null}
          {emAndamento && tempoRestante != null ? (
            <View style={styles.metaRow}>
              <Ionicons name="timer-outline" size={16} color={tempoRestante <= 60 ? '#DC2626' : colors.muted} />
              <Text style={styles.metaLabel}>Tempo</Text>
              <Text style={[styles.metaValue, tempoRestante <= 60 && styles.metaValueUrgente]}>
                {formatTimerSeconds(tempoRestante)} restantes
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.grid}>
          <View style={[styles.gridItem, { width: metricWidth }]}>
            <Ionicons name="help-circle-outline" size={22} color={subjectColor} />
            <Text style={styles.gridValor}>{detalhe.total_questions}</Text>
            <Text style={styles.gridLabel}>questões</Text>
          </View>
          <View style={[styles.gridItem, { width: metricWidth }]}>
            <Ionicons name="time-outline" size={22} color={subjectColor} />
            <Text style={styles.gridValor}>{formatExamDuration(detalhe.duration_minutes)}</Text>
            <Text style={styles.gridLabel}>duração</Text>
          </View>
          <View style={[styles.gridItem, { width: metricWidth }]}>
            <Ionicons name="ribbon-outline" size={22} color={subjectColor} />
            <Text style={styles.gridValor}>{detalhe.passing_score}%</Text>
            <Text style={styles.gridLabel}>mínimo</Text>
          </View>
          <View style={[styles.gridItem, { width: metricWidth }]}>
            <Ionicons name="star-outline" size={22} color={subjectColor} />
            <Text style={styles.gridValor}>{detalhe.total_points}</Text>
            <Text style={styles.gridLabel}>pontos</Text>
          </View>
        </View>

        <View style={styles.rulesBox}>
          <View style={[styles.statusNotice, { backgroundColor: statusAtual.bg }]}>
            <Ionicons name={statusAtual.icon as any} size={18} color={statusAtual.color} />
            <Text style={[styles.statusNoticeText, { color: statusAtual.color }]}>{statusAtual.text}</Text>
          </View>

          <View style={styles.ruleRow}>
            <Ionicons
              name={detalhe.allow_retake ? 'refresh-circle-outline' : 'ban-outline'}
              size={18}
              color={detalhe.allow_retake ? '#059669' : colors.muted}
            />
            <Text style={styles.ruleText}>
              {detalhe.allow_retake
                ? `Retentativa: ${detalhe.max_attempts ? `até ${detalhe.max_attempts} tentativa(s)` : 'tentativas ilimitadas'} com limite por nota de ${retakeThreshold ?? 0}%.`
                : 'Retentativa indisponível neste simulado.'}
            </Text>
          </View>
        </View>

        {/* Materiais de apoio */}
        <SupportMaterialsSection
          materiais={materiais}
          carregando={carregandoMateriais}
          accentColor={subjectColor}
          styles={styles}
        />

        {mostrarPdf ? (
          <View style={styles.pdfWrap}>
            <TouchableOpacity
              style={[styles.pdfBotao, { borderColor: subjectColor }, gerandoPdf && styles.botaoDisabled]}
              onPress={handleGerarPdf}
              disabled={gerandoPdf}
              activeOpacity={0.85}
            >
              {gerandoPdf ? (
                <ActivityIndicator size="small" color={subjectColor} />
              ) : (
                <>
                  <Ionicons name="print-outline" size={16} color={subjectColor} style={{ marginRight: 8 }} />
                  <Text style={[styles.pdfBotaoTexto, { color: subjectColor }]}>Gerar PDF para impressão</Text>
                </>
              )}
            </TouchableOpacity>
            {erroPdf ? (
              <Text style={styles.pdfErro}>{erroPdf}</Text>
            ) : (
              <Text style={styles.pdfHint}>
                Gere uma versão imprimível do simulado com folha de respostas.
              </Text>
            )}
          </View>
        ) : null}

        {/* Erro de ação (ex: iniciar falhou) */}
        {erroAcao ? (
          <View style={styles.erroInline}>
            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" style={{ marginRight: 6 }} />
            <Text style={styles.erroInlineTexto}>{erroAcao}</Text>
          </View>
        ) : null}

        {/* Ação principal */}
        {emAndamento ? (
          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }]}
            onPress={handleContinuar}
            activeOpacity={0.8}
          >
            <Ionicons name="play-forward" size={18} color={colors.surface} style={{ marginRight: 8 }} />
            <Text style={styles.botaoAcaoTexto}>Continuar simulado</Text>
          </TouchableOpacity>
        ) : podeIniciar ? (
          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }, iniciando && styles.botaoDisabled]}
            onPress={handleIniciar}
            disabled={iniciando}
            activeOpacity={0.8}
          >
            {iniciando
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <>
                  <Ionicons
                    name={abandonado ? 'refresh' : 'play'}
                    size={18} color={colors.surface}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.botaoAcaoTexto}>
                    {abandonado ? 'Tentar novamente' : 'Iniciar simulado'}
                  </Text>
                </>}
          </TouchableOpacity>
        ) : null}

        {concluidoComVisualizacao && (
          <View style={styles.previewWrap}>
            <View style={styles.previewHeader}>
              <Ionicons name="document-text-outline" size={18} color={subjectColor} style={{ marginRight: 8 }} />
              <Text style={styles.previewTitulo}>Visualização do simulado</Text>
            </View>
            <Text style={styles.previewSubtitulo}>
              Conteúdo em modo leitura, apenas para consulta.
            </Text>

            {/* Score Card */}
            {revisao && revisao.score_display && (
              <View
                style={[
                  styles.scoreCard,
                  revisao.passed ? styles.scoreCardPassed : styles.scoreCardFailed,
                ]}
              >
                <View style={styles.scoreCardContent}>
                  <View>
                    <Text style={styles.scoreCardLabel}>Sua pontuação</Text>
                    <Text style={[styles.scoreCardValue, { color: revisao.passed ? '#059669' : '#DC2626' }]}>
                      {revisao.score_display}
                    </Text>
                  </View>
                  {revisao.percentage != null && (
                    <View>
                      <Text style={styles.scoreCardLabel}>Aproveitamento</Text>
                      <Text style={[styles.scoreCardPercentage, { color: revisao.passed ? '#059669' : '#DC2626' }]}>
                        {revisao.percentage.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {carregandoRevisao ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
            ) : revisao?.questions?.length ? (
              revisao.questions.map((q, index) => {
                const emCorrecao = !awaitingRelease && (q.correction === null || q.correction.is_correct === null);
                const isCorreta  = !awaitingRelease && q.correction?.is_correct === true;
                const isErrada   = !awaitingRelease && q.correction?.is_correct === false;
                const questionStatus = emCorrecao
                  ? { label: 'Em correção', icon: 'hourglass-outline', color: '#B45309', bg: '#FEF3C7' }
                  : awaitingRelease
                    ? { label: 'Resultado bloqueado', icon: 'lock-closed-outline', color: '#0E7490', bg: '#CFFAFE' }
                    : isCorreta
                      ? { label: 'Correta', icon: 'checkmark-circle', color: '#15803D', bg: '#DCFCE7' }
                      : isErrada
                        ? { label: 'Incorreta', icon: 'close-circle', color: '#DC2626', bg: '#FEE2E2' }
                        : null;
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
                    {questionStatus ? (
                      <View style={[styles.questionStatusBadge, { backgroundColor: questionStatus.bg }]}>
                        <Ionicons name={questionStatus.icon as any} size={13} color={questionStatus.color} />
                        <Text style={[styles.questionStatusText, { color: questionStatus.color }]}>
                          {questionStatus.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {q.image_url ? (
                    <QuestionImage uri={q.image_url} maxWidth={Math.max(0, Math.min(width, 720) - 64)} />
                  ) : null}

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
                                    color={colors.surface}
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
            ) : revisaoErro ? (
              <Text style={styles.previewNaoRespondida}>Não foi possível carregar a revisão.</Text>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function createSimuladoDetalheStyles(colors: ThemeColors) {
  return StyleSheet.create({
  headerBackButton: {
    marginLeft: -6,
    paddingRight: 12,
    paddingVertical: 8,
  },
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  content:   { padding: 16 },

  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: '#F6F7FB',
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
    borderTopWidth: 4,
    overflow: 'hidden',
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 2,
  },
  cardGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -110,
    top: -112,
    opacity: 0.92,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  titleGroup: { flex: 1, minWidth: 220 },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  subjectBadgeText: { fontSize: 12, fontWeight: '800' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  titulo:    { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 28 },
  descricao: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },

  metaBox: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaLabel: {
    width: 58,
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  metaValueUrgente: {
    color: '#DC2626',
    fontWeight: '700',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  gridItem:  {
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    padding: 12,
    minHeight: 94,
  },
  gridValor: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 4 },
  gridLabel: { fontSize: 12, color: colors.muted, textTransform: 'uppercase', fontWeight: '700' },

  rulesBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 2,
  },
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
  },
  statusNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7F3',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },

  dataLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dataTexto: { flex: 1, fontSize: 14, color: colors.text },

  botaoAcao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 16,
  },
  botaoAcaoTexto: { color: colors.surface, fontWeight: '600', fontSize: 16 },
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
    borderTopColor: '#E5E7F3',
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
    color: colors.ink,
  },
  previewSubtitulo: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
  previewQuestao: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  previewQuestaoCorreta: {
    borderColor: '#BBF7D0',
    borderLeftColor: '#22C55E',
    backgroundColor: 'rgba(240,253,244,0.72)',
  },
  previewQuestaoErrada: {
    borderColor: '#FECACA',
    borderLeftColor: '#EF4444',
    backgroundColor: 'rgba(254,242,242,0.72)',
  },
  previewQuestaoTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  previewNumero: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 1,
  },
  previewEnunciado: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
    minWidth: 180,
  },
  questionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  questionStatusText: {
    fontSize: 11,
    fontWeight: '800',
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
    backgroundColor: colors.soft,
    borderColor: colors.primary,
  },
  previewRadioVazia: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  previewRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
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
    color: colors.text,
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
    borderLeftColor: '#F59E0B',
    backgroundColor: 'rgba(255,251,235,0.72)',
  },
  previewOpcaoSelecionadaPendente: {
    backgroundColor: colors.soft,
    borderColor: '#A5B4FC',
  },
  previewOpcaoTextoSelecionadaPendente: {
    color: '#4338CA',
    fontWeight: '600',
  },
  previewTextoResposta: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#E5E7F3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewTextoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewTextoConteudo: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  previewNaoRespondida: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  previewDiscursivaTexto: {
    fontSize: 13,
    color: colors.muted,
  },

  scoreCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  scoreCardPassed: {
    backgroundColor: 'rgba(209,250,229,0.78)',
    borderColor: '#A7F3D0',
  },
  scoreCardFailed: {
    backgroundColor: 'rgba(254,226,226,0.78)',
    borderColor: '#FECACA',
  },
  scoreCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  scoreCardValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  scoreCardPercentage: {
    fontSize: 24,
    fontWeight: '700',
  },

  // ── Materiais de apoio ──
  materiaisWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7F3',
  },
  materiaisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  materiaisTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  materiaisLista: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  materialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.74)',
    maxWidth: '100%',
  },
  materialChipTexto: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },

  // ── PDF ──
  pdfWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7F3',
  },
  pdfBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  pdfBotaoTexto: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  pdfHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  pdfErro: {
    marginTop: 8,
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
    fontWeight: '600',
  },
});
}
