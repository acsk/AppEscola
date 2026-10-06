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
  if (change == null || change === 0) return "var(--ds-ink-muted)";
  return change > 0 ? "var(--ds-success)" : "var(--ds-danger)";
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
            <Text className="text-xs font-semibold text-ink-muted mb-1.5">
              {hasValue ? formatPct(value, 0) : "—"}
            </Text>
            <View
              className="w-[72%] justify-end bg-surface-sunken rounded-ds-md overflow-hidden"
              style={{ height: maxHeight }}
            >
              <View
                className="w-full rounded-ds-md"
                style={{
                  height,
                  backgroundColor: hasValue ? "var(--ds-brand)" : "var(--ds-surface-sunken)",
                }}
              />
            </View>
            <Text className="text-xs text-ink-muted mt-1.5 text-center" numberOfLines={1}>
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
        <Text className="text-base font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="text-xs text-ink-muted mt-0.5">{subtitle}</Text> : null}
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
    violet: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
    emerald: { bg: "bg-success-tint", icon: "var(--ds-success)" },
    amber: { bg: "bg-warning-tint", icon: "var(--ds-warning)" },
    blue: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  };

  return (
    <View className="bg-surface rounded-ds-md border border-border p-4 min-w-[150px] flex-1">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-semibold text-ink-muted">{label}</Text>
          <Text className="text-2xl font-semibold text-ink mt-1">{value}</Text>
        </View>
        <View className={`w-9 h-9 rounded-ds-md items-center justify-center ${styles[tone].bg}`}>
          <Ionicons name={icon} size={18} color={styles[tone].icon} />
        </View>
      </View>
      {helper ? <View className="mt-1">{helper}</View> : null}
    </View>
  );
}

function SubjectCard({ item, compact = false }: { item: PerformanceBySubject; compact?: boolean }) {
  const color = item.subject.color || "var(--ds-brand)";
  const approved =
    item.avg_percentage != null && item.passing_score_avg != null
      ? item.avg_percentage >= item.passing_score_avg
      : null;

  return (
    <View className={`bg-surface rounded-ds-md border border-border ${compact ? "p-3 mb-2" : "p-4 mb-3"}`}>
      <View className="flex-row items-center gap-3">
        <View
          className={`${compact ? "w-9 h-9" : "w-10 h-10"} rounded-ds-md items-center justify-center`}
          style={{ backgroundColor: `${color}22` }}
        >
          <Ionicons
            name={subjectIconName(item.subject.icon ?? "") as any}
            size={compact ? 18 : 20}
            color={color}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink">{item.subject.name}</Text>
          <Text className="text-xs text-ink-muted mt-0.5">
            {item.attempts_count} simulado{item.attempts_count !== 1 ? "s" : ""}
            {item.passing_score_avg != null ? ` · mín. ${formatPct(item.passing_score_avg, 0)}` : ""}
          </Text>
        </View>
        <Text
          className={`${compact ? "text-base" : "text-lg"} font-semibold`}
          style={{ color: approved === false ? "var(--ds-danger)" : approved === true ? "var(--ds-success)" : "var(--ds-ink)" }}
        >
          {formatPct(item.avg_percentage)}
        </Text>
      </View>
      <View className={`${compact ? "h-1.5 mt-2.5" : "h-2 mt-3"} bg-surface-sunken rounded-full overflow-hidden`}>
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, item.avg_percentage ?? 0)}%`,
            backgroundColor: color,
          }}
        />
      </View>
      <View className="flex-row justify-between items-center mt-2 flex-wrap gap-2">
        <Text className="text-xs text-ink-muted">Último: {formatPct(item.latest_percentage)}</Text>
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
      className="bg-surface rounded-ds-md border border-border p-4 mb-2"
      style={{
      }}
    >
      <View className="flex-row justify-between mb-3">
        <View>
          <Text className="text-sm font-semibold text-ink">{month.label}</Text>
          <Text className="text-xs text-ink-muted mt-0.5">
            {month.attempts_count} simulado{month.attempts_count !== 1 ? "s" : ""}
          </Text>
        </View>
        <Text className="text-base font-semibold text-brand">
          {formatPct(month.avg_percentage)}
        </Text>
      </View>
      {month.by_subject.length === 0 ? (
        <Text className="text-xs text-ink-muted pt-2">Nenhum simulado neste mês.</Text>
      ) : (
        <View className="rounded-ds-md overflow-hidden border border-border">
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
      color: item.subject.color || "var(--ds-brand)",
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
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Aproveitamento</Text>
          <Text className="text-sm text-ink-muted mt-1">
            Desempenho em simulados concluídos
            {displayName ? ` · ${displayName}` : ""}
          </Text>
          {(enrollmentNumber || courseLabel) && (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 mt-2">
              {enrollmentNumber ? (
                <Text className="text-xs font-mono font-semibold text-brand">
                  Matrícula {enrollmentNumber}
                </Text>
              ) : null}
              {enrollmentNumber && courseLabel ? (
                <Text className="text-xs text-ink-subtle">·</Text>
              ) : null}
              {courseLabel ? (
                <Text className="text-xs text-ink-muted" numberOfLines={1}>
                  {courseLabel}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          className="w-10 h-10 rounded-ds-md bg-brand-tint border border-border items-center justify-center self-end"
          accessibilityLabel="Atualizar dados"
        >
          <Ionicons name="refresh" size={18} color="var(--ds-brand)" />
        </TouchableOpacity>
      </View>

      <View
        className="bg-surface rounded-ds-md border border-border p-4 mb-4"
        style={{
        }}
      >
        <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
          Período
        </Text>
        <View className="flex-row gap-2">
          {MONTH_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setMonths(option)}
              className={`px-4 py-2 min-h-control-sm justify-center rounded-ds-md border ${
                months === option ? "bg-surface-sunken border-border-strong" : "bg-surface border-border"
              }`}
              role="radio"
              aria-checked={months === option}
            >
              <Text
                className={`text-sm font-semibold ${
                  months === option ? "text-ink" : "text-ink-muted"
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
          <ActivityIndicator size="large" color="var(--ds-brand)" />
        </View>
      ) : error ? (
        <View className="bg-danger-tint border border-danger rounded-ds-md p-4 mb-4">
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
          <View
            className="bg-surface rounded-ds-md border border-border p-3 mb-4"
            style={{
            }}
          >
            <View className="flex-row items-center justify-between gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Filtros
                </Text>
                <Text className="text-sm font-semibold text-ink mt-0.5">
                  {selectedSubject ? selectedSubject.subject.name : "Todas as disciplinas"}
                </Text>
              </View>
              {(selectedSubjectKey !== ALL_SUBJECTS || showEmptyMonths) && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedSubjectKey(ALL_SUBJECTS);
                    setShowEmptyMonths(false);
                  }}
                  className="px-3 py-1.5 rounded-full bg-surface-sunken"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-ink-muted">Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-3">
                <TouchableOpacity
                  onPress={() => setSelectedSubjectKey(ALL_SUBJECTS)}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                    selectedSubjectKey === ALL_SUBJECTS
                      ? "bg-brand border-brand"
                      : "bg-surface-sunken border-border"
                  }`}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="layers-outline"
                    size={14}
                    color={selectedSubjectKey === ALL_SUBJECTS ? "white" : "var(--ds-ink-muted)"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      selectedSubjectKey === ALL_SUBJECTS ? "text-on-brand" : "text-ink-muted"
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
                        active ? "bg-surface border-border" : "bg-surface-sunken border-border"
                      }`}
                      activeOpacity={0.85}
                    >
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <Text
                        className={`text-xs font-semibold ${active ? "text-brand" : "text-ink-muted"}`}
                      >
                        {subject.label}
                      </Text>
                      <Text className="text-xs text-ink-subtle">{subject.attempts}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setShowEmptyMonths((prev) => !prev)}
              className="flex-row items-center justify-between mt-3 rounded-ds-md bg-surface-sunken px-3 py-2"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={showEmptyMonths ? "checkbox" : "square-outline"}
                  size={18}
                  color={showEmptyMonths ? "var(--ds-brand)" : "var(--ds-ink-subtle)"}
                />
                <Text className="text-xs font-semibold text-ink">
                  Mostrar meses sem simulados
                </Text>
              </View>
              <Text className="text-xs font-semibold text-ink-subtle">
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
            <View className="bg-warning-tint border border-warning rounded-ds-md p-3 mb-4 flex-row items-center gap-3">
              <View className="w-9 h-9 rounded-ds-md bg-surface items-center justify-center border border-border">
                <Ionicons name="trophy-outline" size={18} color="var(--ds-warning)" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-warning">Melhor média</Text>
                <Text className="text-sm text-amber-950 mt-0.5">
                  <Text className="font-semibold">{overview.best_subject.name}</Text> ·{" "}
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
            className="bg-surface rounded-ds-md border border-border p-4 mb-5"
            style={{
            }}
          >
            {filteredMonthlyEvolution.some((m) => m.avg_percentage != null) ? (
              <BarChart
                values={filteredMonthlyEvolution.map((m) => m.avg_percentage)}
                labels={filteredMonthlyEvolution.map((m) => m.label)}
                compact={isMobile}
              />
            ) : (
              <Text className="text-sm text-ink-muted text-center py-4">
                Sem simulados concluídos no período.
              </Text>
            )}
          </View>

          <SectionHeader
            title="Por disciplina"
            subtitle="Comparação por matéria, com mínimo esperado quando disponível."
          />
          {data.by_subject.length === 0 ? (
            <View className="bg-surface rounded-ds-md border border-border p-4 mb-5">
              <Text className="text-sm text-ink-muted text-center">
                Nenhum simulado concluído com nota registrada.
              </Text>
            </View>
          ) : filteredSubjects.length === 0 ? (
            <View className="bg-surface rounded-ds-md border border-border p-4 mb-5">
              <Text className="text-sm text-ink-muted text-center">
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
                <View className="rounded-full bg-surface-sunken px-2 py-1">
                  <Text className="text-xs font-semibold text-ink-muted">
                    {emptyMonths.length} sem dados
                  </Text>
                </View>
              ) : null
            }
          />
          {visibleMonthDetails.length === 0 ? (
            <View className="bg-surface rounded-ds-md border border-border p-4 mb-2">
              <Text className="text-sm text-ink-muted text-center">
                Nenhum simulado concluído no período.
              </Text>
            </View>
          ) : (
            visibleMonthDetails.map((month) => <MonthDetailCard key={month.month} month={month} />)
          )}

          {!showEmptyMonths && emptyMonths.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {emptyMonths.map((month) => (
                <View key={month.month} className="rounded-full bg-surface-sunken px-3 py-1.5">
                  <Text className="text-xs font-semibold text-ink-muted">
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
