import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import PageHeader from "../../components/ui/PageHeader";
import BiMetaBar from "../../components/bi/BiMetaBar";
import AiDraftPanel from "../../components/bi/AiDraftPanel";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { fetchBiMeta, type BiFilters, type BiMeta } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

/** Área do insight → tela com o detalhe. */
const AREA_SCREEN: Record<string, string> = {
  geral: "bi-overview",
  avaliacoes: "bi-assessments",
  disciplinas: "bi-subjects",
  turmas: "bi-classes",
  engajamento: "bi-engagement",
  intervencoes: "bi-follow-up",
};

/** Inteligência Educacional › Insights com IA: observações da escola redigidas a partir dos indicadores. */
export default function BiInsightsScreen({ navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Insights com IA" }]}
        title="Insights com IA"
        description="Observações sobre a escola no período, escritas a partir dos indicadores já calculados — cada uma com a evidência e o caminho para o detalhe."
      />

      <BiMetaBar plan={meta?.features.plan} extra="Só números vão para a IA; nenhum aluno é identificado" />

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
      />

      {meta && !meta.scope.tenant_wide ? (
        <Text className="text-ink-muted" style={{ fontSize: 13 }}>Os insights da escola são exclusivos da coordenação.</Text>
      ) : (
        <AiDraftPanel
          title="Observações da escola"
          target={{ kind: "school_insights" }}
          filters={filters}
          onOpenArea={(area) => navigate(AREA_SCREEN[area] ?? "bi-overview")}
        />
      )}

      <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
        <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
          <Text className="font-semibold text-ink">Como funciona. </Text>
          A IA recebe só os indicadores calculados pelo BI (sem nomes ou identificadores de alunos; turmas com menos de 10 alunos ficam de fora) e deve citar a evidência de cada observação. Números que não batem com os dados são sinalizados. Revise antes de compartilhar: a IA pode errar e não substitui a leitura da equipe.
        </Text>
      </View>
    </ScrollView>
  );
}
