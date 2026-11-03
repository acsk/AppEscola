import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import MetricCard from "../../components/bi/MetricCard";
import MultiLineChart from "../../components/bi/MultiLineChart";
import BiMetaBar from "../../components/bi/BiMetaBar";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiEngagement,
  fetchBiMeta,
  fetchBiMetrics,
  type BiEngagement,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const TILES = [
  { key: "attendance.rate", label: "Frequência média", unit: "%" },
  { key: "engagement.active_days_week", label: "Dias ativos por semana", hint: "média dos alunos" },
  { key: "engagement.index_avg", label: "Engajamento médio", unit: " / 100" },
  { key: "students.low_attendance", label: "Frequência baixa", goodWhen: "down" as const, hint: "alunos" },
];

const pct = (v: number | null) => (v === null ? "—" : `${fmtNumber(v, 0)}%`);

/** Inteligência Educacional › Frequência e engajamento. */
export default function BiEngagementScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiEngagement | null>(null);
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
      setData(await fetchBiEngagement(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar frequência e engajamento."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const metric = (key: string) => data?.metrics.find((m) => m.key === key);
  const columns = width >= 1200 ? 4 : width >= 768 ? 2 : 1;
  const wide = width >= 1100;
  const maxBucket = Math.max(1, ...(data?.distribution ?? []).map((b) => b.count));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Frequência e engajamento" }]}
        title="Frequência e engajamento"
        description="Presença nas aulas, regularidade de uso da plataforma e participação nos simulados."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: chamadas, uso do app, banco de questões e simulados" />

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
                <MetricCard label={tile.label} metric={metric(tile.key)} definition={definitions[tile.key]} unit={tile.unit} hint={tile.hint} goodWhen={tile.goodWhen} />
              </View>
            ))}
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Semana a semana" description="Frequência nas aulas e % de alunos com alguma atividade registrada · semana sem chamadas fica em branco.">
                <MultiLineChart
                  labels={data.weekly.map((w) => w.label)}
                  series={[
                    { key: "attendance", name: "Frequência", color: color["data-1"], values: data.weekly.map((w) => w.attendance) },
                    { key: "active", name: "Alunos ativos", color: color["data-2"], values: data.weekly.map((w) => w.active_share) },
                  ]}
                  accessibilityLabel="Frequência e alunos ativos por semana"
                />
              </Panel>
            </View>
            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Dias ativos por semana" description={`Quantos alunos em cada faixa · referência da escola: ${fmtNumber(data.meta.dedication_days_per_week, 1)} dias.`}>
                <View style={{ gap: 10 }}>
                  {data.distribution.map((b) => (
                    <View key={b.label} className="flex-row items-center" style={{ gap: 10 }} aria-label={`${b.label}: ${b.count} alunos`}>
                      <Text className="text-ink-muted" style={{ fontSize: 12, width: 92 }}>{b.label}</Text>
                      <View className="bg-surface-sunken" style={{ flex: 1, height: 12, borderRadius: 2 }}>
                        <View style={{ width: `${(b.count / maxBucket) * 100}%`, height: 12, borderRadius: 2, backgroundColor: b.from >= data.meta.dedication_days_per_week ? color["data-1"] : color["ink-subtle"] }} />
                      </View>
                      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 36, textAlign: "right" }}>{b.count}</Text>
                    </View>
                  ))}
                  <Text className="text-ink-subtle" style={{ fontSize: 11 }}>Em azul, faixas na referência ou acima. "Sem registro" não significa que o aluno não estudou fora da plataforma.</Text>
                </View>
              </Panel>
            </View>
          </View>

          <Panel title="Por turma" description="Frequência pelas chamadas da própria turma · aluno em duas turmas conta nas duas." flush>
            {data.classes.length ? (
              <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
                <View style={{ minWidth: 720, width: "100%" }} role="table" aria-label="Engajamento por turma">
                  <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Turma</Text>
                    {["Alunos", "Frequência", "Dias/sem.", "Participação", "Engajamento", "Sem registro"].map((h) => (
                      <Text key={h} className="font-medium text-ink-muted" style={{ fontSize: 12, width: 88, textAlign: "right" }}>{h}</Text>
                    ))}
                  </View>
                  {data.classes.map((c, i) => (
                    <View key={c.school_class_id} className={`flex-row items-center ${i < data.classes.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="text-ink" style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>{c.name}</Text>
                      <Cell>{String(c.students)}</Cell>
                      <Cell muted={c.attendance === null}>
                        {c.attendance === null ? "—" : `${fmtNumber(c.attendance, 0)}%${c.attendance < data.meta.attendance_alert_below ? " ▾" : ""}`}
                      </Cell>
                      <Cell>{fmtNumber(c.active_days_per_week, 1)}</Cell>
                      <Cell muted={c.participation === null}>{pct(c.participation)}</Cell>
                      <Cell muted={c.engagement === null}>{c.engagement === null ? "—" : fmtNumber(c.engagement, 0)}</Cell>
                      <Cell>{String(c.no_activity)}</Cell>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>Nenhuma turma no recorte.</Text>
            )}
          </Panel>

          <Panel
            title="Menor engajamento"
            description={`Alunos com o menor índice de Engajamento (precisa de 2 componentes com dados). ${data.lowest.no_activity} aluno(s) sem nenhuma atividade registrada no período.`}
            flush
          >
            {data.lowest.items.length ? (
              data.lowest.items.map((s, i) => (
                <View key={s.student_id} className={`flex-row flex-wrap items-center ${i < data.lowest.items.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{s.name}</Text>
                    <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{s.classes.join(", ") || "—"}</Text>
                  </View>
                  <Text className="font-mono font-semibold text-ink" style={{ fontSize: 14, width: 48, textAlign: "right" }}>{fmtNumber(s.engagement, 0)}</Text>
                  <Text className="text-ink-muted" style={{ fontSize: 12, flex: 2, minWidth: 220 }}>
                    {s.components
                      .map((c) =>
                        `${c.label}: ${!c.sufficient ? "—" : c.key === "regularity" && c.raw !== null ? `${fmtNumber(c.raw, 1)} dias/sem.` : `${fmtNumber(c.value as number, 0)}%`}`
                      )
                      .join(" · ")}
                  </Text>
                  <Pressable accessibilityRole="link" onPress={() => navigate("bi-diagnosis", { studentId: s.student_id, filters })}>
                    <Text className="font-medium text-brand" style={{ fontSize: 13 }}>360°</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>Nenhum aluno com índice de Engajamento no período.</Text>
            )}
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Text className={`font-mono ${muted ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 88, textAlign: "right" }}>
      {children}
    </Text>
  );
}
