import React, { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import PageHeader from "../../components/ui/PageHeader";
import BiMetaBar from "../../components/bi/BiMetaBar";
import SchoolInsightsPanel from "../../components/bi/SchoolInsightsPanel";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { useAuth } from "../../contexts/AuthContext";
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
  const { user } = useAuth();
  const canManageAi = ["super_admin", "admin", "coordenador"].includes(user?.role ?? "");
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
        description="O que mudou na escola no período, em linguagem simples, com os indicadores e o caminho para agir."
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
        <SchoolInsightsPanel
          filters={filters}
          onOpenArea={(area) => navigate(AREA_SCREEN[area] ?? "bi-overview")}
          onOpenSettings={canManageAi ? () => navigate("configuracoes-ia") : undefined}
        />
      )}

    </ScrollView>
  );
}
