import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Plus, RefreshCw } from "lucide-react-native";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import Button from "../components/ui/Button";
import FormSelect from "../components/ui/FormSelect";
import StatTile from "../components/ui/StatTile";
import Badge from "../components/ui/Badge";
import AttendanceBarChart from "../components/dashboard/AttendanceBarChart";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useAuth } from "../contexts/AuthContext";
import { fetchDashboard, type DashboardPayload, type DashboardStat } from "../services/dashboard";
import { getApiErrorMessage } from "../utils/apiErrors";
import { color } from "../constants/theme";

type Props = {
  navigate?: (screen: string, params?: Record<string, any>) => void;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulos dos indicadores (a API manda "Alunos", "Turmas"…; aqui o rótulo responde "o quê"). */
const STAT_LABELS: Record<string, string> = {
  students: "Alunos ativos",
  teachers: "Professores",
  classes: "Turmas ativas",
  finance_open: "Cobranças em aberto",
};

const STAT_HINTS: Record<string, string> = {
  students: "cadastros vs. mês anterior",
  classes: "em andamento",
  finance_open: "a receber",
};

const formatBrl = (value: string | number) =>
  (typeof value === "string" ? parseFloat(value) : value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatInt = (n: number) => n.toLocaleString("pt-BR");

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

function statTile(stat: DashboardStat) {
  const trend = stat.trend_percent;
  return (
    <StatTile
      key={stat.key}
      label={STAT_LABELS[stat.key] ?? stat.label}
      value={formatInt(stat.value)}
      delta={trend === null || trend === undefined ? null : `${Math.abs(trend).toLocaleString("pt-BR")}%`}
      trend={trend === null || trend === undefined || trend === 0 ? null : trend > 0 ? "up" : "down"}
      goodWhen={stat.key === "finance_open" ? "down" : "up"}
      hint={STAT_HINTS[stat.key]}
    />
  );
}

/** Dashboard: cabeçalho → filtro → até 4 indicadores → gráfico + agenda → financeiro + alunos. */
export default function DashboardScreen({ navigate }: Props) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState<number | undefined>(undefined);

  const load = useCallback(
    async (schoolClassId?: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await fetchDashboard(schoolClassId ? { school_class_id: schoolClassId } : undefined, user));
      } catch (e) {
        setError(getApiErrorMessage(e, "Não foi possível carregar o dashboard."));
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void load(classId);
  }, [load, classId]);

  const effectiveClassId = classId ?? data?.attendance_class?.id;
  const updatedAt = data?.generated_at ? formatTime(data.generated_at) : "";
  const row = (gap = 24) => ({ flexDirection: isMobile ? ("column" as const) : ("row" as const), gap, alignItems: isMobile ? ("stretch" as const) : ("flex-start" as const) });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, gap: 24 }}>
      <PageHeader
        title="Dashboard"
        description={`Visão geral do cursinho${updatedAt ? ` · atualizado às ${updatedAt}` : ""}.`}
        actions={
          navigate ? (
            <Button variant="primary" icon={Plus} label="Nova matrícula" onPress={() => navigate("matriculas-form")} />
          ) : undefined
        }
      />

      {loading && !data ? (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : error && !data ? (
        <Panel>
          <Text className="text-sm text-danger" style={{ marginBottom: 12 }}>
            {error}
          </Text>
          <Button icon={RefreshCw} label="Tentar novamente" onPress={() => void load(classId)} />
        </Panel>
      ) : data ? (
        <>
          {/* Filtro (um por linha, no máximo 3) */}
          {data.school_classes.length > 0 && (
            <View style={{ width: isMobile ? "100%" : 260 }}>
              <FormSelect
                dense
                label="Turma da frequência"
                value={effectiveClassId ?? ""}
                options={data.school_classes.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(v) => setClassId(v ? Number(v) : undefined)}
              />
            </View>
          )}

          {/* Indicadores */}
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16 }} aria-live="polite">
            {data.stats.slice(0, 4).map(statTile)}
          </View>

          {/* Frequência + agenda */}
          <View style={row()}>
            <View style={{ flex: 2, width: isMobile ? "100%" : undefined }}>
              <Panel
                title="Frequência da semana"
                description={`Presença por dia${data.attendance_class ? ` · ${data.school_classes.find((c) => c.id === effectiveClassId)?.name ?? data.attendance_class.name}` : ""}.`}
                actions={
                  data.attendance.present_percent != null ? (
                    <Badge label={`${data.attendance.present_percent.toLocaleString("pt-BR")}% na semana`} tone="neutral" />
                  ) : undefined
                }
              >
                {data.attendance.days.some((d) => d.present + d.absent > 0) ? (
                  <AttendanceBarChart
                    data={data.attendance.days.map((d) => ({ label: d.day, present: d.present, absent: d.absent }))}
                    accessibilityLabel={`Presença por dia da semana${data.attendance.present_percent != null ? `, média de ${data.attendance.present_percent}%` : ""}`}
                  />
                ) : (
                  <Text className="text-sm text-ink-subtle">Nenhuma chamada lançada nesta semana.</Text>
                )}
              </Panel>
            </View>

            <View style={{ flex: 1, width: isMobile ? "100%" : undefined }}>
              <Panel title="Próximos eventos">
                {data.upcoming_events.length === 0 ? (
                  <Text className="text-sm text-ink-subtle">Nenhum evento nos próximos dias.</Text>
                ) : (
                  data.upcoming_events.map((event, i) => {
                    const d = new Date(event.starts_at);
                    const valid = !Number.isNaN(d.getTime());
                    return (
                      <View
                        key={event.id}
                        className={i === 0 ? "" : "border-t border-border"}
                        style={{ flexDirection: "row", gap: 12, paddingVertical: 12, paddingTop: i === 0 ? 0 : 12 }}
                      >
                        <View className="border border-border rounded-ds-sm items-center" style={{ width: 52, paddingVertical: 4 }}>
                          <Text className="font-mono font-semibold text-ink" style={{ fontSize: 18, lineHeight: 22 }}>
                            {valid ? String(d.getDate()).padStart(2, "0") : "—"}
                          </Text>
                          <Text className="font-semibold text-ink-subtle uppercase" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.8 }}>
                            {valid ? MONTHS[d.getMonth()] : ""}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text className="text-sm font-medium text-ink" numberOfLines={2}>
                            {event.title}
                          </Text>
                          <Text className="text-xs text-ink-subtle" style={{ marginTop: 2 }} numberOfLines={2}>
                            {[event.time, event.subtitle].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </Panel>
            </View>
          </View>

          {/* Financeiro + alunos */}
          <View style={row()}>
            <View style={{ flex: 1, width: isMobile ? "100%" : undefined }}>
              <Panel title="Financeiro" description="Cobranças do cursinho.">
                <View style={{ gap: 12 }}>
                  {[
                    { label: "Recebido no mês", value: formatBrl(data.finance.paid_month_amount), sub: `${formatInt(data.finance.paid_month_count)} pagamentos`, tone: null },
                    { label: "Em aberto", value: formatBrl(data.finance.open_amount), sub: `${formatInt(data.finance.open_count)} cobranças`, tone: null },
                    {
                      label: "Vencidas",
                      value: formatBrl(data.finance.overdue_amount),
                      sub: `${formatInt(data.finance.overdue_count)} cobranças`,
                      tone: data.finance.overdue_count > 0 ? ("danger" as const) : null,
                    },
                  ].map((item, i) => (
                    <View
                      key={item.label}
                      className={i === 0 ? "" : "border-t border-border"}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: i === 0 ? 0 : 12 }}
                    >
                      <View style={{ flexShrink: 1 }}>
                        <Text className="text-sm text-ink">{item.label}</Text>
                        <Text className="text-xs text-ink-subtle">{item.sub}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text className="font-mono font-medium text-ink" style={{ fontSize: 15 }}>
                          {item.value}
                        </Text>
                        {item.tone === "danger" && <Badge label="Atenção" tone="danger" dot />}
                      </View>
                    </View>
                  ))}
                  <Text className="text-xs text-ink-subtle" style={{ marginTop: 4 }}>
                    {formatInt(data.finance.enrollments_active)} matrículas ativas · {formatInt(data.finance.exam_passes_30d)} aprovações em simulados (≥70%) nos últimos 30 dias
                  </Text>
                </View>
              </Panel>
            </View>

            <View style={{ flex: 1, width: isMobile ? "100%" : undefined }}>
              <Panel title="Alunos" description={`${formatInt(data.students_breakdown.total)} cadastrados.`}>
                {/* Proporção em uma barra (uma medida, partes de um todo) + valores em texto */}
                <View
                  className="flex-row rounded-ds-sm overflow-hidden"
                  style={{ height: 10, gap: 2, marginBottom: 16 }}
                  role="img"
                  aria-label={data.students_breakdown.segments.map((s) => `${s.label}: ${s.count} (${s.percent}%)`).join("; ")}
                >
                  {data.students_breakdown.segments
                    .filter((s) => s.count > 0)
                    .map((s, i) => (
                      <View key={s.key} style={{ flex: s.count, backgroundColor: i === 0 ? color.brand : color["border-strong"] }} />
                    ))}
                </View>
                {data.students_breakdown.segments.map((s, i) => (
                  <View
                    key={s.key}
                    className={i === 0 ? "" : "border-t border-border"}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
                  >
                    <View style={{ width: 10, height: 10, backgroundColor: i === 0 ? color.brand : color["border-strong"] }} aria-hidden />
                    <Text className="text-sm text-ink" style={{ flex: 1 }}>
                      {s.label}
                    </Text>
                    <Text className="font-mono text-ink" style={{ fontSize: 13 }}>
                      {formatInt(s.count)}
                    </Text>
                    <Text className="font-mono text-ink-subtle" style={{ fontSize: 13, width: 56, textAlign: "right" }}>
                      {s.percent.toLocaleString("pt-BR")}%
                    </Text>
                  </View>
                ))}
              </Panel>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
