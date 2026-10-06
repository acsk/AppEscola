import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fetchStudentReportCard } from "../../services/reportCard";
import type { ReportCardGradeRow, StudentReportCard } from "../../types/reportCard";
import type { StudentReportCardScreenProps } from "../../types/alunos";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { isoToDisplay } from "../../utils/masks";
import { subjectIconName } from "../../utils/subjectIcon";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const KIND_LABELS: Record<string, string> = {
  presencial_bimestral: "Bimestral",
  presencial_recuperacao: "Recuperação",
  presencial_diagnostico: "Diagnóstico",
  presencial_final: "Final",
  outro: "Outro",
};

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

function formatGrade(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function gradeCellText(row: ReportCardGradeRow): { text: string; color: string } {
  if (row.is_absent) return { text: "Faltou", color: "var(--ds-danger)" };
  if (row.grade != null) return { text: formatGrade(row.grade), color: "var(--ds-ink)" };
  return { text: "—", color: "var(--ds-ink-subtle)" };
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "violet" | "emerald" | "amber" | "blue";
}) {
  const styles = {
    violet: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
    emerald: { bg: "bg-success-tint", icon: "var(--ds-success)" },
    amber: { bg: "bg-warning-tint", icon: "var(--ds-warning)" },
    blue: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  };

  return (
    <View className="bg-surface rounded-ds-md border border-border p-4 min-w-[140px] flex-1">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-semibold text-ink-muted">{label}</Text>
          <Text className="text-2xl font-semibold text-ink mt-1">{value}</Text>
        </View>
        <View className={`w-9 h-9 rounded-ds-md items-center justify-center ${styles[tone].bg}`}>
          <Ionicons name={icon} size={18} color={styles[tone].icon} />
        </View>
      </View>
    </View>
  );
}

const cardShadow = {
} as const;

export default function StudentReportCardScreen({
  navigate,
  studentId,
  studentName,
}: StudentReportCardScreenProps) {
  const { contentPadding, isMobile, tableMinWidth } = useResponsiveLayout();
  const [data, setData] = useState<StudentReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStudentReportCard(studentId);
      setData(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o boletim do aluno."));
      setData(null);
    }
    setLoading(false);
  }, [studentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const displayName = data?.student.name ?? studentName ?? "";
  const enrollmentNumber = data?.student.enrollment_number ?? null;

  const sortedGrades = useMemo(() => {
    if (!data?.grades?.length) return [];
    return [...data.grades].sort((a, b) => {
      const da = a.assessment?.assessment_date ?? "";
      const db = b.assessment?.assessment_date ?? "";
      if (da !== db) return db.localeCompare(da);
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [data?.grades]);

  const breadcrumbItems = [
    { label: "Alunos", onPress: () => navigate("alunos") },
    ...(displayName
      ? [{ label: displayName, onPress: () => navigate("alunos-form", { studentId }) }]
      : []),
    { label: "Boletim" },
  ];

  const tableScrollMinWidth = 720;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <ScreenBreadcrumb items={breadcrumbItems} />

      <View
        className="mb-6"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View className="flex-1">
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Boletim</Text>
          <Text className="text-sm text-ink-muted mt-1">
            Avaliações presenciais publicadas que contam no boletim
            {displayName ? ` · ${displayName}` : ""}
          </Text>
          {enrollmentNumber ? (
            <Text className="text-xs font-mono font-semibold text-brand mt-2">
              Matrícula {enrollmentNumber}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          className="w-10 h-10 rounded-ds-md bg-brand-tint border border-border items-center justify-center self-end"
          accessibilityLabel="Atualizar boletim"
        >
          <Ionicons name="refresh" size={18} color="var(--ds-brand)" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color="var(--ds-brand)" />
          <Text className="text-sm text-ink-muted mt-3">Carregando boletim...</Text>
        </View>
      ) : error ? (
        <View className="bg-danger-tint border border-danger rounded-ds-md p-4">
          <Text className="text-sm text-danger">{error}</Text>
          <TouchableOpacity
            onPress={load}
            className="mt-3 self-start px-4 py-2 rounded-ds-md bg-surface border border-danger"
            activeOpacity={0.85}
          >
            <Text className="text-sm font-semibold text-danger">Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View className="flex-row flex-wrap gap-3 mb-4">
            <StatCard
              label="Média ponderada"
              value={formatGrade(data.summary.weighted_average)}
              icon="analytics-outline"
              tone="violet"
            />
            <StatCard
              label="Lançamentos"
              value={String(data.summary.assessments_count)}
              icon="document-text-outline"
              tone="blue"
            />
            <StatCard
              label="Faltas"
              value={String(data.summary.absences_count)}
              icon="close-circle-outline"
              tone="amber"
            />
            <StatCard
              label="Disciplinas"
              value={String(data.summary.by_subject.length)}
              icon="library-outline"
              tone="emerald"
            />
          </View>

          <Text className="text-base font-semibold text-ink mb-2">Média por disciplina</Text>
          <Text className="text-xs text-ink-muted mb-3">
            Média ponderada das avaliações publicadas em cada matéria.
          </Text>

          {data.summary.by_subject.length === 0 ? (
            <View className="bg-surface rounded-ds-md border border-border p-6 mb-5 items-center" style={cardShadow}>
              <Ionicons name="school-outline" size={36} color="var(--ds-border)" />
              <Text className="text-sm text-ink-muted mt-3 text-center">
                Nenhuma nota de avaliação presencial publicada para este aluno.
              </Text>
            </View>
          ) : (
            <View
              className="bg-surface rounded-ds-md border border-border overflow-hidden mb-5"
              style={cardShadow}
            >
              <ScrollView
                horizontal={isMobile}
                showsHorizontalScrollIndicator={isMobile}
                style={{ width: "100%" }}
                contentContainerStyle={{
                  width: isMobile ? undefined : "100%",
                  minWidth: isMobile ? tableScrollMinWidth : "100%",
                }}
              >
                <View style={{ width: "100%", minWidth: isMobile ? tableScrollMinWidth : undefined }}>
                  <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
                      Disciplina
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7, textAlign: "center" }}>
                      Notas
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7, textAlign: "center" }}>
                      Faltas
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 0.85, textAlign: "right" }}>
                      Média
                    </Text>
                  </View>
                  {data.summary.by_subject.map((row, idx) => {
                    const color = row.subject?.color ?? "var(--ds-brand)";
                    return (
                      <DataTableRow key={String(row.subject_id)} index={idx}>
                        <View className="flex-row items-center gap-2" style={{ flex: 2, paddingRight: 8 }}>
                          <View
                            className="w-7 h-7 rounded-ds-md items-center justify-center"
                            style={{ backgroundColor: `${color}22` }}
                          >
                            <Ionicons
                              name={subjectIconName(row.subject?.icon ?? "") as keyof typeof Ionicons.glyphMap}
                              size={14}
                              color={color}
                            />
                          </View>
                          <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
                            {row.subject?.name ?? "—"}
                          </Text>
                        </View>
                        <Text className={TABLE_CELL} style={{ flex: 0.7, textAlign: "center" }}>
                          {row.grades_count}
                        </Text>
                        <Text className={TABLE_CELL} style={{ flex: 0.7, textAlign: "center" }}>
                          {row.absences_count}
                        </Text>
                        <Text
                          className={TABLE_CELL_SEMIBOLD}
                          style={{ flex: 0.85, textAlign: "right", color: "var(--ds-brand)" }}
                        >
                          {formatGrade(row.weighted_average)}
                        </Text>
                      </DataTableRow>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          <Text className="text-base font-semibold text-ink mb-2">Histórico de lançamentos</Text>
          <Text className="text-xs text-ink-muted mb-3">
            Todas as notas publicadas que entram no boletim, por avaliação e disciplina.
          </Text>

          {sortedGrades.length === 0 ? (
            <View className="bg-surface rounded-ds-md border border-border p-6 items-center" style={cardShadow}>
              <Text className="text-sm text-ink-muted text-center">Nenhum lançamento para exibir.</Text>
            </View>
          ) : (
            <View
              className="bg-surface rounded-ds-md border border-border overflow-hidden"
              style={cardShadow}
            >
              <ScrollView
                horizontal={isMobile}
                showsHorizontalScrollIndicator={isMobile}
                style={{ width: "100%" }}
                contentContainerStyle={{
                  width: isMobile ? undefined : "100%",
                  minWidth: isMobile ? Math.max(tableMinWidth, 880) : "100%",
                }}
              >
                <View
                  style={{
                    width: "100%",
                    minWidth: isMobile ? Math.max(tableMinWidth, 880) : undefined,
                  }}
                >
                  <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                    <Text className={TABLE_HEADER_CELL} style={{ width: 96 }}>
                      Data
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 2, minWidth: 160 }}>
                      Avaliação
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 120 }}>
                      Disciplina
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 100 }}>
                      Turma
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: 72, textAlign: "center" }}>
                      Nota
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: 56, textAlign: "center" }}>
                      Peso
                    </Text>
                  </View>
                  {sortedGrades.map((row, idx) => {
                    const assessment = row.assessment;
                    const gradeDisplay = gradeCellText(row);
                    return (
                      <DataTableRow key={row.id} index={idx}>
                        <Text className={TABLE_CELL_MUTED} style={{ width: 96 }}>
                          {assessment?.assessment_date
                            ? isoToDisplay(assessment.assessment_date)
                            : "—"}
                        </Text>
                        <View style={{ flex: 2, minWidth: 160, paddingRight: 8 }}>
                          <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
                            {assessment?.title ?? "—"}
                          </Text>
                          {assessment?.kind ? (
                            <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                              {kindLabel(assessment.kind)}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          className={TABLE_CELL}
                          style={{ flex: 1.2, minWidth: 120, paddingRight: 6 }}
                          numberOfLines={1}
                        >
                          {row.subject?.name ?? "—"}
                        </Text>
                        <Text
                          className={TABLE_CELL_MUTED}
                          style={{ flex: 1, minWidth: 100, paddingRight: 6 }}
                          numberOfLines={1}
                        >
                          {assessment?.school_class?.name ?? "—"}
                        </Text>
                        <Text
                          className="text-xs font-semibold"
                          style={{
                            width: 72,
                            textAlign: "center",
                            color: gradeDisplay.color,
                          }}
                        >
                          {gradeDisplay.text}
                        </Text>
                        <Text className={TABLE_CELL_MUTED} style={{ width: 56, textAlign: "center" }}>
                          {assessment?.weight != null ? String(assessment.weight) : "—"}
                        </Text>
                      </DataTableRow>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}
