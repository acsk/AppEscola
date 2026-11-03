import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Check, Plus, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Icon from "../../components/ui/Icon";
import Tabs from "../../components/ui/Tabs";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import StatTile from "../../components/ui/StatTile";
import BiMetaBar from "../../components/bi/BiMetaBar";
import InterventionFormModal, { type InterventionPreset } from "../../components/bi/InterventionFormModal";
import { presetRange } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  addInterventionEvent,
  completeIntervention,
  dismissSuggestion,
  fetchIntervention,
  fetchInterventionEffectiveness,
  fetchInterventionOptions,
  fetchInterventions,
  fetchInterventionSuggestions,
  fetchInterventionSummary,
  updateIntervention,
  type BiEffectiveness,
  type BiInterventionCard,
  type BiInterventionDetail,
  type BiInterventionStatus,
  type BiInterventionSummary,
  type BiSuggestion,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Tab = "suggestions" | "active" | "reassessment" | "completed";

const STATUS: Record<BiInterventionStatus, { label: string; tone: "brand" | "warning" | "success" | "neutral" }> = {
  planned: { label: "Aguardando início", tone: "warning" },
  in_progress: { label: "Em andamento", tone: "brand" },
  reassessment: { label: "Reavaliação", tone: "success" },
  completed: { label: "Concluída", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

const REASON_TONE = { below_goal: "danger", declining: "danger", low_attendance: "warning" } as const;

/** Inteligência Educacional › Acompanhamento pedagógico: do indicador de atenção à reavaliação. */
export default function BiFollowUpScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [period] = useState(() => presetRange("90d"));
  const [semester] = useState(() => presetRange("semester"));
  const [tab, setTab] = useState<Tab>("active");
  const [summary, setSummary] = useState<BiInterventionSummary | null>(null);
  const [suggestions, setSuggestions] = useState<BiSuggestion[]>([]);
  const [items, setItems] = useState<BiInterventionCard[]>([]);
  const [effectiveness, setEffectiveness] = useState<BiEffectiveness | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BiInterventionDetail | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formPreset, setFormPreset] = useState<InterventionPreset | null>(null);
  const [dismissing, setDismissing] = useState<BiSuggestion | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, e, o] = await Promise.all([
        fetchInterventionSummary(period),
        fetchInterventionEffectiveness(semester),
        fetchInterventionOptions(),
      ]);
      setSummary(s);
      setEffectiveness(e);
      setCanCreate(o.can_create);
      if (tab === "suggestions") {
        setSuggestions((await fetchInterventionSuggestions(period)).items);
      } else {
        const list = await fetchInterventions(tab);
        setItems(list);
        setSelectedId((current) => (current && list.some((i) => i.id === current) ? current : list[0]?.id ?? null));
      }
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o acompanhamento."));
    } finally {
      setLoading(false);
    }
  }, [tab, period, semester]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedId || tab === "suggestions") {
      setDetail(null);
      return;
    }
    fetchIntervention(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId, tab]);

  const wide = width >= 1100;
  const goal = effectiveness?.goal_pct ?? 70;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Acompanhamento pedagógico" }]}
        title="Acompanhamento pedagógico"
        description="Do indicador de atenção à reavaliação, com antes e depois registrados."
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            <Button icon={RefreshCw} label="Atualizar" onPress={loadAll} loading={loading} />
            {canCreate ? <Button variant="primary" icon={Plus} label="Nova intervenção" onPress={() => setFormPreset({})} /> : null}
          </View>
        }
      />

      <BiMetaBar extra={`Antes/depois medidos pelos dados · indicadores dos últimos 90 dias`} />

      {summary ? (
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
          {[
            { label: "Sugestões a avaliar", value: summary.suggestions, hint: "geradas pelos indicadores" },
            { label: "Intervenções ativas", value: summary.active, hint: `${summary.active_individual} individuais · ${summary.active_group} em grupo` },
            { label: "Concluídas com reavaliação", value: effectiveness?.completed ?? 0, hint: "no semestre" },
          ].map((t) => (
            <View key={t.label} style={{ width: width >= 900 ? "33.333%" : "100%", paddingHorizontal: 8 }}>
              <StatTile label={t.label} value={String(t.value)} hint={t.hint} />
            </View>
          ))}
        </View>
      ) : null}

      <Tabs
        accessibilityLabel="Situação das intervenções"
        value={tab}
        onChange={(t) => setTab(t)}
        items={[
          { id: "suggestions", label: "Sugestões", count: summary?.suggestions ?? null },
          { id: "active", label: "Em andamento", count: summary?.active ?? null },
          { id: "reassessment", label: "Reavaliação", count: summary?.reassessment ?? null },
          { id: "completed", label: "Concluídas", count: null },
        ]}
      />

      {error ? (
        <Panel>
          <Text className="text-danger" style={{ fontSize: 14 }}>{error}</Text>
        </Panel>
      ) : null}

      <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
        <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0, gap: 24 }}>
          {tab === "suggestions" ? (
            <Panel title="Sugestões a avaliar" description="Alunos em atenção sem intervenção aberta. Crie a intervenção ou descarte com o motivo (some por 30 dias)." flush>
              {loading && !suggestions.length ? (
                <Loading />
              ) : suggestions.length ? (
                suggestions.map((s, i) => (
                  <View key={s.student_id} className={`flex-row flex-wrap items-center ${i < suggestions.length - 1 ? "border-b border-border" : ""}`} style={{ padding: 16, gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 180 }}>
                      <Text className="text-ink" style={{ fontSize: 14 }}>{s.name}</Text>
                      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{s.classes.join(", ") || "—"}</Text>
                    </View>
                    <View style={{ flex: 2, minWidth: 220, gap: 4 }}>
                      {s.reasons.map((r) => (
                        <View key={r.code} className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                          <Badge label={r.label} tone={REASON_TONE[r.code]} dot />
                          <Text className="font-mono text-ink-muted" style={{ fontSize: 12 }}>{r.detail}</Text>
                        </View>
                      ))}
                    </View>
                    <View className="flex-row" style={{ gap: 8 }}>
                      <Button size="sm" label="Descartar" onPress={() => setDismissing(s)} />
                      <Button
                        size="sm"
                        variant="primary"
                        label="Criar intervenção"
                        onPress={() =>
                          setFormPreset({
                            students: [{ id: s.student_id, name: s.name }],
                            reasonCode: s.reasons[0]?.code,
                            reasonDetail: s.reasons.map((r) => r.detail).join(" · "),
                            type: s.reasons[0]?.code === "low_attendance" ? "guardian_contact" : "practice_list",
                          })
                        }
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Empty text="Nenhuma sugestão: todos os alunos em atenção já têm intervenção ou foram avaliados." />
              )}
            </Panel>
          ) : (
            <Panel title={tab === "active" ? "Intervenções em andamento" : tab === "reassessment" ? "Aguardando reavaliação" : "Concluídas"} description="Clique em uma linha para ver o fluxo e o resultado." flush>
              {loading && !items.length ? (
                <Loading />
              ) : items.length ? (
                <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
                  <View style={{ minWidth: 720, width: "100%" }} role="table" aria-label="Intervenções">
                    <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                      {[["Aluno / grupo", 1.2], ["Motivo", 1.3], ["Intervenção", 1.4], ["Situação", 0.9]].map(([label, flex]) => (
                        <Text key={label as string} className="font-medium text-ink-muted" style={{ fontSize: 12, flex: flex as number }}>{label}</Text>
                      ))}
                    </View>
                    {items.map((it, i) => {
                      const selected = it.id === selectedId;
                      return (
                        <Pressable
                          key={it.id}
                          onPress={() => setSelectedId(it.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`flex-row items-center ${selected ? "bg-surface-sunken" : ""} ${i < items.length - 1 ? "border-b border-border" : ""}`}
                          style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderLeftWidth: 3, borderLeftColor: selected ? color.brand : "transparent" }}
                        >
                          <View style={{ flex: 1.2, minWidth: 0 }}>
                            <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{it.who}</Text>
                            <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{it.school_class ?? "—"}</Text>
                          </View>
                          <View style={{ flex: 1.3, minWidth: 0 }}>
                            <Text className="text-ink" style={{ fontSize: 13 }} numberOfLines={2}>{it.reason.label}</Text>
                            {it.target ? <Text className="font-mono text-danger" style={{ fontSize: 11 }}>{it.target}</Text> : null}
                          </View>
                          <View style={{ flex: 1.4, minWidth: 0 }}>
                            <Text className="text-ink" style={{ fontSize: 13 }} numberOfLines={2}>{it.title}</Text>
                            <Text className="text-ink-subtle" style={{ fontSize: 11 }} numberOfLines={1}>
                              {[it.responsible?.name, it.reassess_on ? `reavaliar ${fmtDate(it.reassess_on).slice(0, 5)}` : null].filter(Boolean).join(" · ")}
                            </Text>
                          </View>
                          <View style={{ flex: 0.9, gap: 4 }}>
                            <Badge label={STATUS[it.status].label} tone={STATUS[it.status].tone} dot />
                            {it.overdue ? <Text className="text-danger" style={{ fontSize: 11 }}>prazo vencido</Text> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <Empty text="Nenhuma intervenção nesta situação." />
              )}
            </Panel>
          )}

          <Panel title="Efetividade das intervenções" description={`Aproveitamento no alvo antes e depois · ${effectiveness?.completed ?? 0} intervenções concluídas no semestre.`}>
            {effectiveness && effectiveness.items.length ? (
              <EffectivenessBars data={effectiveness} />
            ) : (
              <Empty text="Nenhuma intervenção concluída com reavaliação no semestre." />
            )}
            <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, marginTop: 16, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
              <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
                <Text className="font-semibold text-ink">Resultado observado, não causal. </Text>
                Amostras pequenas e sem grupo de comparação. A melhora pode ter outras causas, como aulas regulares e maturação. Use como evidência para ajustar a prática, não como prova de método.
              </Text>
            </View>
          </Panel>
        </View>

        {tab !== "suggestions" ? (
          <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
            {detail ? (
              <InterventionDetail detail={detail} goal={goal} navigate={navigate} onChanged={(d) => { setDetail(d); loadAll(); }} />
            ) : (
              <Panel>
                <Empty text={items.length ? "Selecione uma intervenção." : "—"} />
              </Panel>
            )}
          </View>
        ) : null}
      </View>

      <InterventionFormModal
        visible={formPreset !== null}
        preset={formPreset ?? undefined}
        onClose={() => setFormPreset(null)}
        onCreated={(created) => {
          setTab(created.status === "planned" || created.status === "in_progress" ? "active" : "reassessment");
          setSelectedId(created.id);
          loadAll();
        }}
      />
      <DismissModal
        suggestion={dismissing}
        onClose={() => setDismissing(null)}
        onDone={() => {
          setDismissing(null);
          loadAll();
        }}
      />
    </ScrollView>
  );
}

function InterventionDetail({
  detail,
  goal,
  navigate,
  onChanged,
}: {
  detail: BiInterventionDetail;
  goal: number;
  navigate: Props["navigate"];
  onChanged: (d: BiInterventionDetail) => void;
}) {
  const [noteType, setNoteType] = useState<"note" | "progress" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = ["planned", "in_progress", "reassessment"].includes(detail.status);

  const run = async (action: () => Promise<BiInterventionDetail>) => {
    setBusy(true);
    setError("");
    try {
      onChanged(await action());
      setNoteType(null);
      setText("");
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  };

  const avg = (pick: (s: BiInterventionDetail["students"][number]) => number | null) => {
    const values = detail.students.map(pick).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const before = avg((s) => s.baseline.pct);
  const after = detail.status === "completed" ? avg((s) => s.result?.pct ?? null) : avg((s) => s.current?.pct ?? null);

  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ overflow: "hidden" }}>
      <View className="border-b border-border" style={{ padding: 20, gap: 6 }}>
        <Text className="font-mono text-ink-subtle" style={{ fontSize: 11 }}>{`INTERVENÇÃO ${detail.code}`}</Text>
        <Text className="font-semibold text-ink" style={{ fontSize: 17 }}>{`${detail.who} · ${detail.target.label}`}</Text>
        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
          <Badge label={STATUS[detail.status].label} tone={STATUS[detail.status].tone} dot />
          <Badge label={detail.kind === "group" ? "Em grupo" : "Individual"} tone="neutral" />
        </View>
      </View>

      <View style={{ padding: 20, gap: 20 }}>
        <View style={{ gap: 2 }}>
          <Text className="font-medium text-ink" style={{ fontSize: 13, marginBottom: 6 }}>Fluxo</Text>
          {detail.steps.map((s, i) => (
            <View key={s.key} className="flex-row" style={{ gap: 10 }}>
              <View style={{ alignItems: "center", width: 22 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: s.state === "done" ? color.brand : color.surface,
                    borderWidth: s.state === "done" ? 0 : s.state === "current" ? 2 : 1,
                    borderColor: s.state === "current" ? color.brand : color["border-strong"],
                  }}
                >
                  {s.state === "done" ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : <Text className="font-mono text-ink-muted" style={{ fontSize: 10 }}>{i + 1}</Text>}
                </View>
                {i < detail.steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: s.state === "done" ? color.brand : color.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 10 }}>
                <Text className={s.state === "pending" ? "text-ink-muted" : "text-ink"} style={{ fontSize: 13 }}>{s.label}</Text>
                {s.detail ? <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{s.detail}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <Text className="font-medium text-ink" style={{ fontSize: 13 }}>{`${detail.status === "completed" ? "Resultado" : "Progresso parcial"} em ${detail.target.label}`}</Text>
          <CompareBar label="Antes" value={before} goal={goal} muted />
          <CompareBar label={detail.status === "completed" ? "Depois" : "Até agora"} value={after} goal={goal} />
          <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 16 }}>
            {`Antes: 60 dias até o início. ${detail.status === "completed" ? "Depois: do início até a conclusão." : "Parcial: do início até hoje; o resultado é gravado ao registrar a reavaliação."} "—" = amostra insuficiente.`}
          </Text>
          {detail.kind === "group" ? (
            <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`${detail.students.length} alunos · médias entre os que têm amostra.`}</Text>
          ) : null}
        </View>

        <View className="flex-row flex-wrap" style={{ rowGap: 12 }}>
          {[
            ["Tipo", detail.title],
            ["Responsável", detail.responsible?.name ?? "—"],
            ["Início", fmtDate(detail.starts_on)],
            ["Reavaliação", detail.reassess_on ? fmtDate(detail.reassess_on) : "—"],
          ].map(([label, value]) => (
            <View key={label} style={{ width: "50%", paddingRight: 8 }}>
              <Text className="text-ink-muted" style={{ fontSize: 12 }}>{label}</Text>
              <Text className="text-ink" style={{ fontSize: 13 }}>{value}</Text>
            </View>
          ))}
        </View>

        {detail.events.filter((e) => e.description).length ? (
          <View style={{ gap: 6 }}>
            <Text className="font-medium text-ink" style={{ fontSize: 13 }}>Registros</Text>
            {detail.events
              .filter((e) => e.description)
              .slice(-5)
              .map((e) => (
                <Text key={e.id} className="text-ink-muted" style={{ fontSize: 12 }}>{`${fmtDate(e.occurred_at.slice(0, 10)).slice(0, 5)} · ${e.user ?? "Sistema"}: ${e.description}`}</Text>
              ))}
          </View>
        ) : null}

        {detail.kind === "individual" && detail.student_id ? (
          <Pressable accessibilityRole="link" onPress={() => navigate("bi-diagnosis", { studentId: detail.student_id })}>
            <Text className="font-medium text-brand" style={{ fontSize: 13 }}>Ver Diagnóstico 360° do aluno</Text>
          </Pressable>
        ) : null}
      </View>

      {detail.can_manage && open ? (
        <View className="bg-surface-sunken border-t border-border" style={{ padding: 16, gap: 10 }}>
          {noteType ? (
            <View style={{ gap: 8 }}>
              <FormInput label={noteType === "progress" ? "Progresso" : "Nota"} value={text} onChangeText={setText} multiline placeholder={noteType === "progress" ? "Ex.: lista 14/20 · aula realizada em 17/10" : ""} />
              <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <Button label="Cancelar" onPress={() => setNoteType(null)} />
                <Button variant="primary" label="Salvar" loading={busy} disabled={!text.trim()} onPress={() => run(() => addInterventionEvent(detail.id, noteType, text.trim()))} />
              </View>
            </View>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: 8, justifyContent: "flex-end", alignItems: "flex-end" }}>
              <View style={{ width: 190 }}>
                <FormSelect
                  dense
                  label="Situação"
                  value={detail.status}
                  options={[
                    { value: "planned", label: "Aguardando início" },
                    { value: "in_progress", label: "Em andamento" },
                    { value: "reassessment", label: "Reavaliação" },
                    { value: "cancelled", label: "Cancelar intervenção" },
                  ]}
                  onChange={(v) => v !== detail.status && run(() => updateIntervention(detail.id, { status: v as BiInterventionStatus }))}
                />
              </View>
              <Button label="Adicionar nota" onPress={() => setNoteType("note")} />
              <Button label="Registrar progresso" onPress={() => setNoteType("progress")} />
              <Button variant="primary" label="Registrar reavaliação" loading={busy} onPress={() => run(() => completeIntervention(detail.id))} />
            </View>
          )}
          {error ? <Text className="text-danger" style={{ fontSize: 12 }}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function CompareBar({ label, value, goal, muted = false }: { label: string; value: number | null; goal: number; muted?: boolean }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10 }} aria-label={`${label}: ${value === null ? "amostra insuficiente" : `${fmtNumber(value, 0)}%`}`}>
      <Text className="text-ink-muted" style={{ fontSize: 12, width: 72 }}>{label}</Text>
      <View className="bg-surface-sunken" style={{ flex: 1, height: 10, borderRadius: 2, position: "relative" }}>
        {value !== null ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${value}%`, borderRadius: 2, backgroundColor: muted ? color["ink-subtle"] : color["data-1"] }} /> : null}
        <View style={{ position: "absolute", top: -3, bottom: -3, left: `${goal}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
      </View>
      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 40, textAlign: "right" }}>{value === null ? "—" : `${fmtNumber(value, 0)}%`}</Text>
    </View>
  );
}

function EffectivenessBars({ data }: { data: BiEffectiveness }) {
  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: color["ink-subtle"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Antes</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: color["data-1"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Depois</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>{`Meta ${fmtNumber(data.goal_pct, 0)}%`}</Text>
        </View>
      </View>
      {data.items.map((it) => (
        <View key={it.type} className="flex-row items-center" style={{ gap: 12 }}>
          <View style={{ width: 150 }}>
            <Text className="text-ink" style={{ fontSize: 13 }}>{it.label}</Text>
            <Text className="text-ink-subtle font-mono" style={{ fontSize: 11 }}>{`n = ${it.students}`}</Text>
          </View>
          <View style={{ flex: 1, gap: 3, position: "relative" }}>
            {[it.before, it.after].map((v, k) => (
              <View key={k} className="bg-surface-sunken" style={{ height: 10, borderRadius: 2 }}>
                {v !== null ? <View style={{ width: `${v}%`, height: 10, borderRadius: 2, backgroundColor: k ? color["data-1"] : color["ink-subtle"] }} /> : null}
              </View>
            ))}
            <View style={{ position: "absolute", top: -3, bottom: -3, left: `${data.goal_pct}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          </View>
          <View style={{ width: 84, alignItems: "flex-end" }}>
            <Text className="font-mono text-ink" style={{ fontSize: 12 }}>
              {it.before === null || it.after === null ? "—" : `${fmtNumber(it.before, 0)} → ${fmtNumber(it.after, 0)}%`}
            </Text>
            {it.delta_pp !== null ? (
              <Text className={`font-mono ${it.delta_pp < 0 ? "text-danger" : "text-success"}`} style={{ fontSize: 11 }}>
                {`${it.delta_pp < 0 ? "−" : "+"}${fmtNumber(Math.abs(it.delta_pp), 0)} pp`}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function DismissModal({ suggestion, onClose, onDone }: { suggestion: BiSuggestion | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReason("");
    setError("");
  }, [suggestion]);

  return (
    <Modal
      visible={!!suggestion}
      title="Descartar sugestão"
      size="sm"
      compact
      onClose={onClose}
      footer={
        <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <Button label="Cancelar" onPress={onClose} />
          <Button
            variant="primary"
            label="Descartar"
            loading={busy}
            disabled={!reason.trim()}
            onPress={async () => {
              if (!suggestion) return;
              setBusy(true);
              try {
                await dismissSuggestion(suggestion.student_id, reason.trim());
                onDone();
              } catch (err: any) {
                setError(getApiResponseMessage(err?.response?.data, "Não foi possível descartar."));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      }
    >
      <Text className="text-ink-muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {`${suggestion?.name ?? ""} sai da lista por 30 dias e volta se o indicador continuar. O motivo fica registrado.`}
      </Text>
      <FormInput label="Motivo" value={reason} onChangeText={setReason} placeholder="Ex.: já acompanhado pela família" />
      {error ? <Text className="text-danger" style={{ fontSize: 12 }}>{error}</Text> : null}
    </Modal>
  );
}

function Loading() {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <ActivityIndicator color={color.brand} />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 28, paddingHorizontal: 16, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
