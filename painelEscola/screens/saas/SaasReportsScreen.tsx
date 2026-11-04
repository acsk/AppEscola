import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { FileDown, FileSpreadsheet } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Tabs from "../../components/ui/Tabs";
import DatePickerInput from "../../components/ui/DatePickerInput";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import { exportFinancePdf, exportFinanceXlsx, type ExportSection } from "../../utils/financeExports";
import { cycleLabel, fetchSaasReport, fmtBrl, fmtDateTime, fmtInt, fmtIsoDate, type ReportEvent, type SaasReportType } from "../../services/saas";

const TITLES: Record<SaasReportType, string> = {
  commercial: "Comercial",
  operational: "Operacional",
  retention: "Retenção",
};

const DESCRIPTIONS: Record<SaasReportType, string> = {
  commercial: "MRR, receita por plano e por instituição, novas assinaturas, cancelamentos, upgrades, downgrades e atrasos.",
  operational: "Instituições mais ativas, crescimento de alunos, adoção dos módulos, uso de IA e falhas de integração.",
  retention: "Instituições sem atividade, vencimentos próximos, testes em andamento, cancelamentos por motivo e reativações.",
};

/** Seção do relatório: a mesma definição alimenta a tela, o PDF e o Excel. */
type Section = ExportSection & { cells: (string | number)[][] };

const section = (title: string, head: string[], cells: (string | number)[][], numeric: number[] = [], empty = "Nada no período."): Section => ({
  title,
  head,
  cells,
  body: cells.map((row) => row.map((c) => (typeof c === "number" ? fmtInt(c) : c))),
  numeric,
  empty,
});

const eventRows = (events: ReportEvent[], extra: (e: ReportEvent) => string) => events.map((e) => [fmtDateTime(e.at), e.tenant ?? "—", extra(e), e.user ?? "Sistema"]);

function buildSections(type: SaasReportType, d: any): Section[] {
  if (type === "commercial") {
    return [
      section("Receita por plano", ["Plano", "Assinaturas", "Pagantes", "MRR"], d.by_plan.map((p: any) => [p.plan, p.subscriptions, p.paying, fmtBrl(p.mrr)]), [1, 2, 3], "Nenhuma assinatura."),
      section("Receita por instituição", ["Instituição", "Plano", "Ciclo", "MRR"], d.by_tenant.map((t: any) => [t.tenant ?? "—", t.plan ?? "—", cycleLabel(t.cycle), fmtBrl(t.mrr)]), [3], "Nenhuma assinatura pagante."),
      section("Novas assinaturas", ["Data", "Instituição", "Plano", "Por"], eventRows(d.new_subscriptions, (e) => e.to_plan ?? "—")),
      section("Cancelamentos", ["Data", "Instituição", "Motivo", "Por"], eventRows(d.cancellations, (e) => e.reason ?? "—")),
      section(`Trocas de plano (${d.upgrades} upgrades · ${d.downgrades} downgrades)`, ["Data", "Instituição", "Mudança", "Por"], eventRows(d.plan_changes, (e) => `${e.from_plan ?? "—"} → ${e.to_plan ?? "—"} (${e.direction === "downgrade" ? "downgrade" : "upgrade"})`)),
      section("Assinaturas em atraso", ["Instituição", "Plano", "Vencimento", "Valor"], d.overdue.map((o: any) => [o.tenant ?? "—", o.plan ?? "—", fmtIsoDate(o.due), fmtBrl(o.amount)]), [3], "Nenhuma assinatura em atraso."),
    ];
  }
  if (type === "operational") {
    return [
      section("Instituições mais ativas", ["Instituição", "Questões respondidas", "Simulados concluídos"], d.most_active.map((r: any) => [r.tenant, r.practice_answers, r.exam_attempts]), [1, 2]),
      section("Crescimento de alunos", ["Instituição", "Novos alunos"], d.student_growth.map((r: any) => [r.tenant, r.new_students]), [1]),
      section("Adoção dos módulos", ["Módulo", "Instituições com acesso", "Total"], d.module_adoption.map((r: any) => [r.feature, r.tenants, r.total]), [1, 2]),
      section("Uso de IA", ["Instituição", "Gerações concluídas", "Gerações com falha", "Documentos importados"], d.ai_usage.map((r: any) => [r.tenant, r.generated, r.failed, r.documents]), [1, 2, 3]),
      section("Integrações com falha", ["Instituição", "Avisos Cora", "Extratos Cora"], d.integration_failures.map((r: any) => [r.tenant, r.cora_webhooks, r.statement_syncs]), [1, 2], "Nenhuma falha no período."),
    ];
  }
  return [
    section("Instituições ativas sem atividade há 30 dias", ["Instituição", "Cadastrada em"], d.inactive_tenants.map((r: any) => [r.tenant, fmtIsoDate(r.created_at)]), [], "Todas tiveram atividade."),
    section("Vencimentos nos próximos 15 dias", ["Instituição", "Plano", "Vencimento"], d.due_soon.map((r: any) => [r.tenant ?? "—", r.plan ?? "—", fmtIsoDate(r.due)]), [], "Nenhum vencimento próximo."),
    section("Em período de teste", ["Instituição", "Plano", "Teste até"], d.trials.map((r: any) => [r.tenant ?? "—", r.plan ?? "—", fmtIsoDate(r.trial_ends_at)]), [], "Nenhuma instituição em teste."),
    section("Cancelamentos por motivo", ["Motivo", "Cancelamentos"], d.cancellations_by_reason.map((r: any) => [r.reason, r.count]), [1]),
    section("Reativações", ["Data", "Instituição", "Detalhe", "Por"], eventRows(d.reactivations, () => "Reativada")),
  ];
}

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
};

/** Plataforma › Relatórios › Relatórios SaaS: comercial, operacional e retenção, com PDF e Excel. */
export default function SaasReportsScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [type, setType] = useState<SaasReportType>("commercial");
  const [from, setFrom] = useState(isoToDisplay(daysAgo(29)));
  const [to, setTo] = useState(isoToDisplay(today()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const load = useCallback(async () => {
    const isoFrom = displayToISO(from);
    const isoTo = displayToISO(to);
    if (!isoFrom || !isoTo) return;
    if (isoFrom > isoTo) {
      setError("A data inicial deve ser anterior à final.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await fetchSaasReport(type, isoFrom, isoTo));
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o relatório."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [type, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => (data ? buildSections(type, data) : []), [data, type]);
  const periodText = data ? `${fmtIsoDate(data.period.from)} a ${fmtIsoDate(data.period.to)}` : "";
  const fileName = `relatorio-saas-${type}-${data?.period.from ?? ""}-a-${data?.period.to ?? ""}`;

  const runPdf = async () => {
    setExporting("pdf");
    try {
      await exportFinancePdf({
        fileName,
        overline: "Relatório da plataforma",
        title: `Relatório ${TITLES[type].toLowerCase()}`,
        description: `${periodText} · ${DESCRIPTIONS[type]}`,
        facts: type === "commercial" ? [{ label: "MRR atual", value: fmtBrl(data.mrr) }] : undefined,
        sections,
        landscape: true,
      });
    } catch {
      setError("Não foi possível gerar o PDF.");
    } finally {
      setExporting(null);
    }
  };

  const runXlsx = () => {
    setExporting("xlsx");
    try {
      exportFinanceXlsx(fileName, sections.map((s) => ({ name: s.title.replace(/[\\/?*[\]:]/g, "").slice(0, 31), rows: [s.head, ...s.cells] })));
    } finally {
      setExporting(null);
    }
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Relatórios" }, { label: "Relatórios SaaS" }]}
        title="Relatórios SaaS"
        description="Relatórios globais da plataforma. Receita é só de assinaturas SaaS, nunca das mensalidades das escolas."
        actions={
          Platform.OS === "web" ? (
            <>
              <Button icon={FileSpreadsheet} label="Excel" onPress={runXlsx} loading={exporting === "xlsx"} disabled={!data || !!exporting} />
              <Button variant="primary" icon={FileDown} label="PDF" onPress={runPdf} loading={exporting === "pdf"} disabled={!data || !!exporting} />
            </>
          ) : null
        }
      />

      <Tabs<SaasReportType>
        accessibilityLabel="Tipo de relatório"
        value={type}
        onChange={(t) => {
          setData(null);
          setType(t);
        }}
        items={(Object.keys(TITLES) as SaasReportType[]).map((id) => ({ id, label: TITLES[id] }))}
      />

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <View style={{ width: isMobile ? "100%" : 180 }}>
          <DatePickerInput label="De" value={from} onChangeText={setFrom} compact />
        </View>
        <View style={{ width: isMobile ? "100%" : 180 }}>
          <DatePickerInput label="Até" value={to} onChangeText={setTo} compact />
        </View>
        <Text className="text-xs text-ink-muted" style={{ alignSelf: "center", flex: 1, minWidth: 220 }}>{DESCRIPTIONS[type]}</Text>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      {loading && !data ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : (
        sections.map((s) => (
          <Panel key={s.title} title={s.title} description={type === "commercial" && s.title === "Receita por plano" ? `MRR atual: ${fmtBrl(data.mrr)}` : undefined} flush>
            {s.body.length === 0 ? (
              <Text className="text-sm text-ink-subtle" style={{ padding: 20, textAlign: "center" }}>{s.empty}</Text>
            ) : (
              <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
                <View style={{ width: "100%", minWidth: isMobile ? 560 : undefined }}>
                  {[s.head, ...s.body].map((row, i) => (
                    <View key={i} className={`flex-row ${i === 0 ? "bg-surface-sunken" : "border-t border-border"}`} style={{ paddingVertical: 8, paddingHorizontal: 24, gap: 12 }}>
                      {row.map((cell, j) => {
                        const numeric = s.numeric?.includes(j);
                        return (
                          <Text
                            key={j}
                            className={i === 0 ? "text-xs font-medium text-ink-muted" : `text-sm ${numeric ? "font-mono" : ""} text-ink`}
                            style={{ flex: j === 0 ? 2 : 1, textAlign: numeric ? "right" : "left" }}
                            numberOfLines={2}
                          >
                            {cell}
                          </Text>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </Panel>
        ))
      )}
    </ScrollView>
  );
}
