import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import FormSelect from "../ui/FormSelect";
import SearchableSelect from "../ui/SearchableSelect";
import DatePickerInput from "../ui/DatePickerInput";
import { fmtDate } from "./format";
import { fetchActiveSubjects, fetchTopics } from "../../services/questionBank";
import { getApiResponseMessage, parseApiErrors } from "../../utils/apiErrors";
import {
  createIntervention,
  fetchBiStudents,
  fetchInterventionOptions,
  type BiInterventionDetail,
  type BiInterventionOptions,
} from "../../services/biService";
import type { SubjectTopic } from "../../types/questionBank";

/** Pré-preenchimento vindo da sugestão, do Diagnóstico 360° ou dos Perfis. */
export type InterventionPreset = {
  students?: { id: number; name: string }[];
  reasonCode?: string;
  reasonDetail?: string;
  subjectId?: number | null;
  topicId?: number | null;
  schoolClassId?: number | null;
  type?: string;
};

type Props = {
  visible: boolean;
  preset?: InterventionPreset;
  onClose: () => void;
  onCreated: (intervention: BiInterventionDetail) => void;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromBr = (v: string) => {
  const [d, m, y] = v.split("/");
  return d && m && y?.length === 4 ? `${y}-${m}-${d}` : "";
};

/** Nova intervenção: alunos, tipo, motivo, alvo (disciplina/assunto), responsável e prazo. O "antes" é medido pela API. */
export default function InterventionFormModal({ visible, preset, onClose, onCreated }: Props) {
  const [options, setOptions] = useState<BiInterventionOptions | null>(null);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [topics, setTopics] = useState<SubjectTopic[]>([]);
  const [studentOptions, setStudentOptions] = useState<{ value: string; label: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const presetStudents = preset?.students ?? [];

  useEffect(() => {
    if (!visible) return;
    const today = new Date();
    const reassess = new Date(today);
    reassess.setDate(today.getDate() + 30);
    setErrors({});
    setMessage("");
    setStudentId("");
    setForm({
      type: preset?.type ?? "practice_list",
      title: "",
      reason_code: preset?.reasonCode ?? "below_goal",
      reason_detail: preset?.reasonDetail ?? "",
      subject_id: preset?.subjectId ? String(preset.subjectId) : "",
      subject_topic_id: preset?.topicId ? String(preset.topicId) : "",
      responsible_user_id: "",
      starts_on: fmtDate(ymd(today)),
      reassess_on: fmtDate(ymd(reassess)),
      status: "in_progress",
      note: "",
    });
    fetchInterventionOptions().then(setOptions).catch(() => setOptions(null));
    fetchActiveSubjects().then(setSubjects).catch(() => setSubjects([]));
    if (!presetStudents.length) {
      fetchBiStudents({}, { filter: "all", page: 1, perPage: 100 })
        .then((d) => setStudentOptions(d.items.map((s) => ({ value: String(s.student_id), label: s.name }))))
        .catch(() => setStudentOptions([]));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.subject_id) {
      setTopics([]);
      return;
    }
    fetchTopics([Number(form.subject_id)]).then(setTopics).catch(() => setTopics([]));
  }, [form.subject_id]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const ids = presetStudents.length ? presetStudents.map((s) => s.id) : studentId ? [Number(studentId)] : [];

  const save = async () => {
    setSaving(true);
    setErrors({});
    setMessage("");
    try {
      const created = await createIntervention({
        student_ids: ids,
        type: form.type,
        title: form.title.trim() || null,
        reason_code: form.reason_code,
        reason_detail: form.reason_detail.trim() || null,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        subject_topic_id: form.subject_topic_id ? Number(form.subject_topic_id) : null,
        school_class_id: preset?.schoolClassId ?? null,
        responsible_user_id: form.responsible_user_id ? Number(form.responsible_user_id) : null,
        starts_on: fromBr(form.starts_on),
        reassess_on: fromBr(form.reassess_on) || null,
        status: form.status as "planned" | "in_progress",
        note: form.note.trim() || null,
      });
      onCreated(created);
      onClose();
    } catch (err: any) {
      const raw = err?.response?.data;
      if (raw?.errors) setErrors(parseApiErrors(raw.errors));
      setMessage(getApiResponseMessage(raw, "Não foi possível registrar a intervenção."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={presetStudents.length > 1 ? `Intervenção em grupo · ${presetStudents.length} alunos` : "Nova intervenção"}
      size="lg"
      compact
      onClose={onClose}
      footer={
        <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <Button label="Cancelar" onPress={onClose} />
          <Button variant="primary" label="Registrar intervenção" onPress={save} loading={saving} disabled={!ids.length || !fromBr(form.starts_on ?? "")} />
        </View>
      }
    >
      <View style={{ gap: 4 }}>
        {presetStudents.length ? (
          <Text className="text-ink-muted" style={{ fontSize: 13, marginBottom: 8 }} numberOfLines={3}>
            {`Alunos: ${presetStudents.map((s) => s.name).join(", ")}`}
          </Text>
        ) : (
          <SearchableSelect label="Aluno" placeholder="Selecione o aluno" value={studentId} options={studentOptions} onChange={setStudentId} />
        )}
        {errors.student_ids ? <Text className="text-danger" style={{ fontSize: 12 }}>{errors.student_ids}</Text> : null}

        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <FormSelect label="Tipo" value={form.type ?? ""} options={options?.types ?? []} onChange={(v) => set("type", v)} />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <FormSelect label="Motivo" value={form.reason_code ?? ""} options={options?.reasons ?? []} onChange={(v) => set("reason_code", v)} />
          </View>
        </View>
        <FormInput label="Título (opcional)" placeholder="Ex.: Lista de 20 questões + 1 aula de reforço" value={form.title ?? ""} onChangeText={(v) => set("title", v)} error={errors.title} />
        <FormInput label="Detalhe do motivo" placeholder="Ex.: erro de denominador comum recorrente" value={form.reason_detail ?? ""} onChangeText={(v) => set("reason_detail", v)} error={errors.reason_detail} />

        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <SearchableSelect
              label="Disciplina-alvo"
              placeholder="Média geral nas avaliações"
              value={form.subject_id ?? ""}
              options={[{ value: "", label: "Média geral nas avaliações" }, ...subjects.map((s) => ({ value: String(s.id), label: s.name }))]}
              onChange={(v) => setForm((f) => ({ ...f, subject_id: v, subject_topic_id: "" }))}
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <SearchableSelect
              label="Assunto-alvo"
              placeholder={form.subject_id ? "Toda a disciplina" : "Escolha a disciplina"}
              value={form.subject_topic_id ?? ""}
              options={[{ value: "", label: "Toda a disciplina" }, ...topics.map((t) => ({ value: String(t.id), label: t.name }))]}
              onChange={(v) => set("subject_topic_id", v)}
            />
          </View>
        </View>
        <Text className="text-ink-subtle" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          O "antes" e o "depois" são medidos no alvo: acerto no assunto, senão na disciplina, senão média nas avaliações.
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <SearchableSelect
              label="Responsável"
              placeholder="Eu mesmo"
              value={form.responsible_user_id ?? ""}
              options={[{ value: "", label: "Eu mesmo" }, ...(options?.responsibles ?? []).map((u) => ({ value: String(u.id), label: u.name }))]}
              onChange={(v) => set("responsible_user_id", v)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <FormSelect
              label="Situação inicial"
              value={form.status ?? "in_progress"}
              options={[
                { value: "in_progress", label: "Em andamento" },
                { value: "planned", label: "Aguardando início" },
              ]}
              onChange={(v) => set("status", v)}
            />
          </View>
        </View>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <DatePickerInput label="Início" value={form.starts_on ?? ""} onChangeText={(v) => set("starts_on", v)} error={errors.starts_on} required />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <DatePickerInput label="Reavaliação" value={form.reassess_on ?? ""} onChangeText={(v) => set("reassess_on", v)} error={errors.reassess_on} />
          </View>
        </View>
        <FormInput label="Observação (opcional)" value={form.note ?? ""} onChangeText={(v) => set("note", v)} multiline />
        {message ? <Text className="text-danger" style={{ fontSize: 13 }}>{message}</Text> : null}
      </View>
    </Modal>
  );
}
