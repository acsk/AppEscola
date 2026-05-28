import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fetchStudentPerformance } from "../../services/performance";
import type {
  PerformanceBySubject,
  PerformanceMonthlyEvolution,
  StudentPerformance,
} from "../../types/performance";
import type { StudentPerformanceScreenProps } from "../../types/alunos";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { subjectIconName } from "../../utils/subjectIcon";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const MONTH_OPTIONS = [6, 12] as const;
const ALL_SUBJECTS = "all";

function formatPct(value: number | null | undefined, fractionDigits = 1): string {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

function trendColor(change: number | null | undefined): string {
  if (change == null || change === 0) return "#6B7280";
  return change > 0 ? "#16A34A" : "#DC2626";
}

function subjectFilterKey(subjectId: number | null | undefined): string {
  return subjectId == null ? "general" : String(subjectId);
}

function BarChart({
  values,
  labels,
  compact = false,
}: {
  values: Array<number | null>;
  labels: string[];
  compact?: boolean;
}) {
  const maxHeight = compact ? 92 : 120;
  const max = Math.max(100, ...values.filter((v): v is number => v != null));

  return (
    <View className="flex-row items-end justify-between gap-2 px-1">
      {values.map((value, index) => {
        const height = value != null ? Math.max(8, (value / max) * maxHeight) : 4;
        const hasValue = value != null;
        return (
          <View key={`${labels[index]}-${index}`} className="flex-1 items-center min-w-[40px]">
            <Text className="text-xs font-bold text-gray-500 mb-1.5">
              {hasValue ? formatPct(value, 0) : "—"}
            </Text>
            <View
              className="w-[72%] justify-end bg-gray-100 rounded-lg overflow-hidden"
              style={{ height: maxHeight }}
            >
              <View
                className="w-full rounded-lg"
                style={{
                  height,
                  backgroundColor: hasValue ? "#7C3AED" : "#F3F4F6",
                }}
              />
            </View>
            <Text className="text-xs text-gray-500 mt-1.5 text-center" numberOfLines={1}>
              {labels[index]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3 mb-2">
      <View className="flex-1">
        <Text className="text-base font-bold text-gray-900">{title}</Text>
        {subtitle ? <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  helper,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "violet" | "emerald" | "amber" | "blue";
  helper?: React.ReactNode;
}) {
  const styles = {
    violet: { bg: "bg-violet-50", icon: "#7C3AED" },
    emerald: { bg: "bg-emerald-50", icon: "#16A34A" },
    amber: { bg: "bg-amber-50", icon: "#D97706" },
    blue: { bg: "bg-blue-50", icon: "#2563EB" },
  };

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 min-w-[150px] flex-1">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-semibold text-gray-500">{label}</Text>
          <Text className="text-2xl font-extrabold text-gray-900 mt-1">{value}</Text>
        </View>
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${styles[tone].bg}`}>
          <Ionicons name={icon} size={18} color={styles[tone].icon} />
        </View>
      </View>
      {helper ? <View className="mt-1">{helper}</View> : null}
    </View>
  );
}

function SubjectCard({ item, compact = false }: { item: PerformanceBySubject; compact?: boolean }) {
  const color = item.subject.color || "#7C3AED";
  const approved =
    item.avg_percentage != null && item.passing_score_avg != null
      ? item.avg_percentage >= item.passing_score_avg
      : null;

  return (
    <View className={`bg-white rounded-2xl border border-gray-100 ${compact ? "p-3 mb-2" : "p-4 mb-3"}`}>
      <View className="flex-row items-center gap-3">
        <View
          className={`${compact ? "w-9 h-9" : "w-10 h-10"} rounded-xl items-center justify-center`}
          style={{ backgroundColor: `${color}22` }}
        >
          <Ionicons
            name={subjectIconName(item.subject.icon ?? "") as any}
            size={compact ? 18 : 20}
            color={color}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-gray-800">{item.subject.name}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {item.attempts_count} simulado{item.attempts_count !== 1 ? "s" : ""}
            {item.passing_score_avg != null ? ` · mín. ${formatPct(item.passing_score_avg, 0)}` : ""}
          </Text>
        </View>
        <Text
          className={`${compact ? "text-base" : "text-lg"} font-extrabold`}
          style={{ color: approved === false ? "#DC2626" : approved === true ? "#16A34A" : "#111827" }}
        >
          {formatPct(item.avg_percentage)}
        </Text>
      </View>
      <View className={`${compact ? "h-1.5 mt-2.5" : "h-2 mt-3"} bg-gray-100 rounded-full overflow-hidden`}>
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, item.avg_percentage ?? 0)}%`,
            backgroundColor: color,
          }}
        />
      </View>
      <View className="flex-row justify-between items-center mt-2 flex-wrap gap-2">
        <Text className="text-xs text-gray-500">Último: {formatPct(item.latest_percentage)}</Text>
        {item.month_change != null && (
          <View className="flex-row items-center gap-1">
            <Ionicons
              name={item.month_change >= 0 ? "arrow-up" : "arrow-down"}
              size={12}
              color={trendColor(item.month_change)}
            />
            <Text className="text-xs font-semibold" style={{ color: trendColor(item.month_change) }}>
              {item.month_change > 0 ? "+" : ""}
              {item.month_change.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp vs mês ant.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MonthDetailCard({ month }: { month: PerformanceMonthlyEvolution }) {
  return (
    <View
      className="bg-white rounded-2xl border border-gray-200 p-4 mb-2"
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <View className="flex-row justify-between mb-3">
        <View>
          <Text className="text-sm font-bold text-gray-900">{month.label}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {month.attempts_count} simulado{month.attempts_count !== 1 ? "s" : ""}
          </Text>
        </View>
        <Text className="text-base font-extrabold text-violet-700">
          {formatPct(month.avg_percentage)}
        </Text>
      </View>
      {month.by_subject.length === 0 ? (
        <Text className="text-xs text-gray-500 pt-2">Nenhum simulado neste mês.</Text>
      ) : (
        <View className="rounded-xl overflow-hidden border border-gray-200">
          <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
              Disciplina
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.55, textAlign: "center" }}>
              Qtd
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.75, textAlign: "right" }}>
              Média
            </Text>
          </View>
          {month.by_subject.map((subject, idx) => (
            <DataTableRow
              key={`${month.month}-${subject.subject_id ?? "g"}`}
              index={idx}
            >
              <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 2, paddingRight: 8 }} numberOfLines={1}>
                {subject.subject_name}
              </Text>
              <Text className={TABLE_CELL} style={{ flex: 0.55, textAlign: "center" }}>
                {subject.attempts_count}
              </Text>
              <Text className={TABLE_CELL} style={{ flex: 0.75, textAlign: "right" }}>
                {formatPct(subject.avg_percentage, 0)}
              </Text>
            </DataTableRow>
          ))}
        </View>
      )}
    </View>
  );
}

export default function StudentPerformanceScreen({
  navigate,
  studentId,
  studentName,
}: StudentPerformanceScreenProps) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>(6);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState(ALL_SUBJECTS);
  const [showEmptyMonths, setShowEmptyMonths] = useState(false);
  const [data, setData] = useState<StudentPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStudentPerformance(studentId, months);
      setData(result);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Não foi possível carregar o aproveitamento do aluno.")
      );
      setData(null);
    }
    setLoading(false);
  }, [studentId, months]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!data || selectedSubjectKey === ALL_SUBJECTS) return;
    const exists = data.by_subject.some(
      (item) => subjectFilterKey(item.subject_id) === selectedSubjectKey
    );
    if (!exists) setSelectedSubjectKey(ALL_SUBJECTS);
  }, [data, selectedSubjectKey]);

  const overview = data?.overview;
  const student = data?.student;
  const displayName = student?.name ?? studentName ?? "";
  const enrollmentNumber = student?.enrollment_number ?? null;
  const courseLabel =
    student?.active_enrollments?.[0]?.school_class?.name ??
    student?.active_enrollments?.[0]?.course?.name ??
    student?.desired_courses?.[0]?.name ??
    null;
  const subjectOptions =
    data?.by_subject.map((item) => ({
      key: subjectFilterKey(item.subject_id),
      label: item.subject.name,
      color: item.subject.color || "#7C3AED",
      attempts: item.attempts_count,
    })) ?? [];
  const selectedSubject = data?.by_subject.find(
    (item) => subjectFilterKey(item.subject_id) === selectedSubjectKey
  );
  const filteredSubjects =
    selectedSubjectKey === ALL_SUBJECTS
      ? data?.by_subject ?? []
      : data?.by_subject.filter((item) => subjectFilterKey(item.subject_id) === selectedSubjectKey) ?? [];
  const filteredMonthlyEvolution =
    data?.monthly_evolution.map((month) => {
      if (selectedSubjectKey === ALL_SUBJECTS) return month;

      const subject = month.by_subject.find(
        (item) => subjectFilterKey(item.subject_id) === selectedSubjectKey
      );

      return {
        ...month,
        attempts_count: subject?.attempts_count ?? 0,
        avg_percentage: subject?.avg_percentage ?? null,
        by_subject: subject ? [subject] : [],
      };
    }) ?? [];
  const monthsWithAttempts = filteredMonthlyEvolution.filter((month) => month.by_subject.length > 0);
  const emptyMonths = filteredMonthlyEvolution.filter((month) => month.by_subject.length === 0);
  const visibleMonthDetails = showEmptyMonths ? filteredMonthlyEvolution : monthsWithAttempts;
  const currentFilteredMonth = filteredMonthlyEvolution[filteredMonthlyEvolution.length - 1];
  const filteredAvg = selectedSubject ? selectedSubject.avg_percentage : overview?.avg_percentage;
  const filteredMonthAvg = selectedSubject
    ? currentFilteredMonth?.avg_percentage
    : overview?.month_avg_percentage;
  const filteredAttempts = selectedSubject
    ? selectedSubject.attempts_count
    : overview?.total_attempts ?? 0;
  const filteredSubjectsCount = selectedSubject ? 1 : overview?.subjects_count ?? 0;
  const filteredMonthChange = selectedSubject ? selectedSubject.month_change : overview?.month_change;

  const breadcrumbItems = [
    { label: "Alunos", onPress: () => navigate("alunos") },
    ...(displayName
      ? [
          {
            label: displayName,
            onPress: () => navigate("alunos-form", { studentId }),
          },
        ]
      : []),
    { label: "Aproveitamento" },
  ];

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
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
          <Text className="text-2xl font-bold text-gray-800">Aproveitamento</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Desempenho em simulados concluídos
            {displayName ? ` · ${displayName}` : ""}
          </Text>
          {(enrollmentNumber || courseLabel) && (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 mt-2">
              {enrollmentNumber ? (
                <Text className="text-xs font-mono font-semibold text-violet-600">
                  Matrícula {enrollmentNumber}
                </Text>
              ) : null}
              {enrollmentNumber && courseLabel ? (
                <Text className="text-xs text-gray-400">·</Text>
              ) : null}
              {courseLabel ? (
                <Text className="text-xs text-gray-500" numberOfLines={1}>
                  {courseLabel}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 items-center justify-center self-end"
          accessibilityLabel="Atualizar dados"
        >
          <Ionicons name="refresh" size={18} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      <View
        className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Período
        </Text>
        <View className="flex-row gap-2">
          {MONTH_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setMonths(option)}
              className={`px-4 py-2 rounded-full border ${
                months === option ? "bg-violet-600 border-violet-600" : "bg-gray-50 border-gray-200"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  months === option ? "text-white" : "text-gray-600"
                }`}
              >
                {option} meses
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : error ? (
        <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <Text className="text-sm text-red-700">{error}</Text>
          <TouchableOpacity
            onPress={load}
            className="mt-3 self-start px-4 py-2 rounded-xl bg-white border border-red-200"
            activeOpacity={0.85}
          >
            <Text className="text-sm font-semibold text-red-700">Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View
            className="bg-white rounded-2xl border border-gray-200 p-3 mb-4"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View className="flex-row items-center justify-between gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Filtros
                </Text>
                <Text className="text-sm font-semibold text-gray-900 mt-0.5">
                  {selectedSubject ? selectedSubject.subject.name : "Todas as disciplinas"}
                </Text>
              </View>
              {(selectedSubjectKey !== ALL_SUBJECTS || showEmptyMonths) && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedSubjectKey(ALL_SUBJECTS);
                    setShowEmptyMonths(false);
                  }}
                  className="px-3 py-1.5 rounded-full bg-gray-100"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-gray-600">Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-3">
                <TouchableOpacity
                  onPress={() => setSelectedSubjectKey(ALL_SUBJECTS)}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                    selectedSubjectKey === ALL_SUBJECTS
                      ? "bg-violet-600 border-violet-600"
                      : "bg-gray-50 border-gray-200"
                  }`}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="layers-outline"
                    size={14}
                    color={selectedSubjectKey === ALL_SUBJECTS ? "white" : "#6B7280"}
                  />
                  <Text
                    className={`text-xs font-bold ${
                      selectedSubjectKey === ALL_SUBJECTS ? "text-white" : "text-gray-600"
                    }`}
                  >
                    Todas
                  </Text>
                </TouchableOpacity>

                {subjectOptions.map((subject) => {
                  const active = selectedSubjectKey === subject.key;
                  return (
                    <TouchableOpacity
                      key={subject.key}
                      onPress={() => setSelectedSubjectKey(subject.key)}
                      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                        active ? "bg-white border-violet-300" : "bg-gray-50 border-gray-200"
                      }`}
                      activeOpacity={0.85}
                    >
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <Text
                        className={`text-xs font-bold ${active ? "text-violet-700" : "text-gray-600"}`}
                      >
                        {subject.label}
                      </Text>
                      <Text className="text-xs text-gray-400">{subject.attempts}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setShowEmptyMonths((prev) => !prev)}
              className="flex-row items-center justify-between mt-3 rounded-xl bg-gray-50 px-3 py-2"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={showEmptyMonths ? "checkbox" : "square-outline"}
                  size={18}
                  color={showEmptyMonths ? "#7C3AED" : "#94A3B8"}
                />
                <Text className="text-xs font-semibold text-gray-700">
                  Mostrar meses sem simulados
                </Text>
              </View>
              <Text className="text-xs font-semibold text-gray-400">
                {emptyMonths.length} mês{emptyMonths.length !== 1 ? "es" : ""}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row flex-wrap gap-3 mb-4">
            {[
              {
                label: "Média geral",
                value: formatPct(filteredAvg),
                icon: "analytics-outline" as const,
                tone: "violet" as const,
              },
              {
                label: "Este mês",
                value: formatPct(filteredMonthAvg),
                icon: "calendar-outline" as const,
                tone: "emerald" as const,
                helper:
                  filteredMonthChange != null ? (
                  <Text className="text-xs font-semibold mt-1" style={{ color: trendColor(filteredMonthChange) }}>
                    {filteredMonthChange > 0 ? "+" : ""}
                    {filteredMonthChange} pp
                  </Text>
                  ) : null,
              },
              {
                label: "Simulados",
                value: String(filteredAttempts),
                icon: "document-text-outline" as const,
                tone: "blue" as const,
              },
              {
                label: "Disciplinas",
                value: String(filteredSubjectsCount),
                icon: "library-outline" as const,
                tone: "amber" as const,
              },
            ].map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </View>

          {overview?.best_subject && (
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 flex-row items-center gap-3">
              <View className="w-9 h-9 rounded-xl bg-white items-center justify-center">
                <Ionicons name="trophy-outline" size={18} color="#B45309" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-amber-800">Melhor média</Text>
                <Text className="text-sm text-amber-950 mt-0.5">
                  <Text className="font-bold">{overview.best_subject.name}</Text> ·{" "}
                  {formatPct(overview.best_subject.avg_percentage)}
                </Text>
              </View>
            </View>
          )}

          <SectionHeader
            title="Evolução mensal"
            subtitle="Média de aproveitamento por mês no período selecionado."
          />
          <View
            className="bg-white rounded-2xl border border-gray-200 p-4 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            {filteredMonthlyEvolution.some((m) => m.avg_percentage != null) ? (
              <BarChart
                values={filteredMonthlyEvolution.map((m) => m.avg_percentage)}
                labels={filteredMonthlyEvolution.map((m) => m.label)}
                compact={isMobile}
              />
            ) : (
              <Text className="text-sm text-gray-500 text-center py-4">
                Sem simulados concluídos no período.
              </Text>
            )}
          </View>

          <SectionHeader
            title="Por disciplina"
            subtitle="Comparação por matéria, com mínimo esperado quando disponível."
          />
          {data.by_subject.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
              <Text className="text-sm text-gray-500 text-center">
                Nenhum simulado concluído com nota registrada.
              </Text>
            </View>
          ) : filteredSubjects.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
              <Text className="text-sm text-gray-500 text-center">
                Nenhum resultado para o filtro selecionado.
              </Text>
            </View>
          ) : (
            filteredSubjects.map((item) => (
              <SubjectCard key={String(item.subject_id ?? "general")} item={item} compact={isMobile} />
            ))
          )}

          <SectionHeader
            title="Detalhe mês a mês"
            subtitle={
              showEmptyMonths
                ? "Mostrando todos os meses do período."
                : "Mostrando apenas meses com simulados para reduzir ruído."
            }
            action={
              emptyMonths.length > 0 ? (
                <View className="rounded-full bg-gray-100 px-2 py-1">
                  <Text className="text-xs font-semibold text-gray-500">
                    {emptyMonths.length} sem dados
                  </Text>
                </View>
              ) : null
            }
          />
          {visibleMonthDetails.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-2">
              <Text className="text-sm text-gray-500 text-center">
                Nenhum simulado concluído no período.
              </Text>
            </View>
          ) : (
            visibleMonthDetails.map((month) => <MonthDetailCard key={month.month} month={month} />)
          )}

          {!showEmptyMonths && emptyMonths.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {emptyMonths.map((month) => (
                <View key={month.month} className="rounded-full bg-gray-100 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-gray-500">
                    {month.label}: sem simulado
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
