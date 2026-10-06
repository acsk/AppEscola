import React, { useMemo } from "react";
import { Switch, Text, View } from "react-native";
import SearchableSelect from "../ui/SearchableSelect";
import FormSelect from "../ui/FormSelect";
import YearPickerInput from "../ui/YearPickerInput";
import SegmentedControl from "./SegmentedControl";
import TopicMultiSelect from "./TopicMultiSelect";
import TagChipsInput from "./TagChipsInput";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { useSubjectTopics } from "../../hooks/useQuestionBankCatalogs";
import { type ClassificationForm, withSubject } from "../../utils/questionClassification";

type Props = {
  form: ClassificationForm;
  onChange: (form: ClassificationForm) => void;
  catalogs: QuestionBankCatalogs;
};

/** Campos de classificação de uma questão. */
export default function ClassificationFields({ form, onChange, catalogs }: Props) {
  const { topics, loading: topicsLoading } = useSubjectTopics(form.subject_id);
  const set = <K extends keyof ClassificationForm>(key: K, value: ClassificationForm[K]) =>
    onChange({ ...form, [key]: value });

  const topicSubjectById = useMemo(() => new Map(topics.map((t) => [t.id, t.subject_id])), [topics]);

  const difficultyOptions = catalogs.difficulties.map((d) => ({ value: d.id, label: d.name }));
  const subjectOptions = [
    { value: "", label: "Nenhuma" },
    ...catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name })),
  ];
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
        modalTitle="Selecionar disciplina"
        options={subjectOptions}
        value={form.subject_id ? String(form.subject_id) : ""}
        onChange={(v) => onChange(withSubject(form, v ? Number(v) : null, topicSubjectById))}
      />

      <TopicMultiSelect
        topics={topics}
        value={form.topic_ids}
        onChange={(ids) => set("topic_ids", ids)}
        disabled={!form.subject_id}
        loading={topicsLoading}
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

      {catalogs.examTypes.length > 0 && (
        <FormSelect
          dense
          label="Modalidade (tipo de prova)"
          value={form.exam_type_id ?? ""}
          placeholder="Padrão (Personalizado)"
          options={catalogs.examTypes.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(v) => v && set("exam_type_id", Number(v))}
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
