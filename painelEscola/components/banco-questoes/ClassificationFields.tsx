import React, { useMemo } from "react";
import { Switch, Text, View } from "react-native";
import SearchableSelect from "../ui/SearchableSelect";
import FormSelect from "../ui/FormSelect";
import YearPickerInput from "../ui/YearPickerInput";
import SegmentedControl from "./SegmentedControl";
import TopicMultiSelect from "./TopicMultiSelect";
import TagChipsInput from "./TagChipsInput";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { type ClassificationForm, withSubject } from "../../utils/questionClassification";

type Props = {
  form: ClassificationForm;
  onChange: (form: ClassificationForm) => void;
  catalogs: QuestionBankCatalogs;
  /** Esconde "Modalidade (tipo de prova)" quando a tela já tem esse campo (ex.: questão de simulado). */
  hideExamType?: boolean;
  /** Modalidade imposta (ex.: questões que vão virar simulado): mostra o campo bloqueado com esse valor. */
  lockedExamTypeId?: number | null;
  /** Erros de disciplina/assuntos (`subject_id`, `topic_ids`), do cliente ou da API. */
  errors?: Record<string, string | undefined>;
};

/** Campos de classificação de uma questão. Disciplina e assunto são obrigatórios. */
export default function ClassificationFields({ form, onChange, catalogs, hideExamType = false, lockedExamTypeId = null, errors = {} }: Props) {
  const set = <K extends keyof ClassificationForm>(key: K, value: ClassificationForm[K]) =>
    onChange({ ...form, [key]: value });

  // Todos os assuntos, cada um com a disciplina dona (assunto nunca existe fora de uma disciplina).
  const allTopics = useMemo(
    () => catalogs.taxonomy.flatMap((s) => s.topics.map((t) => ({ ...t, subject_id: s.id, subject_name: s.name }))),
    [catalogs.taxonomy]
  );
  const topicSubjectById = useMemo(() => new Map(allTopics.map((t) => [t.id, t.subject_id])), [allTopics]);
  // Com disciplina: só os assuntos dela. Sem disciplina: busca em todos e a disciplina é preenchida ao escolher.
  const topics = useMemo(
    () => (form.subject_id ? allTopics.filter((t) => t.subject_id === form.subject_id).map(({ subject_name, ...t }) => t) : allTopics),
    [allTopics, form.subject_id]
  );

  const onTopicsChange = (ids: number[]) => {
    if (form.subject_id || ids.length === 0) {
      set("topic_ids", ids);
      return;
    }
    const subjectId = topicSubjectById.get(ids[0]) ?? null;
    onChange({ ...form, subject_id: subjectId, topic_ids: ids.filter((id) => topicSubjectById.get(id) === subjectId) });
  };

  const difficultyOptions = catalogs.difficulties.map((d) => ({ value: d.id, label: d.name }));
  const subjectOptions = catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }));
  const subjectWithoutTopics = !!form.subject_id && topics.length === 0;
  const boardOptions = [
    { value: "", label: "Nenhuma" },
    ...catalogs.boards.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  return (
    <View>
      {difficultyOptions.length > 0 && difficultyOptions.length <= 4 ? (
        <SegmentedControl
          label="Dificuldade"
          options={difficultyOptions}
          value={form.difficulty_id}
          onChange={(v) => set("difficulty_id", v)}
        />
      ) : (
        <FormSelect
          dense
          label="Dificuldade"
          value={form.difficulty_id ?? ""}
          placeholder="Sem dificuldade"
          options={[{ value: "", label: "Sem dificuldade" }, ...difficultyOptions]}
          onChange={(v) => set("difficulty_id", v ? Number(v) : null)}
        />
      )}

      <SearchableSelect
        dense
        showSelectedPreview={false}
        label="Disciplina"
        required
        placeholder="Selecione a disciplina"
        modalTitle="Selecionar disciplina"
        options={subjectOptions}
        value={form.subject_id ? String(form.subject_id) : ""}
        onChange={(v) => onChange(withSubject(form, v ? Number(v) : null, topicSubjectById))}
        error={errors.subject_id}
      />

      <TopicMultiSelect
        topics={topics}
        value={form.topic_ids}
        onChange={onTopicsChange}
        required={!subjectWithoutTopics}
        error={errors.topic_ids}
        disabled={subjectWithoutTopics}
        disabledHint="Esta disciplina não tem assuntos cadastrados. Cadastre em Banco de questões › Taxonomia."
      />

      <SearchableSelect
        dense
        showSelectedPreview={false}
        label="Banca"
        modalTitle="Selecionar banca"
        options={boardOptions}
        value={form.board_id ? String(form.board_id) : ""}
        onChange={(v) => set("board_id", v ? Number(v) : null)}
      />

      <YearPickerInput
        compact
        label="Ano"
        value={form.year ? String(form.year) : ""}
        onChange={(v) => set("year", v ? Number(v) : null)}
        minYear={1900}
        maxYear={new Date().getFullYear()}
      />

      {!hideExamType && catalogs.examTypes.length > 0 && (
        <FormSelect
          dense
          label={lockedExamTypeId ? "Modalidade (definida pelo simulado)" : "Modalidade (tipo de prova)"}
          value={lockedExamTypeId ?? form.exam_type_id ?? ""}
          placeholder="Padrão (Personalizado)"
          options={catalogs.examTypes.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(v) => v && set("exam_type_id", Number(v))}
          disabled={!!lockedExamTypeId}
        />
      )}

      <TagChipsInput
        value={form.tags}
        onChange={(tags) => set("tags", tags)}
        suggestions={catalogs.tags.map((t) => t.name)}
      />

      <View className="flex-row flex-wrap gap-4 mt-1">
        <SwitchRow label="Anulada pela banca" value={form.is_annulled} onChange={(v) => set("is_annulled", v)} />
        <SwitchRow label="Desatualizada" value={form.is_outdated} onChange={(v) => set("is_outdated", v)} />
      </View>
    </View>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center gap-2">
      <Switch
        value={value}
        onValueChange={onChange}
        aria-label={label}
        trackColor={{ true: "var(--ds-brand)", false: "var(--ds-border-strong)" }}
        thumbColor="#FFFFFF"
      />
      <Text className="text-xs text-ink">{label}</Text>
    </View>
  );
}
