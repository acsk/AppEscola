import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import Badge from "../../components/ui/Badge";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fetchStudentAcademicHistory } from "../../services/studentAcademicHistory";
import type {
  AcademicHistoryAttempt,
  AcademicHistoryEnrollment,
  StudentAcademicHistory,
} from "../../types/academicHistory";
import type { StudentAcademicHistoryScreenProps } from "../../types/alunos";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { isoToDisplay, maskCPF, maskPhone } from "../../utils/masks";
import { exportStudentAcademicHistoryPdf } from "../../utils/studentAcademicHistoryPdf";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: "Em andamento",
  pending_review: "Aguardando correção",
  awaiting_release: "Aguardando liberação",
  completed: "Concluído",
  abandoned: "Abandonado",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  inactive: "Inativa",
  cancelled: "Cancelada",
  completed: "Concluída",
  suspended: "Suspensa",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return isoToDisplay(iso.slice(0, 10));
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtPct(value?: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function enrollmentCourses(enrollment: AcademicHistoryEnrollment): string {
  if (enrollment.courses?.length) {
    return enrollment.courses.map((c) => c.name).join(", ");
  }
  return enrollment.course?.name ?? "—";
}

function enrollmentClasses(enrollment: AcademicHistoryEnrollment): string {
  if (enrollment.school_classes?.length) {
    return enrollment.school_classes.map((c) => c.name).join(", ");
  }
  return enrollment.school_class?.name ?? "—";
}

export default function StudentAcademicHistoryScreen({
  navigate,
  studentId,
  studentName,
}: StudentAcademicHistoryScreenProps) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StudentAcademicHistory | null>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudentAcademicHistory(studentId);
      setHistory(data);
    } catch (err) {
      setHistory(null);
      setError(getApiErrorMessage(err, "Não foi possível carregar o histórico acadêmico."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = history?.student?.name || studentName || `Aluno #${studentId}`;

  const breadcrumb = useMemo(
    () => [
      { label: "Alunos", onPress: () => navigate("alunos") },
      {
        label: displayName,
        onPress: () => navigate("alunos-form", { studentId }),
      },
      { label: "Histórico acadêmico" },
    ],
    [displayName, navigate, studentId]
  );

  const handleExportPdf = async () => {
    if (!history) return;
    setExporting(true);
    try {
      await exportStudentAcademicHistoryPdf(history);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível gerar o PDF."));
    } finally {
      setExporting(false);
    }
  };

  const renderAttemptDetail = (attempt: AcademicHistoryAttempt) => {
    const answers = [...(attempt.answers ?? [])].sort(
      (a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)
    );

    if (answers.length === 0) {
      return (
        <Text className="text-xs text-gray-500 px-3 py-2">
          Sem respostas detalhadas para esta tentativa.
        </Text>
      );
    }

    return (
      <View className="gap-2 px-3 pb-3">
        {answers.map((answer, index) => {
          const tone =
            answer.is_correct === true
              ? "border-emerald-200 bg-emerald-50"
              : answer.is_correct === false
                ? "border-red-200 bg-red-50"
                : "border-gray-200 bg-gray-50";
          return (
            <View key={answer.id} className={`rounded-xl border px-3 py-2 ${tone}`}>
              <Text className="text-xs font-bold text-gray-800">
                {index + 1}. {answer.question_text || `Questão #${answer.question_id}`}
              </Text>
              <Text className="text-xs text-gray-600 mt-1">
                Resposta:{" "}
                {answer.option_text ||
                  answer.text_answer ||
                  (answer.option_id != null ? `Opção #${answer.option_id}` : "—")}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {answer.is_correct == null
                  ? "Correção pendente"
                  : answer.is_correct
                    ? "Correta"
                    : "Incorreta"}
                {answer.points_earned != null
                  ? ` · ${answer.points_earned} pt(s)`
                  : answer.points != null
                    ? ` · ${answer.points} pt(s)`
                    : ""}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
    >
      <ScreenBreadcrumb items={breadcrumb} />

      <View
        className="mb-5"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text className="text-2xl font-bold text-gray-800">Histórico acadêmico</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            Cursos, turmas e resultados completos dos simulados online
          </Text>
        </View>
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={load}
            className="flex-row items-center justify-center bg-white border border-gray-200 px-4 py-2.5 rounded-xl"
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={16} color="#4B5563" />
            <Text className="text-sm font-semibold text-gray-700 ml-1.5">Atualizar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportPdf}
            disabled={!history || exporting}
            className="flex-row items-center justify-center bg-violet-600 px-4 py-2.5 rounded-xl"
            style={{ opacity: !history || exporting ? 0.6 : 1 }}
            activeOpacity={0.85}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={16} color="#fff" />
            )}
            <Text className="text-sm font-semibold text-white ml-1.5">Gerar PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : error ? (
        <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-5">
          <Text className="text-sm text-red-700">{error}</Text>
          <TouchableOpacity
            onPress={load}
            className="mt-3 self-start px-3 py-2 rounded-lg bg-red-600"
          >
            <Text className="text-white text-sm font-semibold">Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : history ? (
        <View className="gap-4">
          <View className="bg-white border border-gray-200 rounded-2xl p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View style={{ flex: 1 }}>
                <Text className="text-lg font-bold text-gray-900">{history.student.name}</Text>
                {history.student.enrollment_number ? (
                  <Text className="text-xs font-mono font-semibold text-violet-600 mt-0.5">
                    Matrícula {history.student.enrollment_number}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                  <Text className="text-xs text-gray-500">
                    Documento:{" "}
                    {history.student.document ? maskCPF(history.student.document) : "—"}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    Nascimento: {fmtDate(history.student.birth_date)}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    E-mail: {history.student.email || "—"}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    Telefone:{" "}
                    {history.student.phone ? maskPhone(history.student.phone) : "—"}
                  </Text>
                </View>
              </View>
              {history.student.status ? (
                <Badge
                  slug={history.student.status}
                  label={
                    history.student.status === "active"
                      ? "Ativo"
                      : history.student.status === "inactive"
                        ? "Inativo"
                        : history.student.status
                  }
                />
              ) : null}
            </View>

            <View
              className="mt-4 gap-2"
              style={{ flexDirection: isMobile ? "column" : "row" }}
            >
              {[
                { label: "Matrículas", value: String(history.summary.enrollments_count) },
                {
                  label: "Ativas",
                  value: String(history.summary.active_enrollments_count),
                },
                {
                  label: "Simulados",
                  value: String(history.summary.attempts_count),
                },
                {
                  label: "Média",
                  value: fmtPct(history.summary.average_percentage),
                },
                {
                  label: "Aprovados",
                  value: `${history.summary.passed_count}/${history.summary.completed_attempts_count}`,
                },
              ].map((card) => (
                <View
                  key={card.label}
                  className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5"
                >
                  <Text className="text-[11px] uppercase font-bold text-gray-500 tracking-wide">
                    {card.label}
                  </Text>
                  <Text className="text-base font-bold text-gray-900 mt-0.5">{card.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <View className="px-4 py-3 border-b border-gray-100">
              <Text className="text-sm font-bold text-gray-900">Cursos e turmas</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Histórico de matrículas do aluno
              </Text>
            </View>
            {history.enrollments.length === 0 ? (
              <View className="items-center py-10 px-4">
                <Ionicons name="school-outline" size={32} color="#E5E7EB" />
                <Text className="text-sm text-gray-400 mt-2">Nenhuma matrícula encontrada</Text>
              </View>
            ) : (
              <>
                <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 0.9 }}>
                    Nº
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4 }}>
                    Curso(s)
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2 }}>
                    Turma(s)
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 1.1 }}>
                    Plano/Pacote
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8 }}>
                    Status
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>
                    Período
                  </Text>
                </View>
                {history.enrollments.map((enrollment, index) => (
                  <DataTableRow key={enrollment.id} index={index}>
                    <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 0.9 }} numberOfLines={1}>
                      {enrollment.enrollment_number ?? "—"}
                    </Text>
                    <Text className={TABLE_CELL} style={{ flex: 1.4 }} numberOfLines={2}>
                      {enrollmentCourses(enrollment)}
                    </Text>
                    <Text className={TABLE_CELL} style={{ flex: 1.2 }} numberOfLines={2}>
                      {enrollmentClasses(enrollment)}
                    </Text>
                    <Text className={TABLE_CELL_MUTED} style={{ flex: 1.1 }} numberOfLines={2}>
                      {enrollment.bundle?.name ?? enrollment.course_plan?.name ?? "—"}
                    </Text>
                    <View style={{ flex: 0.8 }}>
                      <Badge
                        slug={enrollment.status}
                        label={
                          ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status
                        }
                      />
                    </View>
                    <Text className={TABLE_CELL_MUTED} style={{ flex: 1 }} numberOfLines={2}>
                      {fmtDate(enrollment.start_date)} – {fmtDate(enrollment.end_date)}
                    </Text>
                  </DataTableRow>
                ))}
              </>
            )}
          </View>

          <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <View className="px-4 py-3 border-b border-gray-100">
              <Text className="text-sm font-bold text-gray-900">Simulados online</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Clique em uma tentativa para ver o detalhamento das respostas
              </Text>
            </View>
            {history.exam_attempts.length === 0 ? (
              <View className="items-center py-10 px-4">
                <Ionicons name="document-text-outline" size={32} color="#E5E7EB" />
                <Text className="text-sm text-gray-400 mt-2">Nenhum simulado encontrado</Text>
              </View>
            ) : (
              history.exam_attempts.map((attempt, index) => {
                const expanded = expandedAttemptId === attempt.id;
                return (
                  <View key={attempt.id} className="border-b border-gray-100">
                    <DataTableRow
                      index={index}
                      onPress={() =>
                        setExpandedAttemptId(expanded ? null : attempt.id)
                      }
                    >
                      <View style={{ flex: 1.8, paddingRight: 8 }}>
                        <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={2}>
                          {attempt.exam?.title ?? `Simulado #${attempt.exam_id}`}
                        </Text>
                        <Text className={TABLE_CELL_MUTED} numberOfLines={1}>
                          {attempt.exam?.subject?.name ?? "Sem disciplina"}
                          {attempt.exam?.exam_type_label
                            ? ` · ${attempt.exam.exam_type_label}`
                            : ""}
                        </Text>
                      </View>
                      <View style={{ flex: 0.9 }}>
                        <Badge
                          slug={attempt.status ?? "completed"}
                          label={
                            ATTEMPT_STATUS_LABELS[attempt.status ?? ""] ??
                            attempt.status ??
                            "—"
                          }
                        />
                      </View>
                      <Text className={TABLE_CELL} style={{ flex: 0.7 }} numberOfLines={1}>
                        {attempt.score_display ?? "—"}
                      </Text>
                      <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 0.6 }} numberOfLines={1}>
                        {fmtPct(attempt.percentage)}
                      </Text>
                      <Text className={TABLE_CELL} style={{ flex: 0.6 }} numberOfLines={1}>
                        {attempt.passed == null ? "—" : attempt.passed ? "Sim" : "Não"}
                      </Text>
                      <Text className={TABLE_CELL_MUTED} style={{ flex: 1 }} numberOfLines={2}>
                        {fmtDateTime(attempt.finished_at ?? attempt.started_at)}
                      </Text>
                      <View style={{ width: 28 }} className="items-center justify-center">
                        <Ionicons
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#9CA3AF"
                        />
                      </View>
                    </DataTableRow>
                    {expanded ? renderAttemptDetail(attempt) : null}
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
