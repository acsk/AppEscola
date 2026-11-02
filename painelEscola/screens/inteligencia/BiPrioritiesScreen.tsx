import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Save } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import SegmentedControl from "../../components/bi/SegmentedControl";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiMeta, fetchBiPriorities, saveBiPriorities, type BiMeta, type BiPriorityTopics } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const WEIGHTS = [
  { value: "0", label: "—" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

/** Inteligência Educacional › Assuntos prioritários: peso de cada assunto no edital de cada concurso. */
export default function BiPrioritiesScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [examTypeId, setExamTypeId] = useState<number | null>(null);
  const [data, setData] = useState<BiPriorityTopics | null>(null);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchBiMeta()
      .then((m) => {
        setMeta(m);
        setExamTypeId((current) => current ?? m.filter_options.exam_types[0]?.id ?? null);
      })
      .catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    if (!examTypeId) return;
    setLoading(true);
    setMessage(null);
    fetchBiPriorities(examTypeId)
      .then((d) => {
        setData(d);
        setWeights(Object.fromEntries(d.subjects.flatMap((s) => s.topics.map((t) => [t.topic_id, t.weight]))));
      })
      .catch((err) => setMessage({ type: "error", text: getApiResponseMessage(err?.response?.data, "Não foi possível carregar os assuntos.") }))
      .finally(() => setLoading(false));
  }, [examTypeId]);

  const canEdit = !!meta?.scope.tenant_wide;
  const prioritized = Object.values(weights).filter((w) => w > 0).length;
  const needle = search.trim().toLocaleLowerCase("pt-BR");
  const subjects = useMemo(
    () =>
      (data?.subjects ?? [])
        .map((s) => ({
          ...s,
          topics: needle
            ? s.topics.filter((t) => `${s.name} ${t.name}`.toLocaleLowerCase("pt-BR").includes(needle))
            : s.topics,
        }))
        .filter((s) => s.topics.length),
    [data, needle]
  );

  const save = async () => {
    if (!examTypeId) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveBiPriorities(
        examTypeId,
        Object.entries(weights).filter(([, w]) => w > 0).map(([id, w]) => ({ topic_id: Number(id), weight: w }))
      );
      setData(saved);
      setMessage({ type: "success", text: "Assuntos prioritários salvos." });
    } catch (err: any) {
      setMessage({ type: "error", text: getApiResponseMessage(err?.response?.data, "Não foi possível salvar.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Assuntos prioritários" }]}
        title="Assuntos prioritários"
        description="Peso de cada assunto no edital do concurso (1 a 5). Base do índice de Preparação; sem cadastro, todos os assuntos contam igual."
        actions={canEdit ? <Button variant="primary" icon={Save} label="Salvar" onPress={save} loading={saving} disabled={!data} /> : null}
      />

      <View className="bg-surface border border-border rounded-ds-md flex-row flex-wrap" style={{ padding: 16, gap: 12, alignItems: "flex-end" }}>
        <View style={{ width: isMobile ? "100%" : 260 }}>
          <SearchableSelect
            label="Concurso"
            placeholder="Selecione"
            value={examTypeId ? String(examTypeId) : ""}
            options={(meta?.filter_options.exam_types ?? []).map((t) => ({ value: String(t.id), label: t.label }))}
            onChange={(v) => setExamTypeId(v ? Number(v) : null)}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 260 }}>
          <FormInput dense label="Buscar assunto" placeholder="Disciplina ou assunto" value={search} onChangeText={setSearch} />
        </View>
        {data ? (
          <Text className="text-ink-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {`${prioritized} assunto(s) prioritário(s)`}
            {data.courses.length ? ` · cursos com este concurso: ${data.courses.map((c) => c.name).join(", ")}` : " · nenhum curso aponta este concurso ainda"}
          </Text>
        ) : null}
      </View>

      {message ? (
        <Text className={message.type === "success" ? "text-success" : "text-danger"} style={{ fontSize: 13 }}>{message.text}</Text>
      ) : null}
      {!canEdit && meta ? (
        <Text className="text-ink-muted" style={{ fontSize: 13 }}>Somente a coordenação altera os pesos; você está vendo em modo leitura.</Text>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : subjects.length ? (
        subjects.map((s) => (
          <Panel key={s.subject_id} title={s.name} flush>
            {s.topics.map((t, i) => (
              <View
                key={t.topic_id}
                className={`flex-row flex-wrap items-center ${i < s.topics.length - 1 ? "border-b border-border" : ""}`}
                style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12, justifyContent: "space-between" }}
              >
                <Text className="text-ink" style={{ fontSize: 14, flexShrink: 1, minWidth: 160 }}>{t.name}</Text>
                {canEdit ? (
                  <SegmentedControl
                    accessibilityLabel={`Peso de ${t.name}`}
                    value={String(weights[t.topic_id] ?? 0)}
                    options={WEIGHTS}
                    onChange={(v) => setWeights((w) => ({ ...w, [t.topic_id]: Number(v) }))}
                  />
                ) : (
                  <Text className="font-mono text-ink-muted" style={{ fontSize: 13 }}>{weights[t.topic_id] ? `peso ${weights[t.topic_id]}` : "—"}</Text>
                )}
              </View>
            ))}
          </Panel>
        ))
      ) : data ? (
        <Panel>
          <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
            {needle ? "Nenhum assunto encontrado." : "Nenhum assunto cadastrado nas disciplinas desta escola."}
          </Text>
        </Panel>
      ) : null}
    </ScrollView>
  );
}
