import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SlidersHorizontal, X } from "lucide-react-native";
import FormSelect from "../ui/FormSelect";
import SearchableSelect from "../ui/SearchableSelect";
import DatePickerInput from "../ui/DatePickerInput";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { fmtDate } from "./format";
import type { BiFilters, BiMeta } from "../../services/biService";

export type PeriodPreset = "30d" | "90d" | "semester" | "year" | "custom";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "90d", label: "Últimos 90 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "semester", label: "Semestre atual" },
  { value: "year", label: "Ano letivo atual" },
  { value: "custom", label: "Personalizado" },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Datas de um período pronto, terminando hoje. */
export function presetRange(preset: Exclude<PeriodPreset, "custom">): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  if (preset === "30d") from.setDate(today.getDate() - 29);
  if (preset === "90d") from.setDate(today.getDate() - 89);
  if (preset === "semester") from.setMonth(today.getMonth() < 6 ? 0 : 6, 1);
  if (preset === "year") from.setMonth(0, 1);
  return { from: ymd(from), to: ymd(today) };
}

const toBr = (v?: string) => (v ? fmtDate(v) : "");
const fromBr = (v: string) => {
  const [d, m, y] = v.split("/");
  return d && m && y?.length === 4 ? `${y}-${m}-${d}` : "";
};

type Props = {
  meta: BiMeta | null;
  filters: BiFilters;
  preset: PeriodPreset;
  onChange: (filters: BiFilters, preset: PeriodPreset) => void;
};

/**
 * Filtros globais do BI: período, curso, turma, disciplina e concurso à vista; ano letivo, professor,
 * modalidade e datas em "Mais filtros". As opções já vêm recortadas pelo escopo do usuário (/bi/meta).
 */
export default function BiFilterBar({ meta, filters, preset, onChange }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState<BiFilters>(filters);
  const options = meta?.filter_options;

  const set = (patch: Partial<BiFilters>, nextPreset: PeriodPreset = preset) => onChange({ ...filters, ...patch }, nextPreset);
  const idOrNull = (v: string) => (v ? Number(v) : null);

  const classOptions = useMemo(
    () =>
      (options?.school_classes ?? [])
        .filter((c) => !filters.course_id || c.course_id === filters.course_id)
        .map((c) => ({ value: String(c.id), label: c.name, sublabel: c.year ? String(c.year) : undefined })),
    [options, filters.course_id]
  );

  const name = (list: { id: number; name?: string; label?: string }[] | undefined, id?: number | null) =>
    list?.find((i) => i.id === id)?.name ?? list?.find((i) => i.id === id)?.label ?? "";

  const chips: { key: keyof BiFilters; label: string }[] = [];
  if (filters.course_id) chips.push({ key: "course_id", label: `Curso: ${name(options?.courses, filters.course_id)}` });
  if (filters.school_class_id) chips.push({ key: "school_class_id", label: `Turma: ${name(options?.school_classes, filters.school_class_id)}` });
  if (filters.subject_id) chips.push({ key: "subject_id", label: `Disciplina: ${name(options?.subjects, filters.subject_id)}` });
  if (filters.exam_type_id) chips.push({ key: "exam_type_id", label: `Concurso: ${name(options?.exam_types, filters.exam_type_id)}` });
  if (filters.school_year) chips.push({ key: "school_year", label: `Ano letivo: ${filters.school_year}` });
  if (filters.teacher_id) chips.push({ key: "teacher_id", label: `Professor: ${name(options?.teachers, filters.teacher_id)}` });
  if (filters.modality) chips.push({ key: "modality", label: filters.modality === "online" ? "Só online" : "Só presencial" });
  const moreCount = [filters.school_year, filters.teacher_id, filters.modality].filter(Boolean).length;

  const field = { width: isMobile ? "100%" : 184 } as const;

  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16 }} aria-label="Filtros globais">
      <View className="flex-row flex-wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <View style={field}>
          <FormSelect
            dense
            label="Período"
            value={preset}
            options={PRESETS}
            onChange={(v) => {
              if (v === "custom") {
                setDraft(filters);
                setMoreOpen(true);
                return;
              }
              set(presetRange(v as Exclude<PeriodPreset, "custom">), v as PeriodPreset);
            }}
          />
        </View>
        <View style={field}>
          <SearchableSelect
            label="Curso"
            placeholder="Todos os cursos"
            value={filters.course_id ? String(filters.course_id) : ""}
            options={[{ value: "", label: "Todos os cursos" }, ...(options?.courses ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
            onChange={(v) => set({ course_id: idOrNull(v), school_class_id: null })}
          />
        </View>
        <View style={field}>
          <SearchableSelect
            label="Turma"
            placeholder="Todas as turmas"
            value={filters.school_class_id ? String(filters.school_class_id) : ""}
            options={[{ value: "", label: "Todas as turmas" }, ...classOptions]}
            onChange={(v) => set({ school_class_id: idOrNull(v) })}
          />
        </View>
        <View style={field}>
          <SearchableSelect
            label="Disciplina"
            placeholder="Todas"
            value={filters.subject_id ? String(filters.subject_id) : ""}
            options={[{ value: "", label: "Todas" }, ...(options?.subjects ?? []).map((s) => ({ value: String(s.id), label: s.name }))]}
            onChange={(v) => set({ subject_id: idOrNull(v) })}
          />
        </View>
        <View style={field}>
          <SearchableSelect
            label="Concurso"
            placeholder="Todos"
            value={filters.exam_type_id ? String(filters.exam_type_id) : ""}
            options={[{ value: "", label: "Todos" }, ...(options?.exam_types ?? []).map((t) => ({ value: String(t.id), label: t.label }))]}
            onChange={(v) => set({ exam_type_id: idOrNull(v) })}
          />
        </View>
        <View style={{ flexGrow: 1 }} />
        <View style={{ marginBottom: 8 }}>
          <Button
            icon={SlidersHorizontal}
            label={moreCount ? `Mais filtros (${moreCount})` : "Mais filtros"}
            onPress={() => {
              setDraft(filters);
              setMoreOpen(true);
            }}
          />
        </View>
      </View>

      <View
        className="flex-row flex-wrap items-center border-t border-border"
        style={{ gap: 6, marginTop: 8, paddingTop: 12 }}
      >
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
          {`Período: ${toBr(filters.from)} a ${toBr(filters.to)}`}
        </Text>
        {chips.map((chip) => (
          <View
            key={chip.key}
            className="flex-row items-center bg-surface-sunken border border-border rounded-ds-sm"
            style={{ height: 24, paddingLeft: 8, paddingRight: 4, gap: 6 }}
          >
            <Text className="font-medium text-ink" style={{ fontSize: 12 }}>
              {chip.label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remover filtro ${chip.label}`} onPress={() => set({ [chip.key]: null })}>
              <Icon icon={X} size={16} color={color["ink-subtle"]} />
            </Pressable>
          </View>
        ))}
        {chips.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onChange(
                { from: filters.from, to: filters.to, course_id: null, school_class_id: null, subject_id: null, exam_type_id: null, school_year: null, teacher_id: null, modality: null },
                preset
              )
            }
          >
            <Text className="font-medium text-brand" style={{ fontSize: 12, textDecorationLine: "underline" }}>
              Limpar
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={moreOpen}
        title="Mais filtros"
        size="md"
        compact
        onClose={() => setMoreOpen(false)}
        footer={
          <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <Button label="Cancelar" onPress={() => setMoreOpen(false)} />
            <Button
              variant="primary"
              label="Aplicar filtros"
              disabled={!draft.from || !draft.to || (draft.from ?? "") > (draft.to ?? "")}
              onPress={() => {
                const custom = draft.from !== filters.from || draft.to !== filters.to;
                onChange(draft, custom ? "custom" : preset);
                setMoreOpen(false);
              }}
            />
          </View>
        }
      >
        <View style={{ gap: 4 }}>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <DatePickerInput label="De" value={toBr(draft.from)} onChangeText={(v) => setDraft((d) => ({ ...d, from: fromBr(v) || d.from }))} />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <DatePickerInput label="Até" value={toBr(draft.to)} onChangeText={(v) => setDraft((d) => ({ ...d, to: fromBr(v) || d.to }))} />
            </View>
          </View>
          {(draft.from ?? "") > (draft.to ?? "") ? (
            <Text className="text-danger" style={{ fontSize: 12 }}>
              A data final deve ser igual ou posterior à inicial.
            </Text>
          ) : null}
          <FormSelect
            label="Ano letivo"
            value={draft.school_year ? String(draft.school_year) : ""}
            options={[{ value: "", label: "Todos" }, ...(options?.school_years ?? []).map((y) => ({ value: String(y), label: String(y) }))]}
            onChange={(v) => setDraft((d) => ({ ...d, school_year: v ? Number(v) : null }))}
          />
          {meta?.scope.tenant_wide ? (
            <SearchableSelect
              label="Professor"
              placeholder="Todos"
              value={draft.teacher_id ? String(draft.teacher_id) : ""}
              options={[{ value: "", label: "Todos" }, ...(options?.teachers ?? []).map((t) => ({ value: String(t.id), label: t.name }))]}
              onChange={(v) => setDraft((d) => ({ ...d, teacher_id: v ? Number(v) : null }))}
            />
          ) : null}
          <FormSelect
            label="Modalidade das avaliações"
            value={draft.modality ?? ""}
            options={[{ value: "", label: "Online e presencial" }, ...(options?.modalities ?? [])]}
            onChange={(v) => setDraft((d) => ({ ...d, modality: (v || null) as BiFilters["modality"] }))}
          />
        </View>
      </Modal>
    </View>
  );
}
