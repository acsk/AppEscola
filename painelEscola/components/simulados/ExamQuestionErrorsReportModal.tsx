import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import DataTableRow from "../ui/DataTableRow";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../ui/dataTableStyles";
import {
  fetchExamQuestionErrorsReport,
  type ExamQuestionErrorsReport,
} from "../../services/examQuestionErrorsReport";
import { exportExamQuestionErrorsPdf } from "../../utils/examQuestionErrorsPdf";
import { showApiErrorToast } from "../../utils/apiErrors";

type ToastSetter = React.Dispatch<
  React.SetStateAction<{ visible: boolean; type: "success" | "error"; message: string }>
>;

type Props = {
  visible: boolean;
  examId: number | null;
  examTitle?: string | null;
  onClose: () => void;
  setToast?: ToastSetter;
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function errorTone(errorRate: number | null): string {
  if (errorRate == null) return "text-ink-subtle";
  if (errorRate >= 60) return "text-danger";
  if (errorRate >= 35) return "text-warning";
  return "text-success";
}

export default function ExamQuestionErrorsReportModal({
  visible,
  examId,
  examTitle,
  onClose,
  setToast,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState<ExamQuestionErrorsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || examId == null) {
      setReport(null);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchExamQuestionErrorsReport(examId);
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setError("Não foi possível carregar o relatório de erros por questão.");
          if (setToast) {
            showApiErrorToast(setToast, err, "Não foi possível carregar o relatório de erros.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, examId, setToast]);

  const handleExport = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      await exportExamQuestionErrorsPdf(report);
      setToast?.({
        visible: true,
        type: "success",
        message: "PDF de questões com mais erros gerado com sucesso.",
      });
    } catch (err) {
      if (setToast) {
        showApiErrorToast(setToast, err, "Não foi possível gerar o PDF.");
      }
    } finally {
      setExporting(false);
    }
  };

  const title = report?.exam.title || examTitle || "Simulado";

  return (
    <Modal
      visible={visible}
      title="Questões com mais erros"
      onClose={onClose}
      size="lg"
    >
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
          {title}
        </Text>
        {report && (
          <Text className="text-xs text-ink-muted mt-1">
            {report.summary.graded_students_count} aluno
            {report.summary.graded_students_count !== 1 ? "s" : ""} com resultado ·{" "}
            {report.summary.questions_with_errors}{" "}
            {report.summary.questions_with_errors !== 1 ? "questões" : "questão"} com erro · taxa média{" "}
            {fmtPct(report.summary.avg_error_rate)}
          </Text>
        )}
        <Text className="text-xs text-ink-subtle mt-1">
          Considera a melhor tentativa concluída de cada aluno.
        </Text>
      </View>

      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator size="large" color="var(--ds-brand)" />
          <Text className="text-sm text-ink-muted mt-3">Carregando relatório…</Text>
        </View>
      ) : error ? (
        <View className="py-8 items-center px-4">
          <Ionicons name="alert-circle-outline" size={28} color="var(--ds-warning)" />
          <Text className="text-sm text-warning text-center mt-2">{error}</Text>
        </View>
      ) : report ? (
        <>
          <View className="flex-row justify-end mb-3">
            <TouchableOpacity
              onPress={handleExport}
              disabled={exporting}
              className="flex-row items-center bg-brand px-4 rounded-ds-md py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="var(--ds-on-brand)" />
              ) : (
                <Ionicons name="download-outline" size={16} color="var(--ds-on-brand)" />
              )}
              <Text className="text-on-brand font-medium text-sm ml-1.5">
                Exportar PDF
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator>
            <View className={TABLE_CONTAINER}>
              <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                <Text className={`w-10 ${TABLE_HEADER_CELL}`}>#</Text>
                <Text className={`flex-1 ${TABLE_HEADER_CELL}`}>Questão</Text>
                <Text className={`w-14 text-right ${TABLE_HEADER_CELL}`}>Erros</Text>
                <Text className={`w-16 text-right ${TABLE_HEADER_CELL}`}>% Erro</Text>
                <Text className={`w-16 text-right ${TABLE_HEADER_CELL}`}>% Acer.</Text>
              </View>

              {report.questions.length === 0 ? (
                <View className="px-4 py-8 items-center">
                  <Text className="text-sm text-ink-muted">Nenhuma questão neste simulado.</Text>
                </View>
              ) : (
                report.questions.map((q, idx) => (
                  <DataTableRow key={q.question_id} index={idx} style={{ alignItems: "flex-start" }}>
                    <Text className="w-10 text-sm font-mono text-ink">
                      {idx + 1}
                    </Text>
                    <View className="flex-1 pr-2">
                      <Text className="text-sm text-ink" numberOfLines={3}>
                        <Text className="font-mono text-ink-muted">#{q.order} · </Text>
                        {q.question_text_preview}
                      </Text>
                      {(q.subject || q.total_answers === 0) && (
                        <Text className="text-xs text-ink-subtle mt-0.5">
                          {q.subject ? q.subject : ""}
                          {q.subject && q.total_answers === 0 ? " · " : ""}
                          {q.total_answers === 0 ? "sem respostas corrigidas" : ""}
                        </Text>
                      )}
                    </View>
                    <Text className="w-14 text-sm font-mono text-ink text-right">
                      {q.wrong_count}/{q.total_answers}
                    </Text>
                    <Text
                      className={`w-16 text-sm font-mono text-right ${errorTone(q.error_rate)}`}
                    >
                      {fmtPct(q.error_rate)}
                    </Text>
                    <Text className="w-16 text-sm font-mono text-ink-muted text-right">
                      {fmtPct(q.hit_rate)}
                    </Text>
                  </DataTableRow>
                ))
              )}
            </View>
          </ScrollView>
        </>
      ) : null}
    </Modal>
  );
}
