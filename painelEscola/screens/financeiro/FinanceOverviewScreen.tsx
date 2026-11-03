import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import SegmentedControl from "../../components/bi/SegmentedControl";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { FinanceKpiCard, MoneyBars, MonthlyColumns } from "../../components/financeiro/FinanceCharts";
import { PAYMENT_METHOD_LABELS, fmtMoney, toNumber } from "../../components/financeiro/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchFinanceDashboard, type FinanceDashboard } from "../../services/financeDashboard";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Preset = "month" | "last_month" | "90d" | "year";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "90d", label: "90 dias" },
  { value: "year", label: "Ano" },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(preset: Preset) {
  const today = new Date();
  if (preset === "last_month") {
    return { date_from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), date_to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  const from = new Date(today);
  if (preset === "month") from.setDate(1);
  if (preset === "90d") from.setDate(today.getDate() - 89);
  if (preset === "year") from.setMonth(0, 1);
  return { date_from: ymd(from), date_to: ymd(today) };
}

type Trend = "up" | "down" | "flat";
const trendOf = (diff: number): Trend => (diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat");

/** Financeiro › Visão geral: indicadores do período comparados ao período anterior. */
export default function FinanceOverviewScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchFinanceDashboard(presetRange(preset)));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a visão geral financeira."));
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = width >= 1200 ? 4 : width >= 600 ? 2 : 1;
  const tileWidth = `${100 / columns}%` as const;
  const wide = width >= 1100;

  const tiles = useMemo(() => {
    if (!data) return [];
    const { kpis, period, definitions } = data;
    const previous = `vs. ${fmtDate(period.previous_from)} a ${fmtDate(period.previous_to)}`;
    const delta = kpis.received.delta_pct;
    const ticket = kpis.average_ticket;
    const ticketDiff = ticket.amount !== null && ticket.previous_amount !== null ? toNumber(ticket.amount) - toNumber(ticket.previous_amount) : null;
    const rate = kpis.delinquency.rate;
    const prevRate = kpis.delinquency.previous_rate;
    const rateDiff = rate !== null && prevRate !== null ? toNumber(rate) - toNumber(prevRate) : null;

    return [
      {
        key: "receivable",
        label: "A receber",
        value: fmtMoney(kpis.receivable.amount),
        footnote: `${kpis.receivable.count} cobranças em aberto`,
        info: ["Soma das cobranças pendentes ou vencidas, independentemente do período.", data.definitions.scope],
      },
      {
        key: "received",
        label: "Recebido no período",
        value: fmtMoney(kpis.received.amount),
        footnote: previous,
        delta: delta !== null ? { text: `${fmtNumber(Math.abs(toNumber(delta)), 1)}%`, trend: trendOf(toNumber(delta)), goodWhen: "up" as const } : null,
        info: ["Cobranças pagas com data de pagamento dentro do período.", `Período anterior: ${fmtMoney(kpis.received.previous_amount)}.`],
      },
      {
        key: "overdue",
        label: "Vencido",
        value: fmtMoney(kpis.overdue.amount),
        footnote: `${kpis.overdue.count} cobranças`,
        tone: toNumber(kpis.overdue.amount) > 0 ? ("danger" as const) : undefined,
        info: ["Cobranças em aberto com vencimento anterior a hoje, independentemente do período."],
      },
      {
        key: "forecast",
        label: "Previsão 30 dias",
        value: fmtMoney(kpis.forecast_30d.amount),
        footnote: `${kpis.forecast_30d.count} cobranças a vencer`,
        info: ["Cobranças em aberto que vencem de hoje até daqui a 30 dias."],
      },
      {
        key: "ticket",
        label: "Ticket médio",
        value: fmtMoney(ticket.amount),
        footnote: `${ticket.payers} alunos pagantes`,
        delta: ticketDiff !== null ? { text: fmtMoney(Math.abs(ticketDiff)), trend: trendOf(ticketDiff), goodWhen: "up" as const } : null,
        info: ["Recebido no período dividido pelo número de alunos distintos que pagaram."],
      },
      {
        key: "delinquency",
        label: "Inadimplência",
        value: rate !== null ? `${fmtNumber(toNumber(rate), 1)}%` : "—",
        footnote: rate !== null ? `${fmtMoney(kpis.delinquency.overdue_amount)} de ${fmtMoney(kpis.delinquency.due_amount)}` : "Sem vencimentos no período",
        delta: rateDiff !== null ? { text: `${fmtNumber(Math.abs(rateDiff), 1)} pp`, trend: trendOf(rateDiff), goodWhen: "down" as const } : null,
        info: [
          `Das cobranças que venceram no período (até ${definitions.delinquency_grace_days} dias atrás), quanto ainda está em aberto.`,
          `Carência de ${definitions.delinquency_grace_days} dias para não contar atrasos de compensação.`,
        ],
      },
      {
        key: "pending",
        label: "Pendentes",
        value: String(kpis.pending.count),
        footnote: `${kpis.pending.due_next_7_days} vencem em 7 dias`,
        info: ["Quantidade de cobranças em aberto (pendentes ou vencidas)."],
      },
      {
        key: "reconciled",
        label: "Conciliados",
        value: "—",
        footnote: "Disponível com a conciliação bancária",
        tone: "muted" as const,
        info: ["Depende da importação do extrato bancário, prevista para a próxima fase do módulo."],
      },
    ];
  }, [data]);

  const monthly = (data?.charts.monthly ?? []).map((m) => ({
    key: m.period,
    label: m.label,
    expected: toNumber(m.expected_amount),
    received: toNumber(m.received_amount),
  }));
  const hasMonthly = monthly.some((m) => m.expected > 0 || m.received > 0);
  const methods = (data?.charts.by_payment_method ?? []).map((m) => ({
    key: m.key,
    label: PAYMENT_METHOD_LABELS[m.key] ?? m.key,
    amount: toNumber(m.amount),
    count: m.count,
  }));
  const aging = (data?.charts.aging ?? []).map((a) => ({ key: a.key, label: a.label, amount: toNumber(a.amount), count: a.count }));
  const hasAging = aging.some((a) => a.amount > 0);
  const courses = (data?.charts.by_course ?? []).map((c) => ({
    key: String(c.course_id ?? "none"),
    label: c.name,
    amount: toNumber(c.amount),
    count: c.count,
  }));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Visão geral" }]}
        title="Visão geral"
        description="Indicadores de recebimento do período, comparados ao período anterior."
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            <Button label="Gestão de pagamentos" onPress={() => navigate("cobrancas")} />
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
          </View>
        }
      />

      <View className="flex-row flex-wrap items-center" style={{ gap: 12, justifyContent: "space-between" }}>
        <SegmentedControl accessibilityLabel="Período" value={preset} options={PRESETS} onChange={setPreset} />
        {data ? (
          <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
            {`${fmtDate(data.period.from)} a ${fmtDate(data.period.to)}`}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Panel>
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            <Text className="text-danger" style={{ fontSize: 14 }}>
              {error}
            </Text>
            <Button label="Tentar novamente" onPress={load} />
          </View>
        </Panel>
      ) : null}

      {loading && !data ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : null}

      {data ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {tiles.map(({ key, ...tile }) => (
              <View key={key} style={{ width: tileWidth, paddingHorizontal: 8 }}>
                <FinanceKpiCard {...tile} />
              </View>
            ))}
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Previsto × recebido" description="Últimos 6 meses · previsto pela data de vencimento, recebido pela data de pagamento.">
                {hasMonthly ? <MonthlyColumns points={monthly} /> : <EmptyState text="Nenhuma cobrança nos últimos 6 meses." />}
              </Panel>
            </View>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Vencidos por atraso" description="Cobranças em aberto por dias de atraso, hoje.">
                {hasAging ? <MoneyBars items={aging} barColor={color.danger} /> : <EmptyState text="Nenhuma cobrança vencida." />}
              </Panel>
            </View>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Recebido por forma de pagamento" description="Pagamentos com data dentro do período.">
                {methods.length ? <MoneyBars items={methods} /> : <EmptyState text="Nenhum pagamento no período." />}
              </Panel>
            </View>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Recebido por curso" description="Pela matrícula vinculada à cobrança.">
                {courses.length ? <MoneyBars items={courses} /> : <EmptyState text="Nenhum pagamento no período." />}
              </Panel>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>
        {text}
      </Text>
    </View>
  );
}
