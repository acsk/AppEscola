import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import Pagination from "../../components/ui/Pagination";
import StatTile from "../../components/ui/StatTile";
import BiMetaBar from "../../components/bi/BiMetaBar";
import SegmentedControl from "../../components/bi/SegmentedControl";
import StudentRosterTable from "../../components/bi/StudentRosterTable";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiMeta, fetchBiStudents, type BiFilters, type BiMeta, type BiStudentList, type BiStudentListFilter } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const PER_PAGE = 25;

/** Inteligência Educacional › Evolução dos alunos: lista com sinais individuais; abre a evolução de cada aluno. */
export default function BiStudentsScreen({ navigate }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [listFilter, setListFilter] = useState<BiStudentListFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BiStudentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  // Busca só depois de uma pausa na digitação.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [filters, listFilter, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiStudents(filters, { filter: listFilter, search, page, perPage: PER_PAGE }));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os alunos."));
    } finally {
      setLoading(false);
    }
  }, [filters, listFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;
  const threshold = data?.meta.evolution_threshold_pp ?? meta?.defaults.evolution_threshold_pp ?? 5;
  const columns = width >= 1100 ? 4 : width >= 600 ? 2 : 1;
  const tiles = summary
    ? [
        { label: "Alunos no recorte", value: summary.total, hint: "matrícula ativa no período" },
        { label: "Em atenção", value: summary.attention, hint: summary.total ? `${fmtNumber((summary.attention / summary.total) * 100, 0)}% dos alunos` : undefined },
        { label: "Em evolução", value: summary.improving, hint: `+${fmtNumber(threshold, 0)} pp ou mais · de ${summary.with_evolution} com amostra` },
        { label: "Em queda", value: summary.declining, hint: `−${fmtNumber(threshold, 0)} pp ou mais · de ${summary.with_evolution} com amostra` },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Evolução dos alunos" }]}
        title="Evolução dos alunos"
        description="Cada aluno comparado consigo mesmo em avaliações comparáveis e com os colegas de turma."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: simulados, avaliações presenciais, banco de questões e frequência" />

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
      />

      {summary ? (
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
          {tiles.map((tile) => (
            <View key={tile.label} style={{ width: `${100 / columns}%`, paddingHorizontal: 8 }}>
              <StatTile label={tile.label} value={tile.value.toLocaleString("pt-BR")} hint={tile.hint} />
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

      <Panel
        title="Alunos"
        description={
          data
            ? `Em atenção primeiro. Médias individuais exigem ${data.meta.min_student_results} avaliações; banco, ${data.meta.min_practice_answers} respostas; frequência, ${data.meta.min_attendance_records} chamadas.`
            : undefined
        }
        flush
      >
        <View className="flex-row flex-wrap border-b border-border" style={{ padding: 16, gap: 12, alignItems: "flex-end" }}>
          <View style={{ width: width < 600 ? "100%" : 280 }}>
            <FormInput dense label="Buscar aluno" placeholder="Nome do aluno" value={searchText} onChangeText={setSearchText} />
          </View>
          <View style={{ marginBottom: 8 }}>
            <SegmentedControl
              accessibilityLabel="Recorte da lista"
              value={listFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "attention", label: "Em atenção" },
                { value: "improving", label: "Em evolução" },
                { value: "declining", label: "Em queda" },
              ]}
              onChange={setListFilter}
            />
          </View>
        </View>

        {loading && !data ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator size="large" color={color.brand} />
          </View>
        ) : data && data.items.length ? (
          <View style={{ opacity: loading ? 0.6 : 1 }}>
            <StudentRosterTable
              students={data.items}
              goal={data.meta.goal_pct}
              showClasses
              ariaLabel="Alunos do recorte"
              action={{ label: "Ver evolução", onPress: (id) => navigate("bi-student", { studentId: id, filters }) }}
            />
            <View style={{ padding: 16 }}>
              <Pagination
                currentPage={data.pagination.page}
                lastPage={data.pagination.last_page}
                total={data.pagination.total}
                perPage={data.pagination.per_page}
                onPageChange={setPage}
              />
            </View>
          </View>
        ) : data ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 24, alignItems: "center" }}>
            <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>
              {search ? `Nenhum aluno encontrado para "${search}".` : "Nenhum aluno neste recorte no período e filtros escolhidos."}
            </Text>
          </View>
        ) : null}
      </Panel>
    </ScrollView>
  );
}
