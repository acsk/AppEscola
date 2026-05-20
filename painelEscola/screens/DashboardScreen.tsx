import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StatCard from "../components/StatCard";
import DonutChart from "../components/DonutChart";
import AttendanceChart from "../components/AttendanceChart";
import CalendarWidget from "../components/CalendarWidget";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchDashboard,
  type DashboardPayload,
} from "../services/dashboard";

const AGENDA_COLORS = [
  { color: "#EDE9FE", borderColor: "#7C3AED" },
  { color: "#FEF3C7", borderColor: "#F59E0B" },
  { color: "#ECFDF5", borderColor: "#10B981" },
  { color: "#E0F2FE", borderColor: "#0284C7" },
];

function formatBrl(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function firstName(fullName?: string | null): string {
  if (!fullName?.trim()) return "usuário";
  return fullName.trim().split(/\s+/)[0];
}

export default function DashboardScreen() {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState<number | undefined>(undefined);
  const [classPickerOpen, setClassPickerOpen] = useState(false);

  const load = useCallback(async (schoolClassId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchDashboard(
        schoolClassId ? { school_class_id: schoolClassId } : undefined,
        user
      );
      setData(payload);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Não foi possível carregar o dashboard.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load(classId);
  }, [load, classId]);

  const attendance = data?.attendance;
  const finance = data?.finance;
  const effectiveClassId = classId ?? data?.attendance_class?.id;
  const selectedClass =
    data?.school_classes.find((c) => c.id === effectiveClassId) ??
    data?.attendance_class;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">Dashboard</Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          Bem-vindo de volta, {firstName(user?.name)} 👋
        </Text>
      </View>

      {loading && !data && (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      )}

      {error && !data && (
        <View className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
          <Text className="text-sm text-red-700">{error}</Text>
          <TouchableOpacity onPress={() => load(classId)} className="mt-2">
            <Text className="text-sm font-semibold text-violet-600">
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {data && (
        <>
          <View
            className="mb-6"
            style={{
              flexDirection: isMobile ? "column" : "row",
              marginHorizontal: isMobile ? 0 : -6,
              gap: isMobile ? 12 : 0,
            }}
          >
            {data.stats.map((stat) => (
              <StatCard
                key={stat.key}
                title={stat.label}
                value={stat.value.toLocaleString("pt-BR")}
                percentage={stat.trend_percent}
                variant={stat.variant}
              />
            ))}
          </View>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 20 }}>
            <View style={{ flex: 2 }}>
              <View
                className="bg-white rounded-2xl p-5 mb-5"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <Text className="text-base font-bold text-gray-800 mb-4">
                  Alunos
                </Text>
                <DonutChart
                  total={data.students_breakdown.total}
                  segments={data.students_breakdown.segments}
                />
              </View>

              <View
                className="bg-white rounded-2xl p-5 mb-5"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-base font-bold text-gray-800">
                    Frequência
                  </Text>
                  <View className="flex-row gap-2 items-center">
                    {attendance?.present_percent != null && (
                      <View className="bg-gray-800 px-2.5 py-1 rounded-full">
                        <Text className="text-xs text-white font-semibold">
                          {attendance.present_percent}% presente
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      className="bg-gray-50 px-3 py-1 rounded-full border border-gray-200 max-w-[140px]"
                      activeOpacity={0.7}
                      onPress={() => setClassPickerOpen((v) => !v)}
                    >
                      <Text
                        className="text-xs text-gray-600 font-medium"
                        numberOfLines={1}
                      >
                        {selectedClass?.name ?? "Turma"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {classPickerOpen && (data.school_classes.length ?? 0) > 0 && (
                  <View className="mb-3 border border-gray-100 rounded-lg overflow-hidden">
                    {data.school_classes.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        className={`px-3 py-2 ${
                          c.id === effectiveClassId ? "bg-violet-50" : "bg-white"
                        }`}
                        onPress={() => {
                          setClassId(c.id);
                          setClassPickerOpen(false);
                        }}
                      >
                        <Text className="text-sm text-gray-700">{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <AttendanceChart
                  data={attendance?.days ?? []}
                  highlightDay={attendance?.highlight_day ?? undefined}
                />
              </View>

              {finance && (
                <View
                  className="bg-white rounded-2xl p-5"
                  style={{
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 10,
                    elevation: 3,
                  }}
                >
                  <Text className="text-base font-bold text-gray-800 mb-3">
                    Financeiro
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    <FinancePill
                      label="Recebido no mês"
                      value={formatBrl(finance.paid_month_amount)}
                      sub={`${finance.paid_month_count} pagamentos`}
                    />
                    <FinancePill
                      label="Em aberto"
                      value={String(finance.open_count)}
                      sub={formatBrl(finance.open_amount)}
                    />
                    <FinancePill
                      label="Vencidas"
                      value={String(finance.overdue_count)}
                      sub={formatBrl(finance.overdue_amount)}
                      danger
                    />
                  </View>
                  <Text className="text-xs text-gray-400 mt-3">
                    {finance.exam_passes_30d} aprovações (≥70%) nos últimos 30
                    dias · {finance.enrollments_active} matrículas ativas
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1.2 }}>
              <View
                className="bg-white rounded-2xl p-5 mb-5"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <CalendarWidget
                  eventDays={data.calendar.event_days}
                  initialYear={data.calendar.year}
                  initialMonth={data.calendar.month}
                />
              </View>

              <View
                className="bg-white rounded-2xl p-5"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <Text className="text-base font-bold text-gray-800 mb-4">
                  Agenda
                </Text>
                {data.upcoming_events.length === 0 ? (
                  <Text className="text-sm text-gray-400">
                    Nenhum evento nos próximos dias.
                  </Text>
                ) : (
                  data.upcoming_events.map((item, index) => {
                    const theme =
                      AGENDA_COLORS[index % AGENDA_COLORS.length];
                    return (
                      <View
                        key={item.id}
                        className="flex-row mb-3"
                        style={{
                          backgroundColor: theme.color,
                          borderLeftWidth: 3,
                          borderLeftColor: theme.borderColor,
                          borderRadius: 8,
                          padding: 10,
                        }}
                      >
                        <View className="mr-3">
                          <Text className="text-xs font-semibold text-gray-500">
                            {item.time}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-xs text-gray-500">
                            {item.subtitle}
                          </Text>
                          <Text className="text-sm font-medium text-gray-800 mt-0.5">
                            {item.title}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function FinancePill({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
}) {
  return (
    <View
      className={`flex-1 min-w-[120px] rounded-xl p-3 ${
        danger ? "bg-red-50" : "bg-violet-50"
      }`}
    >
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text
        className={`text-lg font-bold mt-0.5 ${
          danger ? "text-red-700" : "text-violet-800"
        }`}
      >
        {value}
      </Text>
      <Text className="text-xs text-gray-500 mt-0.5">{sub}</Text>
    </View>
  );
}
