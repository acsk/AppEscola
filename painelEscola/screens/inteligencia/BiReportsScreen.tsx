import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { BookOpen, Check, FileSpreadsheet, FileText, GraduationCap, Landmark, LayoutGrid, Trophy, User } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import SearchableSelect from "../../components/ui/SearchableSelect";
import { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtDate } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { REPORT_FORMATS, REPORT_INDICATORS, buildReportDoc, renderReportPdf, renderReportXlsx, type ReportDoc } from "../../utils/biReports";
import {
  deleteBiReportTemplate,
  fetchBiExports,
  fetchBiMeta,
  fetchBiMetrics,
  fetchBiReport,
  fetchBiReportTemplates,
  fetchBiStudents,
  saveBiReportTemplate,
  type BiExportLog,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
  type BiReportTarget,
  type BiReportTemplate,
  type BiReportType,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const CARDS: { type: BiReportType; title: string; description: string; icon: any; aggregated?: boolean }[] = [
  { type: "individual", title: "Individual", description: "Notas, Diagnóstico 360°, frequência, assuntos críticos, intervenções e recomendações.", icon: User },
  { type: "class", title: "Turma", description: "Indicadores consolidados, evolução, disciplinas críticas e alunos em atenção.", icon: LayoutGrid },
  { type: "subject", title: "Disciplina", description: "Aproveitamento, ranking de assuntos e comparação entre turmas.", icon: BookOpen },
  { type: "institutional", title: "Institucional", description: "Indicadores gerais, simulados, turmas, engajamento e intervenções.", icon: Landmark, aggregated: true },
  { type: "results", title: "Resultados", description: "Evolução do período para campanhas, só com dados agregados e metodologia.", icon: Trophy, aggregated: true },
];

const PRESETS: { value: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { value: "year", label: "Ano letivo atual" },
  { value: "semester", label: "Semestre atual" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

const REPORT_LABEL: Record<BiReportType, string> = { individual: "Individual", class: "Turma", subject: "Disciplina", institutional: "Institucional", results: "Resultados" };

/** Inteligência Educacional › Relatórios e indicadores. */
export default function BiReportsScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [catalog, setCatalog] = useState<Record<string, BiMetricDefinition>>({});
  const [type, setType] = useState<BiReportType>("institutional");
  const [preset, setPreset] = useState<Exclude<PeriodPreset, "custom">>("semester");
  const [courseId, setCourseId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [indicators, setIndicators] = useState<string[]>([]);
  const [letterhead, setLetterhead] = useState(true);
  const [charts, setCharts] = useState(true);
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<ReportDoc | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "pdf" | "xlsx">("");
  const [error, setError] = useState("");
  const [exports, setExports] = useState<BiExportLog[]>([]);
  const [templates, setTemplates] = useState<BiReportTemplate[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const tenantWide = !!meta?.scope.tenant_wide;
  const cards = CARDS.filter((c) => !c.aggregated || tenantWide);

  const refreshLists = useCallback(() => {
    fetchBiExports().then(setExports).catch(() => setExports([]));
    fetchBiReportTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    fetchBiMeta()
      .then((m) => {
        setMeta(m);
        if (!m.scope.tenant_wide) setType("class");
      })
      .catch(() => setMeta(null));
    fetchBiMetrics()
      .then((list) => setCatalog(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setCatalog({}));
    fetchBiStudents({}, { filter: "all", page: 1, perPage: 100 })
      .then((d) => setStudents(d.items.map((s) => ({ value: String(s.student_id), label: s.name }))))
      .catch(() => setStudents([]));
    refreshLists();
  }, [refreshLists]);

  // Modelo escolhido: aplicado quando o tipo de relatório dele estiver ativo.
  const pendingTemplate = useRef<BiReportTemplate | null>(null);
  const applyConfig = (c: Record<string, any>) => {
    if (c.preset) setPreset(c.preset);
    setCourseId(c.course_id ? String(c.course_id) : "");
    if (Array.isArray(c.indicators)) setIndicators(c.indicators);
    setLetterhead(c.letterhead ?? true);
    setCharts(c.charts ?? true);
    setSummary(c.executive_summary ?? "");
  };

  // Ao trocar de relatório: indicadores padrão (ou os do modelo), alvo vazio, prévia descartada.
  useEffect(() => {
    setIndicators(REPORT_INDICATORS[type].filter((i) => i.default).map((i) => i.key));
    setTargetId("");
    setPreview(null);
    setError("");
    if (pendingTemplate.current?.report === type) {
      applyConfig(pendingTemplate.current.config ?? {});
      pendingTemplate.current = null;
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters: BiFilters = useMemo(() => ({ ...presetRange(preset), course_id: courseId ? Number(courseId) : null }), [preset, courseId]);
  const target: BiReportTarget = useMemo(() => {
    const id = targetId ? Number(targetId) : undefined;
    return type === "individual" ? { student_id: id } : type === "class" ? { report_class_id: id } : type === "subject" ? { report_subject_id: id } : {};
  }, [type, targetId]);
  const needsTarget = type === "individual" || type === "class" || type === "subject";
  const targetOptions =
    type === "individual"
      ? students
      : type === "class"
        ? (meta?.filter_options.school_classes ?? []).map((c) => ({ value: String(c.id), label: c.name }))
        : (meta?.filter_options.subjects ?? []).map((s) => ({ value: String(s.id), label: s.name }));
  const targetLabel = targetOptions.find((o) => o.value === targetId)?.label ?? "";
  const contextLabel = needsTarget ? targetLabel : PRESETS.find((p) => p.value === preset)?.label ?? "";
  const options = { indicators, letterhead, charts, executiveSummary: summary };

  const run = async (mode: "preview" | "pdf" | "xlsx") => {
    setBusy(mode);
    setError("");
    try {
      const data = await fetchBiReport(type, filters, target, mode === "preview" ? undefined : mode);
      const doc = buildReportDoc(data, options, catalog, { label: contextLabel });
      setPreview(doc);
      if (mode === "pdf") await renderReportPdf(doc, letterhead);
      if (mode === "xlsx") renderReportXlsx(doc);
      if (mode !== "preview") refreshLists();
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível gerar o relatório."));
    } finally {
      setBusy("");
    }
  };

  const applyTemplate = (t: BiReportTemplate) => {
    if (t.report === type) {
      applyConfig(t.config ?? {});
      setPreview(null);
    } else {
      pendingTemplate.current = t;
      setType(t.report);
    }
  };

  const wide = width >= 1100;
  const cardWidth = width >= 1200 ? "20%" : width >= 700 ? "33.333%" : "100%";
  const aggregated = type === "institutional" || type === "results";

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Relatórios e indicadores" }]}
        title="Relatórios e indicadores"
        description="Cada relatório traz período, filtros, fontes e a metodologia do cálculo."
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            {tenantWide ? <Button icon={GraduationCap} label="Aprovações" onPress={() => navigate("bi-outcomes")} /> : null}
            <Button icon={BookOpen} label="Catálogo de métricas" onPress={() => setCatalogOpen(true)} />
          </View>
        }
      />

      <View className="flex-row flex-wrap" style={{ marginHorizontal: -6, rowGap: 12 }}>
        {cards.map((c) => {
          const selected = c.type === type;
          return (
            <View key={c.type} style={{ width: cardWidth, paddingHorizontal: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setType(c.type)}
                className="bg-surface rounded-ds-md"
                style={{ padding: 14, gap: 8, minHeight: 150, borderWidth: selected ? 2 : 1, borderColor: selected ? color.brand : color.border }}
              >
                <View className="bg-surface-sunken rounded-ds-sm" style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={c.icon} size={16} color={color["ink-muted"]} />
                </View>
                <Text className="font-semibold text-ink" style={{ fontSize: 14 }}>{c.title}</Text>
                <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 17, flex: 1 }}>{c.description}</Text>
                <View className="flex-row" style={{ gap: 6 }}>
                  {REPORT_FORMATS[c.type].map((f) => (
                    <Text key={f} className="font-mono text-ink-muted border border-border rounded-ds-sm" style={{ fontSize: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                      {f.toUpperCase()}
                    </Text>
                  ))}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
        <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
          <Panel
            title={`Relatório ${REPORT_LABEL[type].toLowerCase()}`}
            description={aggregated ? "Para a gestão e campanhas institucionais. Só dados agregados e indicadores verificáveis." : "Dados do seu escopo de acesso, com amostras sempre visíveis."}
            footer={
              <View className="flex-row flex-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
                <Button label="Salvar modelo" onPress={() => setSaveOpen(true)} />
                <Button label="Pré-visualizar" onPress={() => run("preview")} loading={busy === "preview"} disabled={needsTarget && !targetId} />
                {REPORT_FORMATS[type].includes("xlsx") ? (
                  <Button icon={FileSpreadsheet} label="Exportar Excel" onPress={() => run("xlsx")} loading={busy === "xlsx"} disabled={needsTarget && !targetId} />
                ) : null}
                <Button variant="primary" icon={FileText} label="Gerar PDF" onPress={() => run("pdf")} loading={busy === "pdf"} disabled={needsTarget && !targetId} />
              </View>
            }
          >
            <View style={{ gap: 16 }}>
              <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <FormSelect label="Período" value={preset} options={PRESETS} onChange={(v) => setPreset(v as Exclude<PeriodPreset, "custom">)} />
                </View>
                {needsTarget ? (
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <SearchableSelect
                      label={type === "individual" ? "Aluno" : type === "class" ? "Turma" : "Disciplina"}
                      placeholder="Selecione"
                      value={targetId}
                      options={targetOptions}
                      onChange={setTargetId}
                    />
                  </View>
                ) : (
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <SearchableSelect
                      label="Recorte"
                      placeholder="Todos os cursos"
                      value={courseId}
                      options={[{ value: "", label: "Todos os cursos" }, ...(meta?.filter_options.courses ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
                      onChange={setCourseId}
                    />
                  </View>
                )}
              </View>

              <View style={{ gap: 6 }}>
                <Text className="font-medium text-ink" style={{ fontSize: 13 }}>Indicadores</Text>
                <View className="flex-row flex-wrap" style={{ rowGap: 6 }}>
                  {REPORT_INDICATORS[type].map((i) => (
                    <View key={i.key} style={{ width: width >= 700 ? "50%" : "100%" }}>
                      <Checkbox
                        label={i.label}
                        hint={i.hint}
                        checked={indicators.includes(i.key)}
                        onChange={(v) => setIndicators((list) => (v ? [...list, i.key] : list.filter((k) => k !== i.key)))}
                      />
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text className="font-medium text-ink" style={{ fontSize: 13 }}>Apresentação</Text>
                <View className="flex-row flex-wrap" style={{ rowGap: 6 }}>
                  <View style={{ width: width >= 700 ? "50%" : "100%" }}>
                    <Checkbox label="Identidade visual da escola" checked={letterhead} onChange={setLetterhead} />
                  </View>
                  <View style={{ width: width >= 700 ? "50%" : "100%" }}>
                    <Checkbox label="Gráficos de evolução" checked={charts} onChange={setCharts} />
                  </View>
                  <View style={{ width: width >= 700 ? "50%" : "100%" }}>
                    <Checkbox label="Página de metodologia e amostra" hint="Obrigatória" checked disabled onChange={() => undefined} />
                  </View>
                </View>
              </View>

              {aggregated ? (
                <FormInput
                  label="Resumo executivo (escrito e revisado por uma pessoa)"
                  value={summary}
                  onChangeText={setSummary}
                  multiline
                  placeholder="Opcional. Entra no início do PDF, antes dos indicadores."
                />
              ) : null}

              <View className="border border-border rounded-ds-sm" style={{ padding: 14, gap: 4, borderLeftWidth: 3, borderLeftColor: color.success }}>
                <Text className="font-semibold text-ink" style={{ fontSize: 13 }}>Privacidade e LGPD</Text>
                {(aggregated
                  ? [
                      "Somente dados agregados; nenhum aluno é identificado.",
                      "Grupos com menos de 10 alunos são ocultados.",
                      "Percentuais calculados pelo sistema; não é possível digitá-los.",
                      "A exportação fica registrada na auditoria (usuário, data, filtros).",
                    ]
                  : [
                      "Contém dados de alunos identificados: compartilhe só com quem acompanha o aluno ou a turma.",
                      "Só aparecem alunos e turmas do seu escopo de acesso.",
                      "A exportação fica registrada na auditoria (usuário, data, filtros).",
                    ]
                ).map((line) => (
                  <Text key={line} className="text-ink-muted" style={{ fontSize: 12 }}>{`• ${line}`}</Text>
                ))}
              </View>

              {error ? <Text className="text-danger" style={{ fontSize: 13 }}>{error}</Text> : null}
            </View>
          </Panel>
        </View>

        <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0, gap: 24 }}>
          <Panel title="Prévia" description="Conteúdo que vai para o arquivo, com os números reais.">
            {busy === "preview" ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color={color.brand} />
              </View>
            ) : preview ? (
              <View style={{ gap: 10 }}>
                <Text className="font-semibold text-ink" style={{ fontSize: 15 }}>{preview.title}</Text>
                <Text className="text-ink-muted" style={{ fontSize: 12 }}>{[preview.subtitle, ...preview.facts.map((f) => `${f.label}: ${f.value}`)].filter(Boolean).join(" · ")}</Text>
                {preview.sections.map((s, i) => (
                  <View key={`${s.title}${i}`} className="border-t border-border" style={{ paddingTop: 8, gap: 4 }}>
                    <Text className="font-medium text-ink" style={{ fontSize: 13 }}>{s.title}</Text>
                    {s.kind === "facts" ? (
                      <Text className="text-ink-muted font-mono" style={{ fontSize: 12 }}>{s.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")}</Text>
                    ) : s.kind === "table" ? (
                      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{`Tabela · ${s.rows.length} linha(s) · ${s.columns.join(", ")}`}</Text>
                    ) : s.kind === "chart" ? (
                      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{`Gráfico · ${s.series.map((x) => x.name).join(" e ")} · ${s.labels.length} pontos`}</Text>
                    ) : (
                      <Text className="text-ink-muted" style={{ fontSize: 12 }} numberOfLines={3}>{s.paragraphs.join(" ")}</Text>
                    )}
                  </View>
                ))}
                <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`+ Metodologia e amostra (${preview.methodology.length} itens)`}</Text>
              </View>
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13 }}>{needsTarget && !targetId ? "Escolha o alvo do relatório e clique em Pré-visualizar." : "Clique em Pré-visualizar para conferir antes de gerar."}</Text>
            )}
          </Panel>

          <Panel title="Modelos salvos" flush>
            {templates.length ? (
              templates.map((t, i) => (
                <View key={t.id} className={`flex-row items-center ${i < templates.length - 1 ? "border-b border-border" : ""}`} style={{ padding: 12, gap: 8 }}>
                  <Pressable style={{ flex: 1 }} onPress={() => applyTemplate(t)} accessibilityRole="button">
                    <Text className="text-ink" style={{ fontSize: 13 }}>{t.name}</Text>
                    <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`${REPORT_LABEL[t.report]}${t.shared ? " · compartilhado" : ""}${t.mine ? "" : ` · ${t.owner ?? ""}`}`}</Text>
                  </Pressable>
                  {t.mine || tenantWide ? (
                    <Button size="sm" label="Remover" onPress={() => deleteBiReportTemplate(t.id).then(refreshLists).catch(() => undefined)} />
                  ) : null}
                </View>
              ))
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, padding: 16 }}>Nenhum modelo salvo.</Text>
            )}
          </Panel>

          <Panel title="Exportações recentes" description={tenantWide ? "Auditoria de arquivos com dados da escola." : "Suas exportações."} flush>
            {exports.length ? (
              exports.map((e, i) => (
                <View key={e.id} className={`flex-row items-center ${i < exports.length - 1 ? "border-b border-border" : ""}`} style={{ padding: 12, gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text className="text-ink" style={{ fontSize: 13 }} numberOfLines={1}>{e.subject_label ?? REPORT_LABEL[e.report]}</Text>
                    <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{e.user ?? "—"}</Text>
                  </View>
                  <Text className="font-mono text-ink-muted" style={{ fontSize: 12 }}>{fmtDate(e.exported_at_iso.slice(0, 10)).slice(0, 5)}</Text>
                  <Text className="font-mono text-ink-muted border border-border rounded-ds-sm" style={{ fontSize: 10, paddingHorizontal: 5 }}>{e.format.toUpperCase()}</Text>
                </View>
              ))
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, padding: 16 }}>Nenhuma exportação ainda.</Text>
            )}
          </Panel>
        </View>
      </View>

      <SaveTemplateModal
        visible={saveOpen}
        canShare={tenantWide}
        onClose={() => setSaveOpen(false)}
        onSave={async (name, shared) => {
          await saveBiReportTemplate({
            name,
            report: type,
            shared,
            config: { preset, course_id: courseId ? Number(courseId) : null, indicators, letterhead, charts, executive_summary: summary || null },
          });
          setSaveOpen(false);
          refreshLists();
        }}
      />

      <Modal visible={catalogOpen} title="Catálogo de métricas" size="lg" compact onClose={() => setCatalogOpen(false)}>
        <View style={{ gap: 14 }}>
          {Object.values(catalog).map((d) => (
            <View key={d.key} style={{ gap: 2 }}>
              <Text className="font-semibold text-ink" style={{ fontSize: 13 }}>{d.name}</Text>
              <Text className="text-ink-muted" style={{ fontSize: 12 }}>{d.description}</Text>
              <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`Cálculo: ${d.formula}. Amostra mínima: ${d.min_sample}. ${d.missing}`}</Text>
            </View>
          ))}
        </View>
      </Modal>
    </ScrollView>
  );
}

function Checkbox({ label, hint, checked, disabled = false, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      className="flex-row"
      style={{ gap: 8, alignItems: "flex-start", opacity: disabled ? 0.7 : 1 }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: checked ? (disabled ? color["ink-subtle"] : color.brand) : color.surface,
          borderWidth: checked ? 0 : 1,
          borderColor: color["border-strong"],
        }}
      >
        {checked ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : null}
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text className="text-ink" style={{ fontSize: 13 }}>{label}</Text>
        {hint ? <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function SaveTemplateModal({ visible, canShare, onClose, onSave }: { visible: boolean; canShare: boolean; onClose: () => void; onSave: (name: string, shared: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setName("");
      setShared(false);
      setError("");
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      title="Salvar modelo"
      size="sm"
      compact
      onClose={onClose}
      footer={
        <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <Button label="Cancelar" onPress={onClose} />
          <Button
            variant="primary"
            label="Salvar"
            loading={busy}
            disabled={!name.trim()}
            onPress={async () => {
              setBusy(true);
              try {
                await onSave(name.trim(), shared);
              } catch (err: any) {
                setError(getApiResponseMessage(err?.response?.data, "Não foi possível salvar o modelo."));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      }
    >
      <View style={{ gap: 8 }}>
        <FormInput label="Nome do modelo" value={name} onChangeText={setName} placeholder="Ex.: Institucional semestral" />
        {canShare ? <Checkbox label="Compartilhar com a equipe da escola" checked={shared} onChange={setShared} /> : null}
        <Text className="text-ink-subtle" style={{ fontSize: 11 }}>Guarda período, recorte, indicadores, apresentação e resumo executivo. O alvo (aluno, turma ou disciplina) é escolhido a cada geração.</Text>
        {error ? <Text className="text-danger" style={{ fontSize: 12 }}>{error}</Text> : null}
      </View>
    </Modal>
  );
}
