import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import MetricCard from "../../components/bi/MetricCard";
import Heatmap from "../../components/bi/Heatmap";
import BiMetaBar from "../../components/bi/BiMetaBar";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiMeta,
  fetchBiMetrics,
  fetchBiPerformance,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
  type BiPerformance,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const TILES = [
  { key: "grades.avg", label: "Média das notas", unit: "%" },
  { key: "grades.at_goal_share", label: "Notas na meta", unit: "%" },
  { key: "grades.absence_rate", label: "Faltas em avaliações", unit: "%", goodWhen: "down" as const },
];

/** Inteligência Educacional › Desempenho acadêmico: visão de boletim das avaliações presenciais. */
export default function BiPerformanceScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
    fetchBiMetrics()
      .then((list) => setDefinitions(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setDefinitions({}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiPerformance(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o desempenho acadêmico."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const metric = (key: string) => data?.metrics.find((m) => m.key === key);
  const goal = data?.meta.goal_pct ?? 70;
  const columns = width >= 900 ? 3 : 1;
  const minSample = data?.meta.min_sample ?? 5;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Desempenho acadêmico" }]}
        title="Desempenho acadêmico"
        description="Notas das avaliações presenciais publicadas por disciplina e turma. Faltas ficam fora da média."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fonte: avaliações presenciais publicadas" />

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
            {TILES.map((tile) => (
              <View key={tile.key} style={{ width: `${100 / columns}%`, paddingHorizontal: 8 }}>
                <MetricCard label={tile.label} metric={metric(tile.key)} definition={definitions[tile.key]} unit={tile.unit} goodWhen={tile.goodWhen} />
              </View>
            ))}
          </View>

          <Panel title="Turmas × disciplinas" description={`Média das notas em % da nota máxima · célula com menos de ${minSample} notas fica hachurada.`}>
            {data.matrix.rows.length ? (
              <Heatmap
                heatmap={data.matrix}
                goal={goal}
                minSample={minSample}
                tableLabel="Média das notas presenciais por turma e disciplina"
                countLabel="notas"
                valueLabel="de média"
              />
            ) : (
              <EmptyState text="Nenhuma nota presencial lançada no período e filtros escolhidos." />
            )}
          </Panel>

          <Panel title="Por disciplina" description="Da menor média para a maior · variação contra o período anterior de mesma duração." flush>
            {data.subjects.length ? (
              <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
                <View style={{ minWidth: 760, width: "100%" }} role="table" aria-label="Notas por disciplina">
                  <View className="flex-row bg-surface-sunken border-b border-border" role="row" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                    <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1, minWidth: 160 }}>Disciplina</Text>
                    {[
                      ["Média", 72],
                      ["Variação", 96],
                      ["Na meta", 72],
                      ["Notas", 64],
                      ["Alunos", 64],
                      ["Faltas", 96],
                    ].map(([label, w]) => (
                      <Text key={label as string} role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width: w as number, textAlign: "right" }}>
                        {label}
                      </Text>
                    ))}
                  </View>
                  {data.subjects.map((s, i) => (
                    <View key={s.subject_id} role="row" className={`flex-row items-center ${i < data.subjects.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="text-ink" style={{ fontSize: 14, flex: 1, minWidth: 160 }} numberOfLines={1}>{s.name}</Text>
                      <Text className={`font-mono ${s.avg === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                        {s.avg === null ? "—" : `${fmtNumber(s.avg, 1)}%${s.below_goal ? " ▾" : ""}`}
                      </Text>
                      <Text
                        className={`font-mono ${s.delta_pp === null ? "text-ink-subtle" : s.delta_pp < 0 ? "text-danger" : "text-success"}`}
                        style={{ fontSize: 12, width: 96, textAlign: "right" }}
                      >
                        {s.delta_pp === null ? "—" : `${s.delta_pp < 0 ? "▼ −" : "▲ +"}${fmtNumber(Math.abs(s.delta_pp), 1)} pp`}
                      </Text>
                      <Text className={`font-mono ${s.at_goal_pct === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                        {s.at_goal_pct === null ? "—" : `${fmtNumber(s.at_goal_pct, 0)}%`}
                      </Text>
                      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 64, textAlign: "right" }}>{s.grades.toLocaleString("pt-BR")}</Text>
                      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 64, textAlign: "right" }}>{s.students.toLocaleString("pt-BR")}</Text>
                      <Text className="font-mono text-ink-muted" style={{ fontSize: 12, width: 96, textAlign: "right" }}>
                        {`${s.absences} (${fmtNumber(s.absence_rate, 0)}%)`}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={{ padding: 24 }}>
                <EmptyState text="Nenhuma nota presencial lançada no período e filtros escolhidos." />
              </View>
            )}
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
