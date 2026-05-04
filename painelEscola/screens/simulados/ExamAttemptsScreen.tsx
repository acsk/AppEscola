import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";

// ── Types ─────────────────────────────────────────────────────────────────────

type Attempt = {
  id: number;
  status: "in_progress" | "completed";
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number;
  percentage: number | null;
  passed: boolean | null;
  exam: { id: number; title: string };
  student: { id: number; name: string; enrollment_number: string | null };
};

type AttemptDetail = Attempt & {
  answers: {
    question_id: number;
    question_text: string;
    type: "multiple_choice" | "essay";
    option_id: number | null;
    option_text: string | null;
    text_answer: string | null;
    is_correct: boolean | null;
    points_earned: number | null;
  }[];
};

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in_progress: "Em andamento",
  completed: "Concluída",
};

const STATUS_SLUG: Record<string, string> = {
  in_progress: "warning",
  completed: "active",
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExamAttemptsScreen({ navigate }: Props) {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/exam-attempts", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/exam-attempts/${id}`);
      setDetail(data);
    } catch {}
    setLoadingDetail(false);
  };

  const selectStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 14,
    color: "#374151",
    backgroundColor: "white",
    height: 44,
    minWidth: 160,
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => navigate("simulados")}
            className="p-2 rounded-xl bg-white border border-gray-200"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color="#374151" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-gray-800">Tentativas</Text>
            <Text className="text-sm text-gray-500">
              Histórico de tentativas dos alunos nos simulados
            </Text>
          </View>
        </View>
      </View>

      {/* Filtros */}
      <View className="flex-row gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Todos os status</option>
          <option value="in_progress">Em andamento</option>
          <option value="completed">Concluídas</option>
        </select>
      </View>

      {/* Tabela */}
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>
            Aluno
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>
            Simulado
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 100, textAlign: "center" }}>
            Pontuação
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 90, textAlign: "center" }}>
            Resultado
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 120, textAlign: "center" }}>
            Status
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>
            Início
          </Text>
          <View style={{ width: 48 }} />
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
              className={`flex-row items-center px-4 py-3 ${i < rows.length - 1 ? "border-b border-gray-50" : ""}`}
            >
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-medium text-gray-800">{a.student.name}</Text>
                <Text className="text-xs text-gray-400">{a.student.enrollment_number ?? "—"}</Text>
              </View>
              <View style={{ flex: 2 }}>
                <Text className="text-sm text-gray-700" numberOfLines={1}>{a.exam.title}</Text>
              </View>
              <View style={{ width: 100, alignItems: "center" }}>
                {a.status === "completed" ? (
                  <>
                    <Text className="text-sm font-semibold text-gray-800">
                      {a.score?.toFixed(1) ?? "—"} / {a.max_score.toFixed(1)}
                    </Text>
                    <Text className="text-xs text-gray-400">{fmtPct(a.percentage)}</Text>
                  </>
                ) : (
                  <Text className="text-sm text-gray-400">—</Text>
                )}
              </View>
              <View style={{ width: 90, alignItems: "center" }}>
                {a.status === "completed" && a.passed !== null ? (
                  <Badge
                    label={a.passed ? "Aprovado" : "Reprovado"}
                    variant={a.passed ? "success" : "error"}
                  />
                ) : (
                  <Text className="text-sm text-gray-400">—</Text>
                )}
              </View>
              <View style={{ width: 120, alignItems: "center" }}>
                <Badge
                  label={STATUS_LABEL[a.status] ?? a.status}
                  slug={STATUS_SLUG[a.status] ?? "default"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-xs text-gray-500">{fmtDate(a.started_at)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => openDetail(a.id)}
                className="p-2 rounded-lg bg-violet-50"
                activeOpacity={0.7}
                style={{ width: 48, alignItems: "center" }}
              >
                <Ionicons name="eye-outline" size={15} color="#7C3AED" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

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
        ) : detail ? (
          <View>
            {/* Resumo */}
            <View className="flex-row gap-4 mb-5 flex-wrap">
              <View className="flex-1 bg-gray-50 rounded-xl p-4" style={{ minWidth: 120 }}>
                <Text className="text-xs text-gray-400 mb-1">Aluno</Text>
                <Text className="text-sm font-semibold text-gray-800">{detail.student.name}</Text>
                <Text className="text-xs text-gray-400">{detail.student.enrollment_number ?? "—"}</Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-xl p-4" style={{ minWidth: 120 }}>
                <Text className="text-xs text-gray-400 mb-1">Simulado</Text>
                <Text className="text-sm font-semibold text-gray-800">{detail.exam.title}</Text>
              </View>
              {detail.status === "completed" && (
                <View
                  className="rounded-xl p-4 items-center"
                  style={{
                    minWidth: 120,
                    backgroundColor: detail.passed ? "#ECFDF5" : "#FEF2F2",
                  }}
                >
                  <Text className="text-xs text-gray-400 mb-1">Resultado</Text>
                  <Text
                    className="text-lg font-bold"
                    style={{ color: detail.passed ? "#065F46" : "#991B1B" }}
                  >
                    {fmtPct(detail.percentage)}
                  </Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: detail.passed ? "#065F46" : "#991B1B" }}
                  >
                    {detail.passed ? "Aprovado" : "Reprovado"}
                  </Text>
                </View>
              )}
            </View>

            {/* Datas */}
            <View className="flex-row gap-3 mb-5">
              <Text className="text-xs text-gray-400">
                Início: <Text className="text-gray-600">{fmtDate(detail.started_at)}</Text>
              </Text>
              {detail.finished_at && (
                <Text className="text-xs text-gray-400">
                  · Término: <Text className="text-gray-600">{fmtDate(detail.finished_at)}</Text>
                </Text>
              )}
            </View>

            {/* Respostas */}
            {detail.answers.length > 0 && (
              <View>
                <Text className="text-sm font-bold text-gray-700 mb-3">Respostas</Text>
                {detail.answers.map((ans, idx) => (
                  <View
                    key={ans.question_id}
                    className="mb-3 p-4 rounded-xl"
                    style={{
                      backgroundColor:
                        ans.is_correct === true
                          ? "#F0FDF4"
                          : ans.is_correct === false
                          ? "#FFF1F2"
                          : "#F9FAFB",
                    }}
                  >
                    <View className="flex-row items-start gap-2 mb-2">
                      <View
                        className="rounded-md items-center justify-center"
                        style={{ width: 24, height: 24, backgroundColor: "#E5E7EB", flexShrink: 0 }}
                      >
                        <Text className="text-xs font-bold text-gray-600">{idx + 1}</Text>
                      </View>
                      <Text className="text-sm text-gray-700 flex-1">{ans.question_text}</Text>
                    </View>
                    {ans.type === "multiple_choice" ? (
                      <View>
                        {/* Opção selecionada (quando presente) */}
                        {ans.option_id != null && (
                          <View className="flex-row items-center gap-2 mb-1">
                            <Ionicons
                              name={ans.is_correct ? "checkmark-circle" : ans.is_correct === false ? "close-circle" : "help-circle-outline"}
                              size={16}
                              color={ans.is_correct ? "#16A34A" : ans.is_correct === false ? "#DC2626" : "#9CA3AF"}
                            />
                            <Text className="text-sm text-gray-600 flex-1">{ans.option_text ?? "—"}</Text>
                            {ans.points_earned != null && (
                              <Text className="text-xs text-gray-400">
                                +{ans.points_earned.toFixed(1)} pts
                              </Text>
                            )}
                          </View>
                        )}
                        {/* Justificativa/fallback textual (quando presente) */}
                        {ans.text_answer != null && (
                          <View className="mt-1">
                            <Text className="text-xs text-gray-400 mb-0.5">
                              {ans.option_id != null ? "Especifique:" : "Resposta textual:"}
                            </Text>
                            <Text className="text-sm text-gray-600 italic">{ans.text_answer}</Text>
                          </View>
                        )}
                        {/* Sem opção nem texto */}
                        {ans.option_id == null && ans.text_answer == null && (
                          <Text className="text-sm text-gray-400">Não respondida</Text>
                        )}
                        {/* Pendente de correção manual (sem option_id, só text_answer) */}
                        {ans.option_id == null && ans.is_correct === null && ans.text_answer != null && (
                          <Text className="text-xs text-orange-500 mt-1">Aguardando correção manual</Text>
                        )}
                      </View>
                    ) : (
                      <View>
                        <Text className="text-xs text-gray-400 mb-1">Resposta discursiva:</Text>
                        <Text className="text-sm text-gray-600 italic">
                          {ans.text_answer ?? <Text className="text-gray-400">Não respondida</Text>}
                        </Text>
                        <Text className="text-xs text-gray-400 mt-1">
                          {ans.is_correct === null ? "Aguardando correção manual" : `+${ans.points_earned?.toFixed(1)} pts`}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </Modal>
    </ScrollView>
  );
}
