import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type {
  ExamAttempt,
  ExamAttemptDetail,
  ExamQuestion,
  ExamQuestionOption,
  ExamAttemptsScreenProps,
} from "../../types/simulados";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in_progress:    "Em andamento",
  pending_review: "Aguardando correção",
  awaiting_release: "Aguardando liberação",
  completed:      "Concluída",
};

const STATUS_SLUG: Record<string, string> = {
  in_progress:    "warning",
  pending_review: "warning",
  awaiting_release: "info",
  completed:      "active",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

type AttemptDetailQuestion = Pick<ExamQuestion, "id" | "image_url" | "options">;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExamAttemptsScreen({ navigate, initialStatusFilter = "" }: ExamAttemptsScreenProps) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExamAttemptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailQuestionsById, setDetailQuestionsById] = useState<Record<number, AttemptDetailQuestion | null>>({});

  // Correction state
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [detailNeedsCorrection, setDetailNeedsCorrection] = useState(false);

  const fetchAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/exam-attempts", { params });
      setRows(Array.isArray(data.data) ? data.data : []);
      if (data.meta) setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setPage(1);
  }, [initialStatusFilter]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailQuestionsById({});
    setLoadingDetail(true);
    setDetailNeedsCorrection(false);
    try {
      const { data } = await api.get(`/exam-attempts/${id}`);
      const attemptData = data as ExamAttemptDetail;
      setDetail(attemptData);
      setDetailNeedsCorrection(data.status === 'pending_review');

      const examId = attemptData.exam?.id;
      if (examId) {
        try {
          const questionsResponse = await api.get(`/exams/${examId}/questions`);
          const rawQuestions = questionsResponse.data?.body ?? questionsResponse.data;
          const questions = Array.isArray(rawQuestions)
            ? rawQuestions
            : Array.isArray(rawQuestions?.data)
              ? rawQuestions.data
              : [];

          const questionsById = questions.reduce((acc: Record<number, AttemptDetailQuestion | null>, question: ExamQuestion) => {
            acc[question.id] = {
              id: question.id,
              image_url: question.image_url,
              options: question.options,
            };
            return acc;
          }, {});

          setDetailQuestionsById(questionsById);
        } catch {}
      }
    } catch {}
    setLoadingDetail(false);
  };

  const correctAnswer = async (answerId: number, isCorrect: boolean) => {
    if (!detail) return;
    setCorrectingId(answerId);
    try {
      const { data } = await api.patch(
        `/exam-attempts/${detail.id}/answers/${answerId}/correct`,
        { is_correct: isCorrect },
      );
      // Atualiza o detalhe com o retorno da API
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: data.status ?? prev.status,
          score: data.score ?? prev.score,
          percentage: data.percentage ?? prev.percentage,
          passed: data.passed ?? prev.passed,
          pending_answers_count: data.pending_answers_count ?? 0,
          answers: prev.answers.map((a) =>
            a.id === answerId
              ? { ...a, is_correct: isCorrect, points_earned: data.points_earned ?? a.points_earned }
              : a,
          ),
        };
      });
      // Atualiza a linha na lista
      setRows((prev) =>
        prev.map((r) =>
          r.id === detail.id
            ? {
                ...r,
                status: data.status ?? r.status,
                score: data.score ?? r.score,
                percentage: data.percentage ?? r.percentage,
                passed: data.passed ?? r.passed,
                pending_answers_count: data.pending_answers_count ?? 0,
              }
            : r,
        ),
      );
    } catch {}
    setCorrectingId(null);
  };

  const selectStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 14,
    color: "#374151",
    backgroundColor: "white",
    height: 44,
    minWidth: isMobile ? "100%" : 160,
  };

  const attemptsTableMinWidth = isMobile ? 880 : 1040;
  const attemptColumns = {
    student: isMobile ? 260 : 290,
    exam: isMobile ? 190 : 230,
    score: 108,
    result: 102,
    status: 128,
    started: 136,
    action: 48,
  };
  const headerTextStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#64748B',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.2,
  };

  const getAnswerQuestionLabel = (answer: ExamAttemptDetail["answers"][number]) => {
    const text = answer.question_text?.trim();
    if (text) return text;
    return "[Enunciado em imagem]";
  };

  const getAnswerQuestion = (
    answer: ExamAttemptDetail["answers"][number]
  ): AttemptDetailQuestion | null => {
    return (
      detailQuestionsById[answer.question_id] ??
      answer.question ??
      null
    );
  };

  const getOptionLetter = (index: number) => String.fromCharCode(65 + index);

  const getOptionLabel = (option: ExamQuestionOption | null, fallbackIndex?: number) => {
    if (!option) return null;
    const letter = fallbackIndex != null ? getOptionLetter(fallbackIndex) : null;
    const text = option.option_text.trim();
    if (!letter) return text;
    if (text.toUpperCase() === letter) return letter;
    return `${letter} - ${text}`;
  };

  const getOptionDisplay = (label: string | null) => {
    if (!label) return { letter: null, text: null };
    const trimmed = label.trim();
    const match = trimmed.match(/^([A-Z])(?:\s*[-.)]\s*(.*))?$/i);
    if (!match) return { letter: null, text: trimmed };
    return {
      letter: match[1].toUpperCase(),
      text: match[2]?.trim() || null,
    };
  };

  const renderTablePill = (label: string, bg: string, color: string) => (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        alignSelf: "center",
        maxWidth: "100%",
      }}
    >
      <Text
        style={{ color, fontSize: 11, lineHeight: 14, fontWeight: "700" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  const getStatusPillColors = (status: string) => {
    if (status === "completed") return { bg: "#ECFDF5", color: "#047857" };
    if (status === "pending_review" || status === "in_progress") return { bg: "#F3F4F6", color: "#374151" };
    if (status === "awaiting_release") return { bg: "#ECFEFF", color: "#0E7490" };
    return { bg: "#F3F4F6", color: "#374151" };
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View className="flex-row items-center gap-3" style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={() => navigate("simulados")}
            className="p-2 rounded-xl bg-white border border-gray-200"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color="#374151" />
          </TouchableOpacity>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-gray-800">Tentativas</Text>
              {statusFilter ? (
                <View
                  className="px-2 py-0.5 rounded-lg"
                  style={{
                    backgroundColor:
                      statusFilter === "pending_review" ? "#FEF3C7" :
                      statusFilter === "awaiting_release" ? "#ECFEFF" :
                      statusFilter === "in_progress" ? "#FEF9C3" :
                      "#F0FDF4",
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color:
                        statusFilter === "pending_review" ? "#B45309" :
                        statusFilter === "awaiting_release" ? "#0E7490" :
                        statusFilter === "in_progress" ? "#92400E" :
                        "#065F46",
                    }}
                  >
                    {STATUS_LABEL[statusFilter] ?? statusFilter}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-sm text-gray-500">
              {statusFilter === "pending_review"
                ? "Respostas discursivas aguardando correção manual"
                : statusFilter === "awaiting_release"
                ? "Simulados corrigidos aguardando liberação do resultado"
                : statusFilter === "in_progress"
                ? "Alunos que estão realizando simulados agora"
                : statusFilter === "completed"
                ? "Simulados finalizados com resultado disponível"
                : "Histórico de tentativas dos alunos nos simulados"}
            </Text>
          </View>
        </View>
        {statusFilter && (
          <TouchableOpacity
            onPress={() => { setStatusFilter(""); setPage(1); }}
            className="flex-row items-center px-3 py-2 rounded-xl bg-white border border-gray-200"
            activeOpacity={0.7}
          >
            <Ionicons name="close-outline" size={16} color="#6B7280" />
            <Text className="text-sm text-gray-600 ml-1">Limpar filtro</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <select
          value={statusFilter}
          onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Todos os status</option>
          <option value="in_progress">Em andamento</option>
          <option value="pending_review">Aguardando correção</option>
          <option value="awaiting_release">Aguardando liberação</option>
          <option value="completed">Concluídas</option>
        </select>
      </View>

      {/* Tabela */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          width: "100%",
          minWidth: Math.max(tableMinWidth ?? 0, attemptsTableMinWidth),
          borderWidth: 1,
          borderColor: '#EEF2F7',
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text style={[headerTextStyle, { width: attemptColumns.student }]}>
            Aluno
          </Text>
          <Text style={[headerTextStyle, { width: attemptColumns.exam }]}>
            Simulado
          </Text>
          <Text style={[headerTextStyle, { width: attemptColumns.score, textAlign: "center" }]}>
            Pontuação
          </Text>
          <Text style={[headerTextStyle, { width: attemptColumns.result, textAlign: "center" }]}>
            Resultado
          </Text>
          <Text style={[headerTextStyle, { width: attemptColumns.status, textAlign: "center" }]}>
            Status
          </Text>
          <Text style={[headerTextStyle, { width: attemptColumns.started }]}>
            Início
          </Text>
          <View style={{ width: attemptColumns.action }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center gap-2">
            <Ionicons name="time-outline" size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400">Nenhuma tentativa encontrada</Text>
          </View>
        ) : (
          rows.map((a, i) => (
            <View
              key={a.id}
              className={`flex-row items-center px-4 py-2.5 ${i < rows.length - 1 ? "border-b border-gray-50" : ""}`}
              style={{ minHeight: 58 }}
            >
              <View style={{ width: attemptColumns.student, paddingRight: 18 }}>
                <Text
                  className="font-semibold text-gray-800"
                  style={{ fontSize: 13, lineHeight: 17 }}
                  numberOfLines={1}
                >
                  {a.student?.name ?? "—"}
                </Text>
                <Text className="text-gray-400" style={{ fontSize: 11, lineHeight: 15 }}>
                  {a.student?.enrollment_number ?? "—"}
                </Text>
              </View>
              <View style={{ width: attemptColumns.exam, paddingRight: 18 }}>
                <Text
                  className="text-gray-700"
                  style={{ fontSize: 13, lineHeight: 17 }}
                  numberOfLines={1}
                >
                  {a.exam?.title ?? "Simulado removido"}
                </Text>
              </View>
              <View style={{ width: attemptColumns.score, alignItems: "center" }}>
                {a.status === "completed" ? (
                  <>
                    <Text className="font-bold text-gray-800" style={{ fontSize: 13, lineHeight: 16 }}>
                      {a.score?.toFixed(1) ?? "—"} / {a.max_score.toFixed(1)}
                    </Text>
                    <Text className="text-gray-400" style={{ fontSize: 11, lineHeight: 15 }}>{fmtPct(a.percentage)}</Text>
                  </>
                ) : a.status === "pending_review" ? (
                  <Text className="text-amber-500 text-center" style={{ fontSize: 11, lineHeight: 15 }}>
                    {a.pending_answers_count ? `${a.pending_answers_count} pendente${a.pending_answers_count !== 1 ? "s" : ""}` : "Pendente"}
                  </Text>
                ) : a.status === "awaiting_release" ? (
                  <Text className="text-center" style={{ color: '#0891B2', fontSize: 11, lineHeight: 15 }}>
                    Aguardando liberação
                  </Text>
                ) : (
                  <Text className="text-gray-400" style={{ fontSize: 13 }}>—</Text>
                )}
              </View>
              <View style={{ width: attemptColumns.result, alignItems: "center" }}>
                {a.status === "completed" && typeof a.passed === "boolean" ? (
                  renderTablePill(
                    a.passed ? "Aprovado" : "Reprovado",
                    a.passed ? "#ECFDF5" : "#FEF2F2",
                    a.passed ? "#047857" : "#B91C1C",
                  )
                ) : (
                  <Text className="text-gray-400" style={{ fontSize: 13 }}>—</Text>
                )}
              </View>
              <View style={{ width: attemptColumns.status, alignItems: "center" }}>
                {(() => {
                  const colors = getStatusPillColors(a.status);
                  return renderTablePill(STATUS_LABEL[a.status] ?? a.status, colors.bg, colors.color);
                })()}
              </View>
              <View style={{ width: attemptColumns.started, paddingLeft: 8 }}>
                <Text className="text-gray-500" style={{ fontSize: 12, lineHeight: 16 }}>
                  {fmtDate(a.started_at)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => openDetail(a.id)}
                className="rounded-lg bg-violet-50"
                activeOpacity={0.7}
                style={{
                  width: attemptColumns.action,
                  height: 34,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="eye-outline" size={15} color="#7C3AED" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      </ScrollView>

      {/* Paginação */}
      {meta.last_page > 1 && (
        <View className="mt-4">
          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onPageChange={setPage}
          />
        </View>
      )}

      {!loading && (
        <Text className="text-xs text-gray-400 mt-3 text-center">
          {meta.total} tentativa{meta.total !== 1 ? "s" : ""} encontrada{meta.total !== 1 ? "s" : ""}
        </Text>
      )}

      {/* Modal de detalhe */}
      <Modal
        visible={detailId !== null}
        title="Detalhes da Tentativa"
        onClose={() => setDetailId(null)}
        size="lg"
      >
        {loadingDetail ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : detail ? (() => {
          const allCorrected = detail.answers.every(a => a.is_correct !== null);
          return (
            <View>
              {/* Info principal */}
              <View
                style={{
                  marginBottom: 20,
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                }}
              >
                {/* Título */}
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 }}>
                  {detail.exam?.title ?? "Simulado removido"}
                </Text>

                {/* Aluno */}
                <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
                  {detail.student?.name ?? "—"}
                  {detail.student?.enrollment_number ? (
                    <Text style={{ color: '#9CA3AF' }}>{` · ${detail.student.enrollment_number}`}</Text>
                  ) : null}
                </Text>

                {/* Badges de status e resultado */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <Badge
                    label={STATUS_LABEL[detail.status] ?? detail.status}
                    slug={STATUS_SLUG[detail.status] ?? "default"}
                  />
                  {detail.status === "completed" && typeof detail.passed === "boolean" && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: detail.passed ? '#DCFCE7' : '#FEE2E2',
                        borderWidth: 1,
                        borderColor: detail.passed ? '#86EFAC' : '#FECACA',
                      }}
                    >
                      <Ionicons
                        name={detail.passed ? "checkmark-circle" : "close-circle"}
                        size={14}
                        color={detail.passed ? "#16A34A" : "#DC2626"}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: detail.passed ? '#15803D' : '#DC2626' }}>
                        {detail.passed ? "Aprovado" : "Reprovado"}
                      </Text>
                    </View>
                  )}
                  {(detail.status === "pending_review" || detailNeedsCorrection) && !allCorrected && (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: '#FEF3C7',
                        borderWidth: 1,
                        borderColor: '#FDE68A',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#B45309' }}>
                        {detail.pending_answers_count ?? detail.answers.filter(a => a.is_correct === null).length} pendente
                        {(detail.pending_answers_count ?? 1) !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Pontuação */}
                {detail.status === "completed" && detail.percentage !== null && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#fff',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="star-outline" size={15} color="#7C3AED" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                      {detail.score?.toFixed(1)} / {detail.max_score.toFixed(1)} pts
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>·</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#7C3AED' }}>
                      {fmtPct(detail.percentage)}
                    </Text>
                  </View>
                )}

                {/* Datas */}
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="play-circle-outline" size={14} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      Início: <Text style={{ color: '#374151', fontWeight: '500' }}>{fmtDate(detail.started_at)}</Text>
                    </Text>
                  </View>
                  {detail.finished_at && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="flag-outline" size={14} color="#9CA3AF" />
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>
                        Término: <Text style={{ color: '#374151', fontWeight: '500' }}>{fmtDate(detail.finished_at)}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="border-t border-gray-100 mb-4" />

              {/* Respostas */}
              {detail.answers.length > 0 && (
                <View>
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Respostas
                  </Text>
                  {detail.answers.map((ans, idx) => {
                    const needsReview = ans.is_correct === null;
                    const isCorreta   = ans.is_correct === true;
                    const isErrada    = ans.is_correct === false;
                    const question = getAnswerQuestion(ans) as any;
                    const imageUrl = question?.image_url ?? ans.image_url ?? ans.question_image_url ?? ans.question?.image_url ?? null;
                    const questionOptions = (question?.options ?? []) as ExamQuestionOption[];
                    const selectedOption = questionOptions.find((option: ExamQuestionOption) => option.id != null && option.id === ans.option_id)
                      ?? questionOptions.find((option: ExamQuestionOption) => option.option_text === ans.option_text)
                      ?? null;
                    const selectedOptionIndex = selectedOption ? questionOptions.findIndex((option: ExamQuestionOption) => option === selectedOption) : -1;
                    const correctOption = questionOptions.find((option: ExamQuestionOption) => option.is_correct) ?? null;
                    const correctOptionIndex = correctOption ? questionOptions.findIndex((option: ExamQuestionOption) => option === correctOption) : -1;
                    const selectedLabel = selectedOption
                      ? getOptionLabel(selectedOption, selectedOptionIndex >= 0 ? selectedOptionIndex : undefined)
                      : ans.option_id != null && ans.option_text
                        ? ans.option_text
                        : null;
                    const correctLabel = correctOption
                      ? getOptionLabel(correctOption, correctOptionIndex >= 0 ? correctOptionIndex : undefined)
                      : null;
                    const selectedDisplay = getOptionDisplay(selectedLabel);
                    const correctDisplay = getOptionDisplay(correctLabel);
                    const statusColor = isCorreta ? '#16A34A' : isErrada ? '#EF4444' : '#F59E0B';
                    return (
                      <View
                        key={ans.question_id}
                        style={{
                          marginBottom: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderLeftWidth: 4,
                          borderColor: '#E5E7EB',
                          borderLeftColor: statusColor,
                          backgroundColor: '#FFFFFF',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Cabeçalho da questão */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            padding: 12,
                            paddingBottom: 8,
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              minWidth: 22,
                              marginTop: 1,
                              color: statusColor,
                            }}
                          >
                            {idx + 1}.
                          </Text>
                          <View style={{ flex: 1, gap: 8 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: '600',
                                lineHeight: 20,
                                color: '#1F2937',
                              }}
                            >
                              {getAnswerQuestionLabel(ans)}
                            </Text>
                            {imageUrl ? (
                              <View
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#E5E7EB',
                                  borderRadius: 12,
                                  overflow: 'hidden',
                                  backgroundColor: '#F8FAFC',
                                }}
                              >
                                <Image
                                  source={{ uri: imageUrl }}
                                  style={{ width: '100%', height: 180, backgroundColor: '#F3F4F6' }}
                                  resizeMode="contain"
                                />
                              </View>
                            ) : null}
                          </View>
                          {!needsReview && (
                            <Ionicons
                              name={isCorreta ? "checkmark-circle" : "close-circle"}
                              size={22}
                              color={isCorreta ? "#16A34A" : "#DC2626"}
                            />
                          )}
                        </View>

                        {/* Resposta */}
                        <View
                          style={{
                            marginHorizontal: 12,
                            marginBottom: 12,
                            marginLeft: 42,
                            borderTopWidth: 1,
                            borderTopColor: '#EEF2F7',
                            paddingTop: 12,
                          }}
                        >
                          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 8 }}>
                            <View
                              style={{
                                flex: 1,
                                minWidth: 0,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: isErrada ? '#FECACA' : isCorreta ? '#BBF7D0' : '#E0E7FF',
                                backgroundColor: isErrada ? '#FFF7F7' : isCorreta ? '#F7FEF9' : '#F8FAFF',
                                padding: 12,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <View
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 999,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: isErrada ? '#FEE2E2' : isCorreta ? '#DCFCE7' : '#E0E7FF',
                                  }}
                                >
                                  <Ionicons
                                    name={isErrada ? "close" : isCorreta ? "checkmark" : "ellipse-outline"}
                                    size={14}
                                    color={isErrada ? "#DC2626" : isCorreta ? "#16A34A" : "#4F46E5"}
                                  />
                                </View>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                                  Opção marcada
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                {selectedDisplay.letter && (
                                  <View
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 10,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: isErrada ? '#DC2626' : isCorreta ? '#16A34A' : '#6366F1',
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                                      {selectedDisplay.letter}
                                    </Text>
                                  </View>
                                )}
                                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#334155' }}>
                                  {selectedDisplay.text ?? "Alternativa selecionada"}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                flex: 1,
                                minWidth: 0,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: '#DDD6FE',
                                backgroundColor: '#FAF7FF',
                                padding: 12,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <View
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 999,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#EDE9FE',
                                  }}
                                >
                                  <Ionicons name="ribbon-outline" size={14} color="#7C3AED" />
                                </View>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#6D28D9', textTransform: 'uppercase' }}>
                                  Gabarito
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                {correctDisplay.letter && (
                                  <View
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 10,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: '#7C3AED',
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                                      {correctDisplay.letter}
                                    </Text>
                                  </View>
                                )}
                                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#5B21B6' }}>
                                  {correctDisplay.text ?? "Resposta correta"}
                                </Text>
                              </View>
                            </View>
                          </View>
                          {ans.text_answer != null && (
                            <View
                              style={{
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: '#E5E7EB',
                                backgroundColor: '#F8FAFC',
                                padding: 10,
                                marginBottom: 8,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 }}>
                                Resposta discursiva
                              </Text>
                              <Text style={{ fontSize: 13, lineHeight: 18, color: '#334155', fontStyle: 'italic' }}>
                                "{ans.text_answer}"
                              </Text>
                            </View>
                          )}
                          {ans.option_id == null && ans.text_answer == null && (
                            <View
                              style={{
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: '#E5E7EB',
                                backgroundColor: '#F8FAFC',
                                padding: 10,
                              }}
                            >
                              <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '600' }}>Não respondida</Text>
                            </View>
                          )}
                          {!needsReview && ans.points_earned != null && (
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 999,
                                  backgroundColor: isCorreta ? '#DCFCE7' : '#FEE2E2',
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '800', color: isCorreta ? '#15803D' : '#DC2626' }}>
                                  +{ans.points_earned.toFixed(1)} pts
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Botões de correção manual */}
                          {needsReview && (
                            <View className="mt-2 flex-row gap-2">
                              <TouchableOpacity
                                onPress={() => correctAnswer(ans.id, true)}
                                disabled={correctingId === ans.id}
                                className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg"
                                style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' }}
                                activeOpacity={0.7}
                              >
                                {correctingId === ans.id
                                  ? <ActivityIndicator size="small" color="#16A34A" />
                                  : <Ionicons name="checkmark" size={14} color="#16A34A" />
                                }
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#15803D', marginLeft: 4 }}>Correto</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => correctAnswer(ans.id, false)}
                                disabled={correctingId === ans.id}
                                className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg"
                                style={{ backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' }}
                                activeOpacity={0.7}
                              >
                                {correctingId === ans.id
                                  ? <ActivityIndicator size="small" color="#DC2626" />
                                  : <Ionicons name="close" size={14} color="#DC2626" />
                                }
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626', marginLeft: 4 }}>Incorreto</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Botão Finalizar correção */}
              {detailNeedsCorrection && allCorrected && (
                <TouchableOpacity
                  onPress={() => { setDetailId(null); fetchAttempts(); }}
                  style={{ marginTop: 8, backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Finalizar correção</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })() : null}
      </Modal>
    </ScrollView>
  );
}
