import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronRight, FileText, RefreshCw, Settings, Sparkles } from "lucide-react-native";
import Badge from "../ui/Badge";
import { overviewTiles } from "./overviewTiles";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Panel from "../ui/Panel";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiAiLatest, fetchBiAiStatus, generateBiAiDraft, saveBiCriteria, updateBiAiDraft,
  type BiAiDraft, type BiAiStatus, type BiFilters,
} from "../../services/biService";

type Insight = NonNullable<BiAiDraft["content"]["insights"]>[number];
const AREAS: Record<string, string> = {
  geral: "Visão geral", avaliacoes: "Simulados", disciplinas: "Disciplinas e assuntos",
  turmas: "Turmas", engajamento: "Frequência e engajamento", intervencoes: "Acompanhamento",
};
const REASONS = {
  plan: "Os insights com IA estão disponíveis no plano avançado.",
  no_key: "Cadastre uma chave em Configurações → Integração com IA.",
  disabled: "Ative a geração de rascunhos para esta escola.",
};
const TARGET = { kind: "school_insights" as const };
const formatValue = (value: unknown): string => {
  if (value == null) return "Sem dados";
  if (typeof value === "number") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const METRICS = overviewTiles(() => undefined);
const factLabel = (key: string) => METRICS.find((metric) => metric.key === key)?.label ?? key.replace(/\./g, " · ").replace(/_/g, " ");
const factUnit = (key: string) => METRICS.find((metric) => metric.key === key)?.unit ?? "";

export default function SchoolInsightsPanel({ filters, onOpenArea, onOpenSettings }: {
  filters: BiFilters; onOpenArea: (area: string) => void; onOpenSettings?: () => void;
}) {
  const { width, isMobile } = useResponsiveLayout();
  const [draft, setDraft] = useState<BiAiDraft | null>(null);
  const [status, setStatus] = useState<BiAiStatus | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [area, setArea] = useState("all");
  const [showFacts, setShowFacts] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const requestId = useRef(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setDraft(null);
    setStatus(null);
    setError("");
    setArea("all");
    setShowFacts(false);
    setShowWarnings(false);
    Promise.all([fetchBiAiStatus(), fetchBiAiLatest(TARGET, filters)])
      .then(([nextStatus, nextDraft]) => {
        if (id !== requestId.current) return;
        setStatus(nextStatus);
        setDraft(nextDraft);
      })
      .catch((err) => {
        if (id === requestId.current) setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os insights. Tente novamente."));
      })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current++; };
  }, [filtersKey, reload]); // filters is represented by its serialized value.

  const act = async (operation: () => Promise<void>) => {
    const id = requestId.current;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch (err: any) {
      if (id === requestId.current) setError(getApiResponseMessage(err?.response?.data, "Não foi possível concluir a ação."));
    } finally { setBusy(false); }
  };
  const updateDraft = async (operation: () => Promise<BiAiDraft>) => {
    const id = requestId.current;
    const next = await operation();
    if (id !== requestId.current) return;
    setDraft(next.status === "discarded" ? null : next);
    setArea("all");
  };
  const insights = draft?.content.insights ?? [];
  const areas = Object.keys(AREAS).filter((key) => insights.some((insight) => insight.area === key));
  const visible = insights.filter((insight) => area === "all" || insight.area === area);
  const hasWarnings = !!draft?.unverified.length;

  const exportPdf = () => act(async () => {
    if (!draft) return;
    const { jsPDF } = await import("jspdf");
    const { drawDocumentTitle, drawPageFooters, setText, PDF_COLOR, PDF_MARGIN } = await import("../../utils/pdfTheme");
    const doc = new jsPDF();
    let y = drawDocumentTitle(doc, 20, { title: "Insights com IA", overline: "Inteligência Educacional", description: `${draft.period.from} a ${draft.period.to} · ${draft.status === "validated" ? "Revisado" : "Rascunho — revisar antes de compartilhar"}` });
    const write = (text: string, bold = false) => {
      setText(doc, PDF_COLOR.ink, 10, bold ? "bold" : "normal");
      const lines: string[] = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - PDF_MARGIN * 2);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - 22) { doc.addPage(); y = 20; }
        doc.text(line, PDF_MARGIN, y);
        y += 5;
      }
      y += 3;
    };
    if (hasWarnings) write(`Números pendentes de conferência: ${draft.unverified.join(", ")}.`);
    for (const insight of insights) {
      write(`${AREAS[insight.area]} · ${insight.title}`, true);
      write(insight.text);
      write(`Evidências: ${insight.evidence.map((key) => `${key} = ${formatValue(draft.facts[key])}`).join("; ") || "Sem evidência citada"}`);
    }
    write("A IA resume indicadores e pode errar na interpretação. Correlação não é causa. Revise antes de compartilhar.");
    drawPageFooters(doc, "Insights com IA");
    doc.save(`insights-${draft.period.from}-${draft.period.to}.pdf`);
  });

  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row flex-wrap items-center" style={{ justifyContent: "space-between", gap: 12 }}>
        <Text role="heading" aria-level={2} className="font-semibold text-ink" style={{ fontSize: 16 }}>Observações do período</Text>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Button label="Exportar PDF" icon={FileText} size="sm" disabled={!insights.length || loading || busy} onPress={exportPdf} />
          <Button label={draft ? "Gerar novamente" : "Gerar insights"} icon={RefreshCw} size="sm" disabled={loading || !status?.enabled} loading={busy} onPress={() => act(() => updateDraft(() => generateBiAiDraft(TARGET, filters)))} />
        </View>
      </View>
      {!!error && <View role="alert" className="bg-danger-tint border border-danger rounded-ds-md" style={{ padding: 16, gap: 8 }}><Text className="text-danger" style={{ fontSize: 13 }}>{error}</Text><Button label="Tentar novamente" size="sm" disabled={busy || loading} onPress={() => setReload((value) => value + 1)} /></View>}
      {loading ? <ActivityIndicator accessibilityLabel="Carregando insights" color={color.brand} /> : (
        <View style={{ flexDirection: width >= 1200 ? "row" : "column", alignItems: "stretch", gap: 24 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
            <View className="bg-surface border border-border rounded-ds-md" style={{ borderLeftWidth: 3, borderLeftColor: color.brand, padding: isMobile ? 16 : 20, gap: 12 }}>
              <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                <Icon icon={Sparkles} color={color["ink-muted"]} />
                <Text className="font-semibold text-ink-muted" style={{ fontSize: 11, letterSpacing: 0.88 }}>RESUMO DO PERÍODO</Text>
                {draft && <Badge dot label={draft.status === "validated" ? "Revisado" : "Rascunho · revisar"} tone={draft.status === "validated" ? "success" : "warning"} />}
              </View>
              <Text className="text-ink" style={{ fontSize: 15, lineHeight: 24 }}>
                {draft ? `${insights.length} observações em ${areas.length} áreas da escola. Confira os indicadores citados e abra cada área para decidir os próximos passos.` : status?.enabled ? "Gere observações a partir dos indicadores do período selecionado. Os resultados aparecerão aqui com suas evidências e o caminho para agir." : status?.reason ? REASONS[status.reason] : "Os insights estarão disponíveis após carregar a configuração da IA."}
              </Text>
              {draft && <Text className="text-ink-subtle" style={{ fontSize: 12 }}>Gerado em {new Date(draft.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{draft.validated_by ? ` · Revisado por ${draft.validated_by}` : ""}</Text>}
              {!draft && status?.available && status.reason === "disabled" && <Button label="Ativar IA para esta escola" size="sm" loading={busy} onPress={() => act(async () => { const id = requestId.current; await saveBiCriteria({ ai_enabled: true }); const next = await fetchBiAiStatus(); if (id === requestId.current) setStatus(next); })} />}
            </View>

            {!!insights.length && <View role="group" aria-label="Filtrar observações por área" className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
              {["all", ...areas].map((key) => <Pressable key={key} role="button" aria-pressed={area === key} onPress={() => setArea(key)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 12, borderWidth: 1, borderRadius: 4, backgroundColor: area === key ? color.brand : color.surface, borderColor: area === key ? color.brand : color["border-strong"] }}>
                <Text className="font-medium" style={{ fontSize: 13, color: area === key ? color["on-brand"] : color["ink-muted"] }}>{key === "all" ? "Todas" : AREAS[key]}</Text>
                <Text className="font-mono" style={{ fontSize: 11, color: area === key ? color["on-brand"] : color["ink-subtle"] }}>{key === "all" ? insights.length : insights.filter((insight) => insight.area === key).length}</Text>
              </Pressable>)}
            </View>}
            {visible.map((insight, index) => <InsightCard key={`${draft?.id}-${area}-${index}`} insight={insight} facts={draft!.facts} compact={width < 1200} onOpen={() => onOpenArea(insight.area)} />)}
            {draft && !insights.length && <Text className="text-ink-muted" style={{ fontSize: 13 }}>Este rascunho não contém observações. Gere novamente para analisar o período.</Text>}
            {hasWarnings && <View className="bg-surface border border-border-strong rounded-ds-md" style={{ borderStyle: "dashed", padding: 16, gap: 10 }}>
              <Text className="font-semibold text-warning" style={{ fontSize: 13 }}>Há números que precisam de conferência</Text>
              <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 20 }}>A IA citou valores que não aparecem nos indicadores enviados. Confira o texto antes de marcar como revisado ou compartilhar.</Text>
              <Pressable role="button" aria-expanded={showWarnings} onPress={() => setShowWarnings(!showWarnings)}><Text className="text-brand" style={{ fontSize: 13 }}>{showWarnings ? "Ocultar detalhes" : "Ver detalhes"}</Text></Pressable>
              {showWarnings && <Text className="font-mono text-warning" style={{ fontSize: 12 }}>{draft!.unverified.join(", ")}</Text>}
            </View>}
            {draft && <View className="flex-row flex-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
              <Button label="Descartar rascunho" size="sm" disabled={busy} onPress={() => act(() => updateDraft(() => updateBiAiDraft(draft.id, { status: "discarded" })))} />
              {draft.status !== "validated" && <Button label="Marcar como revisado" variant="primary" size="sm" disabled={busy} onPress={() => act(() => updateDraft(() => updateBiAiDraft(draft.id, { status: "validated" })))} />}
            </View>}
          </View>
          <View style={{ width: width >= 1200 ? 300 : "100%", gap: 16 }}>
            <Panel title="Como foi gerado">
              {[
                ["Indicadores enviados", draft ? String(Object.keys(draft.facts).length) : "—"],
                ["Observações geradas", draft ? String(insights.length) : "—"],
                ["Números a conferir", draft ? String(draft.unverified.length) : "—"],
                ["Alunos identificados", "Nenhum"],
                ["Turmas com < 10 alunos", "Fora"],
              ].map(([label, value], index) => <View key={label} className={index ? "border-t border-border" : ""} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 8 }}><Text className="text-ink-muted" style={{ fontSize: 13, flexShrink: 1 }}>{label}</Text><Text className="font-mono text-ink" style={{ fontSize: 12 }}>{value}</Text></View>)}
              {draft && <Pressable role="button" aria-expanded={showFacts} onPress={() => setShowFacts(!showFacts)} style={{ marginTop: 12 }}><Text className="text-brand" style={{ fontSize: 13 }}>{showFacts ? "Ocultar indicadores" : "Ver indicadores enviados"}</Text></Pressable>}
              {showFacts && draft && <View style={{ marginTop: 12, gap: 8 }}>{Object.entries(draft.facts).map(([key, value]) => <View key={key} className="border-t border-border" style={{ paddingTop: 8, gap: 4 }}><Text selectable className="font-mono text-ink-subtle" style={{ fontSize: 11 }}>{key}</Text><Text selectable className="text-ink" style={{ fontSize: 13 }}>{formatValue(value)}</Text></View>)}</View>}
            </Panel>
            <View className="bg-surface-sunken border border-border rounded-ds-md" style={{ padding: 16 }}><Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 20 }}><Text className="font-semibold text-ink">Leia como ponto de partida. </Text>A IA resume números que o BI já calculou e pode errar na interpretação. Correlação não é causa. Revise antes de compartilhar com a equipe.</Text></View>
            <Panel title="Configuração">
              <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 20 }}>Somente indicadores agregados são enviados para a IA. Cada geração considera os filtros selecionados.</Text>
              {draft?.model && <Text className="text-ink-subtle" style={{ fontSize: 12, marginTop: 12 }}>Modelo: {draft.model}</Text>}
              {onOpenSettings && <Button label="Integração com IA" icon={Settings} size="sm" variant="ghost" style={{ marginTop: 12 }} onPress={onOpenSettings} />}
            </Panel>
          </View>
        </View>
      )}
    </View>
  );
}

function InsightCard({ insight, facts, compact, onOpen }: { insight: Insight; facts: BiAiDraft["facts"]; compact: boolean; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const numericKey = insight.evidence.find((key) => typeof facts[key] === "number");
  return <View className="bg-surface border border-border rounded-ds-md" style={{ borderLeftWidth: 4, borderLeftColor: color.brand, padding: 20, gap: 12 }}>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}><Text className="font-semibold text-ink-muted" style={{ fontSize: 11, letterSpacing: 0.66 }}>OBSERVAÇÃO</Text><Badge label={AREAS[insight.area]} tone="neutral" /></View>
    <View style={{ flexDirection: compact ? "column" : "row", gap: 20 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text role="heading" aria-level={3} className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 24 }}>{insight.title}</Text>
        <Text className="text-ink-muted" style={{ fontSize: 14, lineHeight: 22 }}>{insight.text}</Text>
        <View className="flex-row flex-wrap items-center" style={{ gap: 6, marginTop: 4 }}><Text className="text-ink-subtle" style={{ fontSize: 12 }}>Fonte: indicadores do BI · {insight.evidence.length} evidências</Text><Pressable role="button" aria-label={`Ver evidências: ${insight.title}`} aria-expanded={expanded} onPress={() => setExpanded(!expanded)}><Text className="text-brand" style={{ fontSize: 12, textDecorationLine: "underline" }}>{expanded ? "Ocultar indicadores" : "Ver indicadores"}</Text></Pressable></View>
      </View>
      {numericKey && <View className={compact ? "border-t border-border" : "border-l border-border"} style={{ width: compact ? undefined : 180, paddingTop: compact ? 12 : 0, paddingLeft: compact ? 0 : 20, gap: 4 }}><Text className="font-mono font-semibold text-ink" style={{ fontSize: 26, lineHeight: 32 }}>{formatValue(facts[numericKey])}{factUnit(numericKey)}</Text><Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 18 }}>{factLabel(numericKey)}</Text><Text className="text-ink-subtle" style={{ fontSize: 11 }}>Valor informado pelo BI</Text></View>}
    </View>
    {expanded && <View className="bg-surface-sunken rounded-ds-sm" style={{ padding: 12, gap: 8 }}>{insight.evidence.length ? insight.evidence.map((key) => <Text selectable key={key} className="font-mono text-ink-muted" style={{ fontSize: 11, lineHeight: 18 }}>{key} = {formatValue(facts[key])}</Text>) : <Text className="text-ink-subtle" style={{ fontSize: 12 }}>Sem evidência citada.</Text>}</View>}
    <View className="border-t border-border" style={{ paddingTop: 12 }}><Button label={`Abrir ${AREAS[insight.area]}`} icon={ChevronRight} size="sm" onPress={onOpen} /></View>
  </View>;
}
