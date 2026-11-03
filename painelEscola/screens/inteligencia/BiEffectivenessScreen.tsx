import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import StatTile from "../../components/ui/StatTile";
import MetricCell from "../../components/bi/MetricCell";
import BiMetaBar from "../../components/bi/BiMetaBar";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiMeta, fetchBiTeachingEffectiveness, type BiEffectivenessTeaching, type BiFilters, type BiMeta } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const move = (t: BiEffectivenessTeaching["items"][number]["best_topic"]) =>
  t ? `${t.name} ${t.delta_pp > 0 ? "▲ +" : "▼ −"}${fmtNumber(Math.abs(t.delta_pp), 0)} pp` : "—";

/** Inteligência Educacional › Efetividade do ensino: evolução por turma × disciplina, sem ranking de professores. */
export default function BiEffectivenessScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiEffectivenessTeaching | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiTeachingEffectiveness(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a efetividade do ensino."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = width >= 1000 ? 4 : width >= 600 ? 2 : 1;
  const threshold = data?.meta.evolution_threshold_pp ?? 5;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Efetividade do ensino" }]}
        title="Efetividade do ensino"
        description="Como cada disciplina evoluiu em cada turma, comparando o período com o anterior de mesma duração."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: simulados, banco de questões e avaliações presenciais" />

      <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
        <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
          <Text className="font-semibold text-ink">Leitura responsável. </Text>
          Evolução observada, não causal: turmas diferem em composição, ritmo e conteúdo do período. O professor aparece como contexto, não como medida de desempenho individual. Use para conversar sobre a prática, não para classificar pessoas.
        </Text>
      </View>

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
      />

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

      {data ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {[
              { label: "Turma × disciplina", value: data.summary.pairs, hint: "com respostas ou notas no período" },
              { label: "Com comparação", value: data.summary.comparable, hint: "amostra nos dois períodos" },
              { label: "Melhoraram", value: data.summary.improved, hint: `acerto +${fmtNumber(threshold, 0)} pp ou mais` },
              { label: "Pioraram", value: data.summary.declined, hint: `acerto −${fmtNumber(threshold, 0)} pp ou mais` },
            ].map((t) => (
              <View key={t.label} style={{ width: `${100 / columns}%`, paddingHorizontal: 8 }}>
                <StatTile label={t.label} value={String(t.value)} hint={t.hint} />
              </View>
            ))}
          </View>

          <Panel
            title="Por turma e disciplina"
            description={`${fmtDate(data.meta.period.from)} a ${fmtDate(data.meta.period.to)} × ${fmtDate(data.meta.previous_period.from)} a ${fmtDate(data.meta.previous_period.to)} · "—" = amostra insuficiente · alunos comparáveis têm ${data.meta.min_student_answers}+ respostas nos dois períodos.`}
            flush
          >
            {data.items.length ? (
              <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
                <View style={{ minWidth: 1040, width: "100%" }} role="table" aria-label="Evolução por turma e disciplina">
                  <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 200 }}>Turma · disciplina</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 96, textAlign: "right" }}>Acerto</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 96, textAlign: "right" }}>Notas presenciais</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 120, textAlign: "right" }}>Alunos que evoluíram</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Mais melhorou</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Mais piorou</Text>
                  </View>
                  {data.items.map((it, i) => (
                    <View key={`${it.school_class_id}:${it.subject_id}`} className={`flex-row items-center ${i < data.items.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                      <View style={{ width: 200 }}>
                        <Pressable accessibilityRole="link" onPress={() => navigate("bi-class", { schoolClassId: it.school_class_id, filters })}>
                          <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{`${it.class} · ${it.subject}`}</Text>
                        </Pressable>
                        <Text className="text-ink-subtle" style={{ fontSize: 12 }} numberOfLines={1}>{it.teachers.length ? it.teachers.join(", ") : "sem professor no horário"}</Text>
                      </View>
                      <MetricCell metric={it.accuracy} unit="%" width={96} />
                      <MetricCell metric={it.grades} unit="%" width={96} />
                      <Text className={`font-mono ${it.students.improved_pct === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 120, textAlign: "right" }}>
                        {it.students.improved_pct === null ? "—" : `${fmtNumber(it.students.improved_pct, 0)}% (${it.students.improved} de ${it.students.comparable})`}
                      </Text>
                      <Text className={it.best_topic ? "text-success" : "text-ink-subtle"} style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>{move(it.best_topic)}</Text>
                      <Text className={it.worst_topic ? "text-danger" : "text-ink-subtle"} style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>{move(it.worst_topic)}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>Nenhuma resposta ou nota no período e filtros escolhidos.</Text>
            )}
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}
