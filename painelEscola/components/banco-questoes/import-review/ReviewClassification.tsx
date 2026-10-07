import React, { useMemo, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronRight, X } from "lucide-react-native";
import SearchableSelect from "../../ui/SearchableSelect";
import YearPickerInput from "../../ui/YearPickerInput";
import TagChipsInput from "../TagChipsInput";
import { hoverStyle } from "./webPress";
import { color } from "../../../constants/theme";
import type { QuestionBankCatalogs } from "../../../hooks/useQuestionBankCatalogs";
import { type ClassificationForm, withSubject } from "../../../utils/questionClassification";

type Props = {
  form: ClassificationForm;
  onChange: (form: ClassificationForm) => void;
  catalogs: QuestionBankCatalogs;
  /** Disciplinas escolhidas para a prova vêm primeiro na lista. */
  preferredSubjectIds?: number[];
  disabled?: boolean;
};

/** Classificação da revisão: disciplina, dificuldade, assuntos (chips com busca) e campos extras recolhidos. */
export default function ReviewClassification({ form, onChange, catalogs, preferredSubjectIds = [], disabled }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [more, setMore] = useState(false);

  const topicsById = useMemo(() => new Map(catalogs.taxonomy.flatMap((s) => s.topics.map((t) => [t.id, { ...t, subject_id: s.id }] as const))), [catalogs.taxonomy]);
  const topicSubjectById = useMemo(() => new Map([...topicsById.values()].map((t) => [t.id, t.subject_id])), [topicsById]);
  const subjectTopics = useMemo(
    () => catalogs.taxonomy.find((s) => s.id === form.subject_id)?.topics ?? [],
    [catalogs.taxonomy, form.subject_id]
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subjectTopics.filter((t) => !form.topic_ids.includes(t.id) && (!q || t.name.toLowerCase().includes(q))).slice(0, 8);
  }, [subjectTopics, form.topic_ids, query]);

  const subjectOptions = [
    ...catalogs.subjects.filter((s) => preferredSubjectIds.includes(s.id)),
    ...catalogs.subjects.filter((s) => !preferredSubjectIds.includes(s.id)),
  ].map((s) => ({ value: String(s.id), label: s.name }));

  const addTopic = (id: number) => {
    onChange({ ...form, topic_ids: [...form.topic_ids, id] });
    setQuery("");
  };

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <SearchableSelect dense showSelectedPreview={false} label="Disciplina" modalTitle="Selecionar disciplina"
            options={subjectOptions} value={form.subject_id ? String(form.subject_id) : ""} disabled={disabled}
            onChange={(v) => onChange(withSubject(form, v ? Number(v) : null, topicSubjectById))} />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text className="text-xs font-medium text-ink-muted mb-1" nativeID="review-difficulty">Dificuldade</Text>
          <View role="group" aria-labelledby="review-difficulty" className="flex-row self-start border border-border-strong rounded-ds-md overflow-hidden">
            {catalogs.difficulties.map((d, i) => {
              const on = form.difficulty_id === d.id;
              return (
                <TouchableOpacity key={d.id} disabled={disabled} aria-pressed={on}
                  onPress={() => onChange({ ...form, difficulty_id: on ? null : d.id })}
                  className={`px-4 justify-center ${on ? "bg-brand" : "bg-surface"}`}
                  style={{ height: 36, borderLeftWidth: i ? 1 : 0, borderLeftColor: color["border-strong"] }}>
                  <Text className={`text-[13px] font-medium ${on ? "text-on-brand" : "text-ink-muted"}`}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View>
        <Text className="text-xs font-medium text-ink-muted mb-1" nativeID="review-topics">Assuntos</Text>
        <View className="flex-row flex-wrap items-center border border-border-strong rounded-ds-md bg-surface px-2 py-1" style={{ gap: 6, minHeight: 38 }}>
          {form.topic_ids.map((id) => (
            <View key={id} className="flex-row items-center bg-brand-tint rounded-ds-sm pl-2 pr-1" style={{ height: 26, gap: 4 }}>
              <Text className="text-[13px] font-medium text-brand">{topicsById.get(id)?.name ?? `#${id}`}</Text>
              <Pressable accessibilityLabel={`Remover ${topicsById.get(id)?.name ?? "assunto"}`} disabled={disabled}
                onPress={() => onChange({ ...form, topic_ids: form.topic_ids.filter((t) => t !== id) })}
                style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
                <X size={12} color={color.brand} />
              </Pressable>
            </View>
          ))}
          <input
            aria-labelledby="review-topics"
            value={query}
            disabled={disabled || !form.subject_id}
            placeholder={!form.subject_id ? "Escolha a disciplina primeiro" : subjectTopics.length ? "Buscar assunto…" : "Disciplina sem assuntos cadastrados"}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) { e.preventDefault(); addTopic(matches[0].id); }
              if (e.key === "Backspace" && !query && form.topic_ids.length) onChange({ ...form, topic_ids: form.topic_ids.slice(0, -1) });
            }}
            style={{ flex: 1, minWidth: 120, border: 0, outline: "none", background: "transparent", font: "400 14px/22px var(--ds-font-sans, sans-serif)", color: "var(--ds-ink)" }}
          />
        </View>
        {focused && matches.length > 0 && (
          <View className="border border-border rounded-ds-md bg-surface mt-1" style={{ maxHeight: 220 }}>
            {matches.map((t) => (
              <Pressable key={t.id} onPress={() => addTopic(t.id)}
                style={hoverStyle(({ hovered }) => ({ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: hovered ? color["surface-sunken"] : "transparent" }))}>
                <Text className="text-sm text-ink">{t.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View>
        <TouchableOpacity onPress={() => setMore((m) => !m)} className="flex-row items-center self-start" style={{ gap: 4 }} aria-expanded={more}>
          {more ? <ChevronDown size={14} color={color["ink-muted"]} /> : <ChevronRight size={14} color={color["ink-muted"]} />}
          <Text className="text-[13px] font-medium text-ink-muted">Mais campos (banca, ano, tags)</Text>
        </TouchableOpacity>
        {more && (
          <View className="mt-3" style={{ gap: 4 }}>
            <SearchableSelect dense showSelectedPreview={false} label="Banca" modalTitle="Selecionar banca" disabled={disabled}
              options={[{ value: "", label: "Nenhuma" }, ...catalogs.boards.map((b) => ({ value: String(b.id), label: b.name }))]}
              value={form.board_id ? String(form.board_id) : ""} onChange={(v) => onChange({ ...form, board_id: v ? Number(v) : null })} />
            <YearPickerInput compact label="Ano" value={form.year ? String(form.year) : ""} minYear={1900} maxYear={new Date().getFullYear()}
              onChange={(v) => onChange({ ...form, year: v ? Number(v) : null })} />
            <TagChipsInput value={form.tags} onChange={(tags) => onChange({ ...form, tags })} suggestions={catalogs.tags.map((t) => t.name)} />
          </View>
        )}
      </View>
    </View>
  );
}
