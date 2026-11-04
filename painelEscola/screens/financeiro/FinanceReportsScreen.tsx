import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight, FileDown, FileSpreadsheet, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import FormSelect from "../../components/ui/FormSelect";
import { FinanceKpiCard } from "../../components/financeiro/FinanceCharts";
import { fmtMoney } from "../../components/financeiro/format";
import { transactionTypeLabel } from "../../components/finance/reconciliation/reconciliationLabels";
import { fmtDateTime } from "../../components/finance/cora/coraEvents";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { brl, exportFinancePdf, exportFinanceXlsx, isoDate, num } from "../../utils/financeExports";
import { fetchConsolidatedReport, type ConsolidatedReport } from "../../services/financeReports";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};

const STATUS_LABEL = { pending: "Pendente", divergent: "Divergente" } as const;

/**
 * Financeiro › Relatórios financeiros: resultado consolidado (recebido − pago), despesas por categoria,
 * posição atual e conciliações pendentes, em PDF e Excel. Os relatórios de cobranças e de fluxo de caixa
 * ficam nas telas de origem, também com PDF e Excel.
 */
export default function FinanceReportsScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [monthTo, setMonthTo] = useState(currentMonth());
  const [monthFrom, setMonthFrom] = useState(shiftMonth(currentMonth(), -5));
  const [data, setData] = useState<ConsolidatedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState("");

  const monthOptions = useMemo(() => {
    const base = currentMonth();
    return Array.from({ length: 30 }, (_, i) => shiftMonth(base, 3 - i)).map((m) => ({ value: m, label: monthLabel(m) }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchConsolidatedReport(monthFrom, monthTo));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o relatório."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo]);

  useEffect(() => {
    load();
  }, [load]);

  const periodText = data ? `${isoDate(data.period.from)} a ${isoDate(data.period.to)}` : "";
  const fileName = data ? `relatorio-consolidado-${data.period.from.slice(0, 7)}-a-${data.period.to.slice(0, 7)}` : "relatorio-consolidado";
  const pending = (data?.reconciliation.summary ?? []).reduce((s, r) => ({ count: s.count + r.count, amount: s.amount + Number(r.amount) }), { count: 0, amount: 0 });

  const runPdf = async () => {
    if (!data) return;
    setExporting("pdf");
    try {
      await exportFinancePdf({
        fileName,
        overline: "Relatório financeiro",
        title: "Resultado consolidado",
        description: `${periodText} · receitas recebidas e despesas pagas registradas no sistema (não é o saldo do banco).`,
        facts: [
          { label: "Receitas recebidas", value: brl(data.totals.revenue) },
          { label: "Despesas pagas", value: brl(data.totals.expenses) },
          { label: "Resultado", value: brl(data.totals.result) },
        ],
        sections: [
          {
            title: "Resultado por mês",
            head: ["Mês", "Receitas recebidas", "Despesas pagas", "Resultado"],
            body: data.months.map((m) => [m.label, brl(m.revenue), brl(m.expenses), brl(m.result)]),
            foot: ["Total", brl(data.totals.revenue), brl(data.totals.expenses), brl(data.totals.result)],
            numeric: [1, 2, 3],
          },
          {
            title: "Despesas pagas por categoria",
            head: ["Categoria", "Despesas", "Valor"],
            body: data.expenses_by_category.map((c) => [c.name, String(c.count), brl(c.amount)]),
            numeric: [1, 2],
            empty: "Nenhuma despesa paga no período.",
          },
          {
            title: `Posição em ${isoDate(data.today)}`,
            head: ["", "Quantidade", "Valor"],
            body: [
              ["A receber (em aberto)", String(data.position.receivable_open.count), brl(data.position.receivable_open.amount)],
              ["A receber vencido", String(data.position.receivable_overdue.count), brl(data.position.receivable_overdue.amount)],
              ["A pagar (em aberto)", String(data.position.payable_open.count), brl(data.position.payable_open.amount)],
              ["A pagar vencido", String(data.position.payable_overdue.count), brl(data.position.payable_overdue.amount)],
            ],
            numeric: [1, 2],
          },
          {
            title: "Conciliações pendentes",
            head: ["Data", "Tipo", "Movimentação", "Situação", "Valor"],
            body: data.reconciliation.items.map((e) => [
              fmtDateTime(e.occurred_at),
              transactionTypeLabel(e.transaction_type),
              [e.description, e.counterparty_name].filter(Boolean).join(" · ") || "—",
              STATUS_LABEL[e.status],
              `${e.direction === "credit" ? "+" : "−"} ${brl(e.amount)}`,
            ]),
            numeric: [4],
            empty: "Nenhuma movimentação pendente.",
          },
        ],
      });
    } catch {
      setError("Não foi possível gerar o PDF.");
    } finally {
      setExporting(null);
    }
  };

  const runXlsx = () => {
    if (!data) return;
    setExporting("xlsx");
    try {
      exportFinanceXlsx(fileName, [
        {
          name: "Resultado por mês",
          rows: [
            ["Resultado consolidado", periodText],
            [],
            ["Mês", "Receitas recebidas (R$)", "Despesas pagas (R$)", "Resultado (R$)"],
            ...data.months.map((m) => [m.label, num(m.revenue), num(m.expenses), num(m.result)]),
            ["Total", num(data.totals.revenue), num(data.totals.expenses), num(data.totals.result)],
          ],
        },
        { name: "Despesas por categoria", rows: [["Categoria", "Despesas", "Valor (R$)"], ...data.expenses_by_category.map((c) => [c.name, c.count, num(c.amount)])] },
        {
          name: "Posição",
          rows: [
            ["Posição em", isoDate(data.today)],
            [],
            ["", "Quantidade", "Valor (R$)"],
            ["A receber (em aberto)", data.position.receivable_open.count, num(data.position.receivable_open.amount)],
            ["A receber vencido", data.position.receivable_overdue.count, num(data.position.receivable_overdue.amount)],
            ["A pagar (em aberto)", data.position.payable_open.count, num(data.position.payable_open.amount)],
            ["A pagar vencido", data.position.payable_overdue.count, num(data.position.payable_overdue.amount)],
          ],
        },
        {
          name: "Conciliações pendentes",
          rows: [
            ["Data", "Entrada/Saída", "Tipo", "Descrição", "Contraparte", "Situação", "Divergência", "Valor (R$)"],
            ...data.reconciliation.items.map((e) => [
              fmtDateTime(e.occurred_at),
              e.direction === "credit" ? "Entrada" : "Saída",
              transactionTypeLabel(e.transaction_type),
              e.description ?? "",
              e.counterparty_name ?? "",
              STATUS_LABEL[e.status],
              e.divergence ?? "",
              num(e.amount),
            ]),
          ],
        },
      ]);
    } finally {
      setExporting(null);
    }
  };

  const link = (title: string, description: string, screen: string) => (
    <Pressable key={screen} onPress={() => navigate(screen)} accessibilityRole="link" className="flex-row items-center bg-surface border border-border rounded-ds-md" style={{ flex: 1, minWidth: isMobile ? "100%" : 280, padding: 16, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        <Text className="text-xs text-ink-muted">{description}</Text>
      </View>
      <ChevronRight size={18} color={color["ink-muted"]} />
    </Pressable>
  );

  const maxCategory = Math.max(1, ...(data?.expenses_by_category ?? []).map((c) => Number(c.amount)));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Relatórios financeiros" }]}
        title="Relatórios financeiros"
        description="Resultado consolidado, despesas por categoria e conciliações pendentes, em PDF e Excel."
        actions={
          <>
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
            {Platform.OS === "web" ? (
              <>
                <Button icon={FileSpreadsheet} label="Excel" onPress={runXlsx} loading={exporting === "xlsx"} disabled={!data || !!exporting} />
                <Button variant="primary" icon={FileDown} label="PDF" onPress={runPdf} loading={exporting === "pdf"} disabled={!data || !!exporting} />
              </>
            ) : null}
          </>
        }
      />

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {link("Cobranças, inadimplência e receitas por turma", "Relatório de contas a receber com 4 modelos de PDF e Excel.", "relatorios-financeiro")}
        {link("Fluxo de caixa", "Realizado × previsto por dia, semana ou mês, com PDF e Excel.", "financeiro-fluxo-de-caixa")}
        {link("Contas a pagar", "Lista de despesas filtrada, com PDF e Excel.", "financeiro-contas-a-pagar")}
      </View>

      <View className="bg-surface border border-border rounded-ds-md flex-row flex-wrap" style={{ padding: 16, gap: 12 }}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 200 }}>
          <FormSelect label="De" value={monthFrom} options={monthOptions} onChange={setMonthFrom} />
        </View>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 200 }}>
          <FormSelect label="Até" value={monthTo} options={monthOptions} onChange={setMonthTo} />
        </View>
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
              <FinanceKpiCard label="Receitas recebidas" value={fmtMoney(data.totals.revenue)} footnote={periodText} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard label="Despesas pagas" value={fmtMoney(data.totals.expenses)} footnote={periodText} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard label="Resultado" value={fmtMoney(data.totals.result)} footnote="recebido − pago no período" tone={Number(data.totals.result) < 0 ? "danger" : "default"} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
              <FinanceKpiCard label="Conciliações pendentes" value={String(pending.count)} footnote={`${fmtMoney(pending.amount)} sem decisão no extrato`} />
            </View>
          </View>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1.4, minWidth: isMobile ? "100%" : 420, padding: 20, gap: 12 }}>
              <Text className="text-base font-semibold text-ink">Resultado por mês</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
                <View className="border border-border" style={{ minWidth: 480, width: "100%" }}>
                  {[["Mês", "Recebido", "Pago", "Resultado"], ...data.months.map((m) => [m.label, fmtMoney(m.revenue), fmtMoney(m.expenses), fmtMoney(m.result)]), ["Total", fmtMoney(data.totals.revenue), fmtMoney(data.totals.expenses), fmtMoney(data.totals.result)]].map(
                    (cells, i, all) => {
                      const header = i === 0;
                      const total = i === all.length - 1;
                      return (
                        <View key={i} className={`flex-row ${header || total ? "bg-surface-sunken" : ""} ${i > 0 ? "border-t border-border" : ""}`} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                          {cells.map((c, j) => (
                            <Text
                              key={j}
                              className={`${header ? "text-xs font-semibold text-ink-muted" : `text-sm ${j > 0 ? "font-mono" : ""} ${total ? "font-semibold" : ""} ${j === 3 && c.startsWith("-") ? "text-danger" : "text-ink"}`}`}
                              style={{ flex: 1, textAlign: j === 0 ? "left" : "right" }}
                            >
                              {c}
                            </Text>
                          ))}
                        </View>
                      );
                    }
                  )}
                </View>
              </ScrollView>
            </View>

            <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1, minWidth: isMobile ? "100%" : 300, padding: 20, gap: 12 }}>
              <Text className="text-base font-semibold text-ink">Despesas pagas por categoria</Text>
              {data.expenses_by_category.length === 0 ? (
                <Text className="text-sm text-ink-muted">Nenhuma despesa paga no período.</Text>
              ) : (
                data.expenses_by_category.map((c) => (
                  <View key={c.name} style={{ gap: 4 }}>
                    <View className="flex-row justify-between" style={{ gap: 8 }}>
                      <Text className="text-sm text-ink">{`${c.name} (${c.count})`}</Text>
                      <Text className="text-sm font-mono text-ink">{fmtMoney(c.amount)}</Text>
                    </View>
                    <View className="bg-surface-sunken" style={{ height: 8 }}>
                      <View style={{ height: 8, width: `${Math.max(1, (Number(c.amount) / maxCategory) * 100)}%`, backgroundColor: color["data-2"] }} />
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 12 }}>
            <Text className="text-base font-semibold text-ink">{`Posição em ${isoDate(data.today)}`}</Text>
            <View className="flex-row flex-wrap">
              {[
                ["A receber (em aberto)", data.position.receivable_open],
                ["A receber vencido", data.position.receivable_overdue],
                ["A pagar (em aberto)", data.position.payable_open],
                ["A pagar vencido", data.position.payable_overdue],
              ].map(([label, total]) => {
                const t = total as { count: number; amount: string };
                return (
                  <View key={label as string} className="border border-border" style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : 200, padding: 12, gap: 2 }}>
                    <Text className="text-xs text-ink-muted">{label as string}</Text>
                    <Text className="text-sm font-mono text-ink">{`${fmtMoney(t.amount)} · ${t.count}`}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 12 }}>
            <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
              <Text className="text-base font-semibold text-ink">Conciliações pendentes</Text>
              <Button size="sm" label="Abrir conciliação" onPress={() => navigate("financeiro-conciliacao")} />
            </View>
            {data.reconciliation.items.length === 0 ? (
              <Text className="text-sm text-ink-muted">Nenhuma movimentação pendente.</Text>
            ) : (
              <>
                {data.reconciliation.items.slice(0, 15).map((e, i) => (
                  <View key={i} className="flex-row border-b border-border" style={{ paddingVertical: 6, gap: 8 }}>
                    <Text className="text-xs font-mono text-ink-muted" style={{ width: 110 }}>{fmtDateTime(e.occurred_at)}</Text>
                    <Text className="text-sm text-ink" style={{ flex: 1 }} numberOfLines={1}>
                      {[e.description, e.counterparty_name].filter(Boolean).join(" · ") || transactionTypeLabel(e.transaction_type)}
                    </Text>
                    <Text className={`text-xs ${e.status === "divergent" ? "text-danger" : "text-warning"}`} style={{ width: 80 }}>
                      {STATUS_LABEL[e.status]}
                    </Text>
                    <Text className={`text-sm font-mono ${e.direction === "credit" ? "text-ink" : "text-danger"}`} style={{ width: 110, textAlign: "right" }}>
                      {`${e.direction === "credit" ? "+" : "−"} ${fmtMoney(e.amount)}`}
                    </Text>
                  </View>
                ))}
                <Text className="text-xs text-ink-muted">
                  {`Mostrando ${Math.min(15, data.reconciliation.items.length)} de ${pending.count}. A lista completa${data.reconciliation.items_limited ? " (até 500)" : ""} vai no PDF e no Excel.`}
                </Text>
              </>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
