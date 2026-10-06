import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import type {
  AcademicHistoryAttempt,
  AcademicHistoryReviewQuestion,
  AcademicHistoryStudent,
} from "../../types/academicHistory";

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: "Em andamento",
  pending_review: "Aguardando correção",
  awaiting_release: "Aguardando liberação",
  completed: "Concluído",
  abandoned: "Abandonado",
};

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
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

type Props = {
  visible: boolean;
  student: AcademicHistoryStudent | null;
  attempt: AcademicHistoryAttempt | null;
  onClose: () => void;
  onExportPdf: () => void;
  exporting?: boolean;
};

function QuestionBlock({
  question,
  index,
}: {
  question: AcademicHistoryReviewQuestion;
  index: number;
}) {
  const isCorrect = question.correction?.is_correct === true;
  const isWrong = question.correction?.is_correct === false;
  const pending = question.correction?.is_correct == null;
  const options = [...(question.options ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const borderTone = isCorrect
    ? "border-success bg-success-tint/40"
    : isWrong
      ? "border-danger bg-danger-tint/40"
      : pending
        ? "border-warning bg-warning-tint/40"
        : "border-border bg-surface";

  return (
    <View className={`rounded-ds-md border px-3 py-3 ${borderTone}`}>
      <View className="flex-row items-start gap-2 mb-2">
        <Text className="text-sm font-semibold text-ink">{index + 1}.</Text>
        <Text className="flex-1 text-sm text-ink">{question.question_text || "—"}</Text>
        <View
          className={`px-2 py-0.5 rounded-full ${
            isCorrect
              ? "bg-success-tint"
              : isWrong
                ? "bg-danger-tint"
                : pending
                  ? "bg-warning-tint"
                  : "bg-surface-sunken"
          }`}
        >
          <Text
            className={`text-[11px] font-semibold ${
              isCorrect
                ? "text-success"
                : isWrong
                  ? "text-danger"
                  : pending
                    ? "text-warning"
                    : "text-ink-muted"
            }`}
          >
            {isCorrect
              ? "Correta"
              : isWrong
                ? "Incorreta"
                : pending
                  ? "Em correção"
                  : "—"}
          </Text>
        </View>
      </View>

      {question.type === "multiple_choice" || options.length > 0 ? (
        <View className="gap-1.5 mt-1">
          {options.map((op, opIdx) => {
            const selected = !!op.selected;
            const correct = op.is_correct === true;
            const wrongSelected = selected && op.is_correct === false;
            const tone = correct
              ? "border-success bg-success-tint"
              : wrongSelected
                ? "border-danger bg-danger-tint"
                : selected
                  ? "border-border bg-brand-tint"
                  : "border-border bg-surface";

            return (
              <View
                key={op.id}
                className={`flex-row items-start gap-2 rounded-ds-md border px-2.5 py-2 ${tone}`}
              >
                <View
                  className={`w-5 h-5 rounded-full items-center justify-center mt-0.5 ${
                    correct
                      ? "bg-emerald-600"
                      : wrongSelected
                        ? "bg-danger"
                        : selected
                          ? "bg-brand"
                          : "bg-border"
                  }`}
                >
                  {correct || wrongSelected ? (
                    <Ionicons
                      name={correct ? "checkmark" : "close"}
                      size={12}
                      color="var(--ds-on-brand)"
                    />
                  ) : selected ? (
                    <View className="w-2 h-2 rounded-full bg-surface" />
                  ) : null}
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-sm ${
                      correct
                        ? "text-success font-semibold"
                        : wrongSelected
                          ? "text-danger font-semibold"
                          : selected
                            ? "text-brand font-semibold"
                            : "text-ink"
                    }`}
                  >
                    {optionLetter(opIdx)}) {op.option_text}
                  </Text>
                  {correct || selected ? (
                    <Text className="text-[11px] text-ink-muted mt-0.5">
                      {[
                        selected ? "Marcada pelo aluno" : null,
                        correct ? "Resposta correta" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {question.student_answer?.text_answer ? (
        <View className="mt-2 rounded-ds-md border border-border bg-surface px-2.5 py-2">
          <Text className="text-[11px] font-semibold text-ink-muted uppercase">Texto enviado</Text>
          <Text className="text-sm text-ink mt-0.5">
            {question.student_answer.text_answer}
          </Text>
        </View>
      ) : null}

      {!question.student_answer?.option_id && !question.student_answer?.text_answer ? (
        <Text className="text-xs text-ink-muted mt-2">Sem resposta do aluno.</Text>
      ) : null}

      {question.correction?.points_earned != null || question.points != null ? (
        <Text className="text-[11px] text-ink-muted mt-2">
          Pontuação:{" "}
          {question.correction?.points_earned != null &&
          question.correction?.max_points != null
            ? `${question.correction.points_earned}/${question.correction.max_points}`
            : `${question.points ?? 0}`}{" "}
          pts
        </Text>
      ) : null}
    </View>
  );
}

export default function StudentAttemptReviewModal({
  visible,
  student,
  attempt,
  onClose,
  onExportPdf,
  exporting = false,
}: Props) {
  if (!attempt || !student) return null;

  const questions = [...(attempt.questions ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  return (
    <Modal
      visible={visible}
      title={attempt.exam?.title || `Simulado #${attempt.exam_id}`}
      onClose={onClose}
      size="xl"
      footer={
        <View className="flex-row justify-end gap-2">
          <TouchableOpacity
            onPress={onClose}
            className="px-4 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            <Text className="text-sm font-semibold text-ink">Fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onExportPdf}
            disabled={exporting}
            className="flex-row items-center px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
            style={{ opacity: exporting ? 0.65 : 1 }}
            activeOpacity={0.85}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="var(--ds-on-brand)" />
            ) : (
              <Ionicons name="download-outline" size={16} color="var(--ds-on-brand)" />
            )}
            <Text className="text-sm font-medium text-on-brand ml-1.5">Gerar PDF</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-ink">{student.name}</Text>
          {student.enrollment_number ? (
            <Text className="text-xs font-mono font-semibold text-brand">
              Matrícula {student.enrollment_number}
            </Text>
          ) : null}
          <Badge
            slug={attempt.status ?? "completed"}
            label={
              ATTEMPT_STATUS_LABELS[attempt.status ?? ""] ?? attempt.status ?? "—"
            }
          />
        </View>
        <Text className="text-xs text-ink-muted">
          {attempt.exam?.subject?.name ?? "Sem disciplina"}
          {attempt.exam?.exam_type_label ? ` · ${attempt.exam.exam_type_label}` : ""}
        </Text>
        <Text className="text-xs text-ink-muted">
          Entrega: {fmtDateTime(attempt.finished_at ?? attempt.started_at)}
          {attempt.score_display ? ` · Nota ${attempt.score_display}` : ""}
          {attempt.percentage != null ? ` · ${fmtPct(attempt.percentage)}` : ""}
          {attempt.passed == null
            ? ""
            : attempt.passed
              ? " · Aprovado"
              : " · Reprovado"}
        </Text>
      </View>

      {questions.length === 0 ? (
        <View className="items-center py-10">
          <Ionicons name="document-text-outline" size={36} color="var(--ds-border)" />
          <Text className="text-sm text-ink-subtle mt-2">
            Sem detalhamento de questões nesta tentativa.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {questions.map((question, index) => (
            <QuestionBlock key={question.id} question={question} index={index} />
          ))}
        </View>
      )}
    </Modal>
  );
}
