import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import FormSelect from "../ui/FormSelect";
import SearchableSelect from "../ui/SearchableSelect";
import YearPickerInput from "../ui/YearPickerInput";
import TopicMultiSelect from "./TopicMultiSelect";
import TagChipsInput from "./TagChipsInput";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { useSubjectTopics } from "../../hooks/useQuestionBankCatalogs";
import type { ClassificationPatch } from "../../types/questionBank";

export type BulkAction =
  | "difficulty"
  | "subject"
  | "board"
  | "year"
  | "add_tags"
  | "remove_tags"
  | "annul"
  | "unannul"
  | "outdate"
  | "unoutdate";

const ACTIONS: { value: BulkAction; label: string }[] = [
  { value: "difficulty", label: "Definir dificuldade" },
  { value: "subject", label: "Definir disciplina e assuntos" },
  { value: "board", label: "Definir banca" },
  { value: "year", label: "Definir ano" },
  { value: "add_tags", label: "Adicionar tags" },
  { value: "remove_tags", label: "Remover tags" },
  { value: "annul", label: "Marcar como anuladas" },
  { value: "unannul", label: "Desmarcar anuladas" },
  { value: "outdate", label: "Marcar como desatualizadas" },
  { value: "unoutdate", label: "Desmarcar desatualizadas" },
];

type Props = {
  visible: boolean;
  initialAction?: BulkAction;
  count: number;
  catalogs: QuestionBankCatalogs;
  applying: boolean;
  /** Progresso "x de y" enquanto aplica. */
  progress?: { done: number; total: number } | null;
  onClose: () => void;
  onApply: (patch: ClassificationPatch, description: string) => void;
};

export default function BulkClassifyModal({
  visible,
  initialAction = "difficulty",
  count,
  catalogs,
  applying,
  progress,
  onClose,
  onApply,
}: Props) {
  const [action, setAction] = useState<BulkAction>(initialAction);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [difficultyId, setDifficultyId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [boardId, setBoardId] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const { topics, loading: topicsLoading } = useSubjectTopics(subjectId ? Number(subjectId) : null);

  useEffect(() => {
    if (!visible) return;
    setAction(initialAction);
    setStep("form");
    setDifficultyId("");
    setSubjectId("");
    setTopicIds([]);
    setBoardId("");
    setYear("");
    setTags([]);
  }, [visible, initialAction]);

  const nameOf = (items: { id: number; name: string }[], id: string) =>
    items.find((i) => String(i.id) === id)?.name ?? "";

  /** Patch + descrição legível; null quando falta preencher o valor. */
  const built = useMemo((): { patch: ClassificationPatch; description: string } | null => {
    switch (action) {
      case "difficulty":
        return difficultyId
          ? { patch: { difficulty_id: Number(difficultyId) }, description: `Definir dificuldade "${nameOf(catalogs.difficulties, difficultyId)}"` }
          : null;
      case "subject":
        return subjectId
          ? {
              patch: { subject_id: Number(subjectId), topic_ids: topicIds },
              description: `Definir disciplina "${nameOf(catalogs.subjects, subjectId)}"${topicIds.length ? ` e ${topicIds.length} assunto(s)` : " (sem assuntos)"}`,
            }
          : null;
      case "board":
        return {
          patch: { board_id: boardId ? Number(boardId) : null },
          description: boardId ? `Definir banca "${nameOf(catalogs.boards, boardId)}"` : "Remover a banca",
        };
      case "year":
        return { patch: { year: year ? Number(year) : null }, description: year ? `Definir ano ${year}` : "Remover o ano" };
      case "add_tags":
        return tags.length ? { patch: { add_tags: tags }, description: `Adicionar tags: ${tags.join(", ")}` } : null;
      case "remove_tags":
        return tags.length ? { patch: { remove_tags: tags }, description: `Remover tags: ${tags.join(", ")}` } : null;
      case "annul":
        return { patch: { is_annulled: true }, description: "Marcar como anuladas" };
      case "unannul":
        return { patch: { is_annulled: false }, description: "Desmarcar anuladas" };
      case "outdate":
        return { patch: { is_outdated: true }, description: "Marcar como desatualizadas" };
      case "unoutdate":
        return { patch: { is_outdated: false }, description: "Desmarcar desatualizadas" };
    }
  }, [action, boardId, catalogs, difficultyId, subjectId, tags, topicIds, year]);

  const countLabel = `${count} ${count === 1 ? "questão" : "questões"}`;

  const footer = (
    <View className="flex-row justify-end gap-3">
      <TouchableOpacity
        onPress={step === "confirm" && !applying ? () => setStep("form") : onClose}
        disabled={applying}
        className="px-4 py-2.5 rounded-ds-md border border-border"
      >
        <Text className="text-sm font-semibold text-ink-muted">{step === "confirm" ? "Voltar" : "Cancelar"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => (step === "form" ? setStep("confirm") : built && onApply(built.patch, built.description))}
        disabled={!built || applying}
        className={`px-4 py-2.5 rounded-ds-md flex-row items-center gap-2 ${!built || applying ? "bg-brand-tint" : "bg-brand"}`}
      >
        {applying && <ActivityIndicator size="small" color="#FFFFFF" />}
        <Text className="text-sm font-semibold text-white">
          {step === "form" ? "Continuar" : `Alterar ${countLabel}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} title="Classificar em massa" onClose={applying ? () => {} : onClose} size="md" compact maxHeight="88%" showScrollIndicator footer={footer}>
      {step === "confirm" && built ? (
        <View className="items-center py-4 gap-3">
          <Text className="text-base font-semibold text-ink text-center">
            {built.description} em {countLabel}?
          </Text>
          <Text className="text-xs text-ink-muted text-center">
            Você poderá desfazer logo depois, pelo aviso no rodapé.
          </Text>
          {applying && progress && (
            <Text className="text-xs text-brand" aria-live="polite">
              Aplicando… {progress.done} de {progress.total}
            </Text>
          )}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Text className="text-xs text-ink-muted mb-2">{countLabel} selecionada(s).</Text>
          <FormSelect dense label="Ação" value={action} options={ACTIONS} onChange={(v) => setAction(v as BulkAction)} />

          {action === "difficulty" && (
            <FormSelect
              dense
              label="Dificuldade"
              value={difficultyId}
              placeholder="Selecione"
              options={catalogs.difficulties.map((d) => ({ value: String(d.id), label: d.name }))}
              onChange={setDifficultyId}
            />
          )}

          {action === "subject" && (
            <>
              <SearchableSelect
                dense
                showSelectedPreview={false}
                label="Disciplina"
                modalTitle="Selecionar disciplina"
                options={catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }))}
                value={subjectId}
                onChange={(v) => {
                  setSubjectId(v);
                  setTopicIds([]);
                }}
              />
              <TopicMultiSelect
                topics={topics}
                value={topicIds}
                onChange={setTopicIds}
                disabled={!subjectId}
                loading={topicsLoading}
              />
              <Text className="text-xs text-ink-muted">
                Substitui a disciplina e os assuntos atuais das questões selecionadas.
              </Text>
            </>
          )}

          {action === "board" && (
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Banca"
              modalTitle="Selecionar banca"
              options={[{ value: "", label: "Nenhuma (remover)" }, ...catalogs.boards.map((b) => ({ value: String(b.id), label: b.name }))]}
              value={boardId}
              onChange={setBoardId}
            />
          )}

          {action === "year" && (
            <YearPickerInput compact label="Ano (vazio remove)" value={year} onChange={setYear} minYear={1900} maxYear={new Date().getFullYear()} />
          )}

          {(action === "add_tags" || action === "remove_tags") && (
            <TagChipsInput
              label={action === "add_tags" ? "Tags a adicionar" : "Tags a remover"}
              value={tags}
              onChange={setTags}
              suggestions={catalogs.tags.map((t) => t.name)}
            />
          )}
        </View>
      )}
    </Modal>
  );
}
