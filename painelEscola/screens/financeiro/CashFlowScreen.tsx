import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { FileDown, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SegmentedControl from "../../components/bi/SegmentedControl";
import { FinanceKpiCard } from "../../components/financeiro/FinanceCharts";
import { fmtMoney } from "../../components/financeiro/format";
import { CashFlowColumns, CumulativeLine } from "../../components/finance/cashflow/CashFlowCharts";
import { fmtDateTime } from "../../components/finance/cora/coraEvents";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import { fetchCashFlow, type CashFlow, type CashFlowBucket, type CashFlowGranularity } from "../../services/cashFlow";
import { fetchPayablesOptions, type PayablesOptions } from "../../services/payables";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");
const noun = { daily: "Dia", weekly: "Semana", monthly: "Mês" } as const;

/** Planilha CSV (abre no Excel: separador ";" e BOM UTF-8), no mesmo formato do relatório financeiro. */
function exportCsv(data: CashFlow) {
  const n = (v: string | null) => (v === null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const header = [noun[data.granularity], "Situação", "Entradas previstas", "Entradas realizadas", "Saídas previstas", "Saídas realizadas", "Resultado do intervalo", "Resultado acumulado"];
  const lines = data.buckets.map((b) =>
    [`${fmtDate(b.start)} a ${fmtDate(b.end)}`, b.state === "future" ? "Previsto" : b.state === "current" ? "Em andamento" : "Realizado", n(b.planned_in), n(b.realized_in), n(b.planned_out), n(b.realized_out), n(b.flow), n(b.cumulative)].join(";")
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fluxo-de-caixa-${data.period.from}-a-${data.period.to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Financeiro › Fluxo de caixa: realizado × previsto calculado pelo sistema. O resultado acumulado começa em zero
 * no período; saldo bancário só aparece quando a própria Cora o informou no extrato.
 */
export default function CashFlowScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [granularity, setGranularity] = useState<CashFlowGranularity>("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [options, setOptions] = useState<PayablesOptions | null>(null);
  const [data, setData] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await fetchCashFlow({
          granularity,
          // Período só vale com as duas datas; sem elas, o servidor usa o padrão da visão.
          ...(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : {}),
          category_id: categoryId ? Number(categoryId) : "",
          cost_center_id: costCenterId ? Number(costCenterId) : "",
        })
      );
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o fluxo de caixa."));
    } finally {
      setLoading(false);
    }
  }, [granularity, dateFrom, dateTo, categoryId, costCenterId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchPayablesOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  const changeGranularity = (next: CashFlowGranularity) => {
    setGranularity(next);
    setDateFrom("");
    setDateTo("");
  };

  const row = (b: CashFlowBucket) => {
    const flow = Number(b.flow);
    return (
      <View key={b.key} className={`flex-row border-b border-border ${b.state === "future" ? "bg-surface-sunken" : ""}`} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
        <View className="flex-row items-center" style={{ width: 170, gap: 6 }}>
          <Text className={`text-sm font-mono ${b.state === "current" ? "font-semibold text-ink" : "text-ink"}`}>{b.label}</Text>
          {b.state === "future" ? (
            <View className="border border-border-strong px-1">
              <Text className="text-ink-muted" style={{ fontSize: 9, letterSpacing: 0.5 }}>PREVISTO</Text>
            </View>
          ) : b.state === "current" ? (
            <View className="border border-brand px-1">
              <Text className="text-brand" style={{ fontSize: 9, letterSpacing: 0.5 }}>HOJE</Text>
            </View>
          ) : null}
        </View>
        {[b.planned_in, b.realized_in, b.planned_out, b.realized_out].map((v, i) => (
          <Text key={i} className="text-sm font-mono text-ink" style={{ flex: 1, textAlign: "right" }}>
            {v === null ? "—" : fmtMoney(v)}
          </Text>
        ))}
        <Text className={`text-sm font-mono ${flow < 0 ? "text-danger" : "text-ink"}`} style={{ flex: 1, textAlign: "right" }}>
          {fmtMoney(b.flow)}
        </Text>
        <Text className="text-sm font-mono text-ink" style={{ flex: 1, textAlign: "right" }}>
          {fmtMoney(b.cumulative)}
        </Text>
      </View>
    );
  };

  const outside = data?.outside_projection;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Fluxo de caixa" }]}
        title="Fluxo de caixa"
        description="Entradas e saídas realizadas e o que está previsto, calculados pelo sistema."
        actions={
          <>
            <SegmentedControl<CashFlowGranularity>
              accessibilityLabel="Visão"
              value={granularity}
              onChange={changeGranularity}
              options={[
                { value: "daily", label: "Diário" },
                { value: "weekly", label: "Semanal" },
                { value: "monthly", label: "Mensal" },
              ]}
            />
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
            {Platform.OS === "web" && data ? <Button icon={FileDown} label="Exportar" onPress={() => exportCsv(data)} /> : null}
          </>
        }
      />

      {data ? (
        <Text className="text-sm text-ink-muted">
          {`Período: ${fmtDate(data.period.from)} a ${fmtDate(data.period.to)} · hoje: ${fmtDate(data.today)} · conta: Cora (e baixas manuais registradas no sistema)`}
        </Text>
      ) : null}

      <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 8 }}>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}>
            <DatePickerInput label="De" value={dateFrom ? isoToDisplay(dateFrom) : ""} onChangeText={(v) => setDateFrom(displayToISO(v))} />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}>
            <DatePickerInput label="Até" value={dateTo ? isoToDisplay(dateTo) : ""} onChangeText={(v) => setDateTo(displayToISO(v))} />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormSelect
              label="Categoria (saídas)"
              value={categoryId}
              options={[{ value: "", label: "Todas" }, ...(options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
              onChange={setCategoryId}
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormSelect
              label="Centro de custo (saídas)"
              value={costCenterId}
              options={[{ value: "", label: "Todos" }, ...(options?.cost_centers ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
              onChange={setCostCenterId}
            />
          </View>
        </View>
        {(dateFrom && !dateTo) || (!dateFrom && dateTo) ? <Text className="text-xs text-ink-muted">Informe as duas datas para usar um período próprio.</Text> : null}
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      {loading && !data ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : data ? (
        <>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard label="Entradas realizadas" value={fmtMoney(data.realized.inflow)} footnote={`${fmtDate(data.realized.from)} a ${fmtDate(data.realized.to)}`} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard label="Saídas realizadas" value={fmtMoney(data.realized.outflow)} footnote={`${fmtDate(data.realized.from)} a ${fmtDate(data.realized.to)}`} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard
                label={`Resultado projetado até ${fmtDate(data.period.to)}`}
                value={fmtMoney(data.projected_result)}
                footnote="desde o início do período, se tudo for pago em dia"
                tone={Number(data.projected_result) < 0 ? "danger" : "default"}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard
                label="Saldo na Cora"
                value={data.bank_balance ? fmtMoney(data.bank_balance.amount) : "—"}
                footnote={
                  data.bank_balance
                    ? `informado pela Cora no extrato · sincronizado ${fmtDateTime(data.bank_balance.synced_at)}`
                    : "ainda não informado pela Cora: sincronize o extrato na Conciliação"
                }
              />
            </View>
          </View>

          {outside && (outside.overdue_receivables.count > 0 || outside.overdue_payables.count > 0) ? (
            <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, borderLeftWidth: 3, borderLeftColor: color.warning }}>
              <Text className="text-sm text-ink">
                <Text className="font-semibold">Fora da projeção: </Text>
                {[
                  outside.overdue_receivables.count > 0 ? `${outside.overdue_receivables.count} cobrança(s) vencida(s), ${fmtMoney(outside.overdue_receivables.amount)}` : null,
                  outside.overdue_payables.count > 0 ? `${outside.overdue_payables.count} despesa(s) vencida(s), ${fmtMoney(outside.overdue_payables.amount)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . A projeção só conta o que vence a partir de hoje.{" "}
                <Text className="text-brand underline" role="link" onPress={() => navigate("cobrancas")}>
                  Ver cobranças
                </Text>
              </Text>
            </View>
          ) : null}

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1.6, minWidth: isMobile ? "100%" : 420, padding: 20, gap: 12 }}>
              <View>
                <Text className="text-base font-semibold text-ink">{`Entradas e saídas por ${noun[granularity].toLowerCase()}`}</Text>
                <Text className="text-sm text-ink-muted">Barras cheias = realizado · contorno tracejado = previsto.</Text>
              </View>
              <CashFlowColumns buckets={data.buckets} />
            </View>
            <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1, minWidth: isMobile ? "100%" : 300, padding: 20, gap: 12 }}>
              <View>
                <Text className="text-base font-semibold text-ink">Resultado acumulado</Text>
                <Text className="text-sm text-ink-muted">{`Fim de cada ${noun[granularity].toLowerCase()}, a partir de zero no início do período.`}</Text>
              </View>
              <CumulativeLine buckets={data.buckets} />
              <View className="border border-border bg-surface-sunken px-3 py-2" style={{ borderLeftWidth: 3, borderLeftColor: color["ink-muted"] }}>
                <Text className="text-xs text-ink-muted">Calculado pelo sistema com as cobranças e despesas registradas; não é o saldo confirmado pelo banco.</Text>
              </View>
            </View>
          </View>

          <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 12 }}>
            <View>
              <Text className="text-base font-semibold text-ink">Previsto × realizado</Text>
              <Text className="text-sm text-ink-muted">Linhas marcadas como previsto ainda não aconteceram.</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
              <View style={{ minWidth: 900, width: "100%" }} className="border border-border">
                <View className="flex-row border-b border-border bg-surface-sunken" style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                  {[noun[granularity], "Entradas previstas", "Entradas realizadas", "Saídas previstas", "Saídas realizadas", "Resultado", "Acumulado"].map((h, i) => (
                    <Text key={h} className="text-xs font-semibold text-ink-muted" style={i === 0 ? { width: 170 } : { flex: 1, textAlign: "right" }}>
                      {h}
                    </Text>
                  ))}
                </View>
                {data.buckets.map(row)}
                <View className="flex-row" style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                  <View style={{ width: 170 }}>
                    <Text className="text-sm font-semibold text-ink">Total do período</Text>
                    <Text className="text-xs text-ink-muted">{`realizado até ${fmtDate(data.realized.to)}`}</Text>
                  </View>
                  {[data.totals.planned_in, data.totals.realized_in, data.totals.planned_out, data.totals.realized_out, data.realized.net, data.projected_result].map((v, i) => (
                    <Text key={i} className="text-sm font-mono font-semibold text-ink" style={{ flex: 1, textAlign: "right" }}>
                      {fmtMoney(v)}
                    </Text>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
