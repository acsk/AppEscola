import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchStudentPerformance } from "../../services/performance";
import type { PerformanceBySubject, StudentPerformance } from "../../types/performance";
import type { StudentPerformanceScreenProps } from "../../types/alunos";
import { subjectIconName } from "../../utils/subjectIcon";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const MONTH_OPTIONS = [6, 12] as const;

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

function BarChart({
  values,
  labels,
}: {
  values: Array<number | null>;
  labels: string[];
}) {
  const maxHeight = 120;
  const max = Math.max(100, ...values.filter((v): v is number => v != null));

  return (
    <View className="flex-row items-end justify-between gap-2 px-1">
      {values.map((value, index) => {
        const height = value != null ? Math.max(8, (value / max) * maxHeight) : 4;
        const hasValue = value != null;
        return (
          <View key={`${labels[index]}-${index}`} className="flex-1 items-center min-w-[40px]">
            <Text className="text-[10px] font-bold text-gray-500 mb-1.5">
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
                  backgroundColor: hasValue ? "#7C3AED" : "#E5E7EB",
                }}
              />
            </View>
            <Text className="text-[10px] text-gray-500 mt-1.5 text-center" numberOfLines={1}>
              {labels[index]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SubjectCard({ item }: { item: PerformanceBySubject }) {
  const color = item.subject.color || "#7C3AED";
  const approved =
    item.avg_percentage != null && item.passing_score_avg != null
      ? item.avg_percentage >= item.passing_score_avg
      : null;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
      <View className="flex-row items-center gap-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: `${color}22` }}
        >
          <Ionicons
            name={subjectIconName(item.subject.icon ?? "") as any}
            size={20}
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
          className="text-lg font-extrabold"
          style={{ color: approved === false ? "#DC2626" : approved === true ? "#16A34A" : "#111827" }}
        >
          {formatPct(item.avg_percentage)}
        </Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
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

export default function StudentPerformanceScreen({
  navigate,
  studentId,
  studentName,
}: StudentPerformanceScreenProps) {
  const { contentPadding } = useResponsiveLayout();
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>(6);
  const [data, setData] = useState<StudentPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStudentPerformance(studentId, months);
      setData(result);
    } catch {
      setError("Não foi possível carregar o aproveitamento do aluno.");
      setData(null);
    }
    setLoading(false);
  }, [studentId, months]);

  React.useEffect(() => {
    load();
  }, [load]);

  const overview = data?.overview;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: "#F9FAFB" }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-3 flex-1">
          <TouchableOpacity
            onPress={() => navigate("alunos-form", { studentId })}
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={18} color="#374151" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">Aproveitamento</Text>
            {studentName ? (
              <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                {studentName}
              </Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          onPress={load}
          className="w-9 h-9 rounded-xl bg-violet-50 items-center justify-center"
        >
          <Ionicons name="refresh" size={18} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      <View className="flex-row gap-2 mb-4">
        {MONTH_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setMonths(option)}
            className={`px-4 py-2 rounded-full border ${
              months === option ? "bg-violet-600 border-violet-600" : "bg-white border-gray-200"
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

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : error ? (
        <View className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <Text className="text-sm text-red-700">{error}</Text>
        </View>
      ) : data ? (
        <>
          <View className="flex-row flex-wrap gap-3 mb-4">
            {[
              { label: "Média geral", value: formatPct(overview?.avg_percentage) },
              { label: "Este mês", value: formatPct(overview?.month_avg_percentage) },
              { label: "Simulados", value: String(overview?.total_attempts ?? 0) },
              { label: "Disciplinas", value: String(overview?.subjects_count ?? 0) },
            ].map((card) => (
              <View
                key={card.label}
                className="bg-white rounded-2xl border border-violet-100 p-4 min-w-[140px] flex-1"
              >
                <Text className="text-xs font-semibold text-gray-500">{card.label}</Text>
                <Text className="text-2xl font-extrabold text-gray-900 mt-1">{card.value}</Text>
                {card.label === "Este mês" && overview?.month_change != null && (
                  <Text className="text-xs font-semibold mt-1" style={{ color: trendColor(overview.month_change) }}>
                    {overview.month_change > 0 ? "+" : ""}
                    {overview.month_change} pp
                  </Text>
                )}
              </View>
            ))}
          </View>

          {overview?.best_subject && (
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
              <Ionicons name="trophy-outline" size={20} color="#B45309" />
              <Text className="text-sm text-amber-900 flex-1">
                Melhor média em{" "}
                <Text className="font-bold">{overview.best_subject.name}</Text> (
                {formatPct(overview.best_subject.avg_percentage)})
              </Text>
            </View>
          )}

          <Text className="text-base font-bold text-gray-800 mb-2">Evolução mensal</Text>
          <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
            {data.monthly_evolution.some((m) => m.avg_percentage != null) ? (
              <BarChart
                values={data.monthly_evolution.map((m) => m.avg_percentage)}
                labels={data.monthly_evolution.map((m) => m.label)}
              />
            ) : (
              <Text className="text-sm text-gray-500 text-center py-4">
                Sem simulados concluídos no período.
              </Text>
            )}
          </View>

          <Text className="text-base font-bold text-gray-800 mb-2">Por disciplina</Text>
          {data.by_subject.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
              <Text className="text-sm text-gray-500 text-center">
                Nenhum simulado concluído com nota registrada.
              </Text>
            </View>
          ) : (
            data.by_subject.map((item) => (
              <SubjectCard key={String(item.subject_id ?? "general")} item={item} />
            ))
          )}

          <Text className="text-base font-bold text-gray-800 mb-2 mt-2">Detalhe mês a mês</Text>
          {data.monthly_evolution.map((month) => (
            <View key={month.month} className="bg-white rounded-2xl border border-gray-100 p-4 mb-2">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm font-bold text-gray-800">{month.label}</Text>
                <Text className="text-sm font-extrabold text-violet-700">
                  {formatPct(month.avg_percentage)}
                </Text>
              </View>
              {month.by_subject.length === 0 ? (
                <Text className="text-xs text-gray-500">Nenhum simulado neste mês</Text>
              ) : (
                month.by_subject.map((subject) => (
                  <View
                    key={`${month.month}-${subject.subject_id ?? "g"}`}
                    className="flex-row justify-between py-2 border-t border-gray-50"
                  >
                    <Text className="text-sm text-gray-700 flex-1" numberOfLines={1}>
                      {subject.subject_name}
                    </Text>
                    <Text className="text-xs font-semibold text-gray-500">
                      {subject.attempts_count} · {formatPct(subject.avg_percentage, 0)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
