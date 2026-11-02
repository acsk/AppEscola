import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw, SlidersHorizontal } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import BiMetaBar from "../../components/bi/BiMetaBar";
import BiCriteriaModal from "../../components/bi/BiCriteriaModal";
import ScatterMatrix from "../../components/bi/ScatterMatrix";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiMeta, fetchBiProfiles, type BiFilters, type BiMeta, type BiProfiles, type BiQuadrant } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const TABLE_LIMIT = 50;

/** Inteligência Educacional › Diagnóstico 360° › Perfis: matriz desempenho × dedicação. */
export default function BiProfilesScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiProfiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BiQuadrant>("B1");
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiProfiles(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os perfis."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const wide = width >= 1100;
  const criteria = data?.meta.criteria;
  const quadrant = data?.quadrants.find((q) => q.key === selected);
  const rows = (data?.points ?? []).filter((p) => p.quadrant === selected);
  const counts = Object.fromEntries((data?.quadrants ?? []).map((q) => [q.key, q.count]));

  const chips = criteria
    ? [
        { label: "Meta de aproveitamento", value: `≥ ${fmtNumber(criteria.goal_pct, 0)}%` },
        { label: "Dedicação alta", value: `≥ ${fmtNumber(criteria.dedication_days_per_week, 1)} dias ativos/sem.` },
        { label: "Amostra mínima", value: `${criteria.min_assessments} avaliações + ${criteria.min_questions} questões` },
        { label: "Sem classificação", value: `${data!.summary.unclassified} aluno(s)` },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Diagnóstico 360°", onPress: () => navigate("bi-diagnosis") },
          { label: "Perfis" },
        ]}
        title="Perfis de aprendizagem e dedicação"
        description="Cruzamento entre aproveitamento acadêmico e dedicação registrada na plataforma."
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            {meta?.scope.tenant_wide ? <Button icon={SlidersHorizontal} label="Configurar critérios" onPress={() => setCriteriaOpen(true)} /> : null}
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
          </View>
        }
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Classificação recalculada a cada atualização — não é rótulo permanente" />

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
      />

      {chips.length ? (
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -6, rowGap: 12 }}>
          {chips.map((c) => (
            <View key={c.label} style={{ width: width >= 1000 ? "25%" : width >= 600 ? "50%" : "100%", paddingHorizontal: 6 }}>
              <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, gap: 2 }}>
                <Text className="text-ink-muted" style={{ fontSize: 12 }}>{c.label}</Text>
                <Text className="font-mono font-semibold text-ink" style={{ fontSize: 13 }}>{c.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <Panel>
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            <Text className="text-danger" style={{ fontSize: 14 }}>{error}</Text>
            <Button label="Tentar novamente" onPress={load} />
          </View>
        </Panel>
      ) : null}

      {loading && !data ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : null}

      {data && criteria ? (
        <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start", opacity: loading ? 0.6 : 1 }}>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
            <Panel title="Matriz desempenho × dedicação" description={`${data.summary.classified} aluno(s) com amostra mínima. Toque num ponto para ver o aluno.`}>
              {data.points.length ? (
                <ScatterMatrix
                  points={data.points.map((p) => ({ id: p.student_id, name: p.name, x: p.dedication, y: p.performance, group: p.quadrant }))}
                  xThreshold={criteria.dedication_days_per_week}
                  yThreshold={criteria.goal_pct}
                  selected={selected}
                  counts={counts}
                  xLabel="Dedicação registrada · dias ativos por semana (média)"
                  yLabel="Aproveitamento"
                  accessibilityLabel={`Matriz com ${data.points.length} alunos; quadrantes A1 ${counts.A1}, A2 ${counts.A2}, B1 ${counts.B1}, B2 ${counts.B2}`}
                />
              ) : (
                <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
                  Nenhum aluno com a amostra mínima no período. Ajuste o período ou os critérios.
                </Text>
              )}
            </Panel>
          </View>

          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0, gap: 16 }}>
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -6, rowGap: 12 }}>
              {data.quadrants.map((q) => {
                const isSelected = q.key === selected;
                return (
                  <View key={q.key} style={{ width: width >= 600 ? "50%" : "100%", paddingHorizontal: 6 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelected(q.key)}
                      className={`border rounded-ds-md ${isSelected ? "bg-brand-tint" : "bg-surface"}`}
                      style={{ padding: 14, gap: 6, minHeight: 112, borderColor: isSelected ? color.brand : color.border, borderWidth: isSelected ? 2 : 1 }}
                    >
                      <View className="flex-row items-center" style={{ justifyContent: "space-between", gap: 8 }}>
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <Text className="font-mono text-ink-muted border border-border rounded-ds-sm" style={{ fontSize: 10, paddingHorizontal: 4 }}>{q.key}</Text>
                          <Text className="font-semibold text-ink" style={{ fontSize: 13 }}>{q.label}</Text>
                        </View>
                        <Text className="font-mono font-semibold text-ink" style={{ fontSize: 20 }}>{q.count}</Text>
                      </View>
                      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 17 }}>
                        <Text className="font-semibold text-ink">{q.dedication}. </Text>
                        {q.hint}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Panel
              title={quadrant ? `${quadrant.label} · ${quadrant.dedication}` : "Alunos"}
              description={`${rows.length} aluno(s) · ordenados pelo maior afastamento da meta.${rows.length > TABLE_LIMIT ? ` Mostrando ${TABLE_LIMIT}.` : ""}`}
              flush
            >
              {rows.length ? (
                <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
                  <View style={{ minWidth: 520, width: "100%" }} role="table" aria-label="Alunos do quadrante">
                    <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Aluno</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 64, textAlign: "right" }}>Aprov.</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Dias/sem.</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Questões</Text>
                      <View style={{ width: 56 }} />
                    </View>
                    {rows.slice(0, TABLE_LIMIT).map((p, i) => (
                      <View key={p.student_id} className={`flex-row items-center ${i < Math.min(rows.length, TABLE_LIMIT) - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
                          <Text className="text-ink-subtle" style={{ fontSize: 12 }} numberOfLines={1}>{p.classes.join(", ") || "—"}</Text>
                        </View>
                        <Text className="font-mono text-ink" style={{ fontSize: 12, width: 64, textAlign: "right" }}>{`${fmtNumber(p.performance, 0)}%`}</Text>
                        <Text className="font-mono text-ink" style={{ fontSize: 12, width: 72, textAlign: "right" }}>{fmtNumber(p.dedication, 1)}</Text>
                        <Text className="font-mono text-ink" style={{ fontSize: 12, width: 72, textAlign: "right" }}>{p.questions.toLocaleString("pt-BR")}</Text>
                        <Pressable accessibilityRole="link" accessibilityLabel={`Diagnóstico 360° de ${p.name}`} onPress={() => navigate("bi-diagnosis", { studentId: p.student_id, filters })} style={{ width: 56, alignItems: "flex-end" }}>
                          <Text className="font-medium text-brand" style={{ fontSize: 13 }}>360°</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>Nenhum aluno neste quadrante.</Text>
              )}
            </Panel>

            <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
              <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
                <Text className="font-semibold text-ink">Leitura responsável. </Text>
                Dedicação registrada mede apenas atividade dentro da plataforma; não ter registro não significa não estudar. Correlação entre dedicação e desempenho não indica causa. Toda classificação pode ser revisada pela coordenação.
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <BiCriteriaModal
        visible={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        onOpenPriorities={() => navigate("bi-priorities")}
        onSaved={load}
      />
    </ScrollView>
  );
}
