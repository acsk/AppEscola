import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import SearchableSelect from "../../components/ui/SearchableSelect";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage, parseApiErrors } from "../../utils/apiErrors";
import {
  deleteBiExamOutcome,
  fetchBiExamOutcomes,
  fetchBiMeta,
  fetchBiStudents,
  saveBiExamOutcome,
  type BiExamOutcome,
  type BiMeta,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const RESULTS = [
  { value: "approved", label: "Aprovado" },
  { value: "classified", label: "Classificado" },
  { value: "not_approved", label: "Não aprovado" },
];

/** Aprovações comprovadas: base do indicador do relatório de Resultados (sempre agregado). */
export default function BiOutcomesScreen({ navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [items, setItems] = useState<BiExamOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<BiExamOutcome> | null>(null);

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchBiExamOutcomes(year ? Number(year) : undefined));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as aprovações."));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const thisYear = new Date().getFullYear();

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Relatórios e indicadores", onPress: () => navigate("bi-reports") },
          { label: "Aprovações comprovadas" },
        ]}
        title="Aprovações comprovadas"
        description="Resultados de concursos com evidência. No relatório de Resultados entram só agregados; divulgação individual depende do consentimento registrado."
        actions={<Button variant="primary" icon={Plus} label="Registrar resultado" onPress={() => setEditing({ year: Number(year) || thisYear, result: "approved", consent_publish: false })} />}
      />

      <View style={{ width: 200 }}>
        <FormSelect
          label="Ano"
          value={year}
          options={[{ value: "", label: "Todos" }, ...[0, 1, 2, 3].map((d) => ({ value: String(thisYear - d), label: String(thisYear - d) }))]}
          onChange={setYear}
        />
      </View>

      {error ? <Text className="text-danger" style={{ fontSize: 13 }}>{error}</Text> : null}

      <Panel flush>
        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={color.brand} />
          </View>
        ) : items.length ? (
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
            <View style={{ minWidth: 760, width: "100%" }} role="table" aria-label="Aprovações comprovadas">
              <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                {[["Aluno", 2], ["Concurso", 2], ["Ano", 0.6], ["Resultado", 1], ["Evidência", 1.2], ["Divulgação", 1]].map(([h, f]) => (
                  <Text key={h as string} className="font-medium text-ink-muted" style={{ fontSize: 12, flex: f as number }}>{h}</Text>
                ))}
              </View>
              {items.map((o, i) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  onPress={() => setEditing(o)}
                  className={`flex-row items-center ${i < items.length - 1 ? "border-b border-border" : ""}`}
                  style={({ hovered }: any) => [{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }, hovered ? { backgroundColor: color["surface-sunken"] } : null]}
                >
                  <Text className="text-ink" style={{ fontSize: 14, flex: 2 }} numberOfLines={1}>{o.student}</Text>
                  <Text className="text-ink" style={{ fontSize: 13, flex: 2 }} numberOfLines={1}>{o.exam_type ? `${o.exam_type} · ${o.exam_name}` : o.exam_name}</Text>
                  <Text className="font-mono text-ink" style={{ fontSize: 12, flex: 0.6 }}>{o.year}</Text>
                  <View style={{ flex: 1 }}>
                    <Badge label={RESULTS.find((r) => r.value === o.result)?.label ?? o.result} tone={o.result === "not_approved" ? "neutral" : "success"} dot />
                  </View>
                  <Text className="text-ink-muted" style={{ fontSize: 12, flex: 1.2 }} numberOfLines={1}>{o.evidence_url ? "Link anexado" : o.evidence_note ?? "—"}</Text>
                  <Text className={o.consent_publish ? "text-success" : "text-ink-subtle"} style={{ fontSize: 12, flex: 1 }}>{o.consent_publish ? "Autorizada" : "Sem consentimento"}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 32 }}>Nenhum resultado registrado.</Text>
        )}
      </Panel>

      <OutcomeModal value={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </ScrollView>
  );
}

function OutcomeModal({ value, meta, onClose, onSaved }: { value: Partial<BiExamOutcome> | null; meta: BiMeta | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<BiExamOutcome>>({});
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setForm(value);
    setErrors({});
    setMessage("");
    fetchBiStudents({}, { filter: "all", page: 1, perPage: 100 })
      .then((d) => setStudents(d.items.map((s) => ({ value: String(s.student_id), label: s.name }))))
      .catch(() => setStudents([]));
  }, [value]);

  const set = (patch: Partial<BiExamOutcome>) => setForm((f) => ({ ...f, ...patch }));
  const editing = !!value?.id;

  const save = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await saveBiExamOutcome(
        {
          student_id: form.student_id,
          exam_type_id: form.exam_type_id ?? null,
          exam_name: form.exam_name,
          year: form.year,
          result: form.result,
          position: form.position ?? null,
          evidence_url: form.evidence_url || null,
          evidence_note: form.evidence_note || null,
          consent_publish: !!form.consent_publish,
        },
        value?.id
      );
      onSaved();
    } catch (err: any) {
      const raw = err?.response?.data;
      if (raw?.errors) setErrors(parseApiErrors(raw.errors));
      setMessage(getApiResponseMessage(raw, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!value}
      title={editing ? "Editar resultado" : "Registrar resultado"}
      size="md"
      compact
      onClose={onClose}
      footer={
        <View className="flex-row" style={{ gap: 8, justifyContent: "space-between", flex: 1 }}>
          {editing ? (
            <Button label="Remover" onPress={() => value?.id && deleteBiExamOutcome(value.id).then(onSaved).catch(() => setMessage("Não foi possível remover."))} />
          ) : (
            <View />
          )}
          <View className="flex-row" style={{ gap: 8 }}>
            <Button label="Cancelar" onPress={onClose} />
            <Button variant="primary" label="Salvar" onPress={save} loading={busy} disabled={!form.student_id || !form.exam_name || !form.year} />
          </View>
        </View>
      }
    >
      <View style={{ gap: 4 }}>
        {editing ? (
          <Text className="text-ink" style={{ fontSize: 14, marginBottom: 8 }}>{value?.student}</Text>
        ) : (
          <SearchableSelect label="Aluno" placeholder="Selecione" value={form.student_id ? String(form.student_id) : ""} options={students} onChange={(v) => set({ student_id: v ? Number(v) : undefined })} />
        )}
        {errors.student_id ? <Text className="text-danger" style={{ fontSize: 12 }}>{errors.student_id}</Text> : null}
        <SearchableSelect
          label="Concurso (tipo)"
          placeholder="Opcional"
          value={form.exam_type_id ? String(form.exam_type_id) : ""}
          options={[{ value: "", label: "—" }, ...(meta?.filter_options.exam_types ?? []).map((t) => ({ value: String(t.id), label: t.label }))]}
          onChange={(v) => set({ exam_type_id: v ? Number(v) : null })}
        />
        <FormInput label="Nome do concurso / edital" value={form.exam_name ?? ""} onChangeText={(v) => set({ exam_name: v })} error={errors.exam_name} placeholder="Ex.: CPM 2026 · 1ª fase" />
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 120 }}>
            <FormInput label="Ano" value={form.year ? String(form.year) : ""} onChangeText={(v) => set({ year: Number(v.replace(/\D/g, "")) || undefined })} valueFormat="integer" error={errors.year} />
          </View>
          <View style={{ flex: 1, minWidth: 160 }}>
            <FormSelect label="Resultado" value={form.result ?? "approved"} options={RESULTS} onChange={(v) => set({ result: v as BiExamOutcome["result"] })} />
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <FormInput label="Posição (opcional)" value={form.position ? String(form.position) : ""} onChangeText={(v) => set({ position: Number(v.replace(/\D/g, "")) || null })} valueFormat="integer" />
          </View>
        </View>
        <FormInput label="Link da evidência (lista oficial)" value={form.evidence_url ?? ""} onChangeText={(v) => set({ evidence_url: v })} error={errors.evidence_url} placeholder="https://" />
        <FormInput label="Observação da evidência" value={form.evidence_note ?? ""} onChangeText={(v) => set({ evidence_note: v })} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!form.consent_publish }}
          onPress={() => set({ consent_publish: !form.consent_publish })}
          className="flex-row items-center"
          style={{ gap: 8, marginTop: 4 }}
        >
          <View style={{ width: 18, height: 18, borderRadius: 3, borderWidth: 1, borderColor: color["border-strong"], backgroundColor: form.consent_publish ? color.brand : color.surface }} />
          <Text className="text-ink" style={{ fontSize: 13 }}>Aluno (ou responsável) autorizou o uso em divulgação</Text>
        </Pressable>
        {message ? <Text className="text-danger" style={{ fontSize: 13 }}>{message}</Text> : null}
      </View>
    </Modal>
  );
}
