import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import OverlayPortal from "../../ui/OverlayPortal";
import DialogPanel from "../../ui/DialogPanel";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import SearchableSelect, { type SearchableOption } from "../../ui/SearchableSelect";
import { color } from "../../../constants/theme";
import { addQuestionsToSet, createQuestionSet, fetchQuestionSets, type QuestionSet } from "../../../services/questionSets";
import { type ApiToastState, showApiErrorToast, showApiToast } from "../../../utils/apiErrors";

/** Mesmo limite do backend por requisição. */
const MAX_QUESTIONS = 200;

type Props = {
  visible: boolean;
  /** Só avulsas: as de simulado oficial já foram separadas (`blockedCount`). */
  questionIds: number[];
  blockedCount?: number;
  onCancel: () => void;
  /** Questões adicionadas: abre o simulado para revisar/publicar. */
  onDone: (set: QuestionSet) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

const toOption = (set: QuestionSet): SearchableOption => ({
  value: String(set.id),
  label: set.title,
  sublabel: `${set.status === "published" ? "Publicado" : "Rascunho"} · ${set.questions_count} questão(ões)`,
});

function Choice({ on, title, onPress }: { on: boolean; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} role="radio" aria-checked={on}
      style={{
        flex: 1, minWidth: 180, flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 4,
        borderWidth: on ? 2 : 1, borderColor: on ? color.brand : color["border-strong"], margin: on ? 0 : 1,
      }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: on ? 5 : 1.5, borderColor: on ? color.brand : color["border-strong"] }} />
      <Text className="text-sm font-medium text-ink">{title}</Text>
    </Pressable>
  );
}

/** Monta um simulado do banco com as questões selecionadas (novo ou acrescentando a um existente). */
export default function AddToQuestionSetDialog({ visible, questionIds, blockedCount = 0, onCancel, onDone, setToast }: Props) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState("");
  const [setId, setSetId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode("new");
    setTitle("");
    setSetId("");
  }, [visible]);

  const search = useCallback(
    async (query: string) => (await fetchQuestionSets({ search: query || undefined, per_page: 50 })).data.map(toOption),
    []
  );

  const tooMany = questionIds.length > MAX_QUESTIONS;
  const invalid = tooMany || questionIds.length === 0 || (mode === "new" ? !title.trim() : !setId);

  const submit = async () => {
    if (invalid) return;
    setLoading(true);
    try {
      const response = mode === "new"
        ? await createQuestionSet({ title: title.trim(), question_ids: questionIds })
        : await addQuestionsToSet(Number(setId), questionIds);
      showApiToast(setToast, response, "Questões adicionadas ao simulado.");
      onDone(response.body);
    } catch (cause) {
      showApiErrorToast(setToast, cause, "Não foi possível adicionar as questões ao simulado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OverlayPortal open={visible} onClose={loading ? () => {} : onCancel} contentPadding={16}>
      <DialogPanel title="Adicionar a simulado do banco" maxWidth={520}
        footer={
          <>
            <Button label="Cancelar" onPress={onCancel} disabled={loading} />
            <Button variant="primary" loading={loading} disabled={invalid}
              label={mode === "new" ? "Criar simulado" : "Adicionar questões"} onPress={() => void submit()} />
          </>
        }>
        <Text className="text-[13px] text-ink-muted">
          {questionIds.length} questão(ões) avulsa(s) selecionada(s). As questões continuam no banco e o simulado fica em
          rascunho até você publicar.
        </Text>
        {blockedCount > 0 && (
          <Text className="text-xs text-warning mt-2">
            {blockedCount} questão(ões) selecionada(s) pertence(m) a simulado oficial e ficou(aram) de fora: só questões avulsas
            entram em simulados do banco.
          </Text>
        )}
        {tooMany && (
          <Text className="text-xs text-danger mt-2">Selecione no máximo {MAX_QUESTIONS} questões por vez.</Text>
        )}
        <View style={{ gap: 12, marginTop: 12 }}>
          <View role="radiogroup" aria-label="Destino das questões" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Choice on={mode === "new"} title="Novo simulado" onPress={() => setMode("new")} />
            <Choice on={mode === "existing"} title="Simulado existente" onPress={() => setMode("existing")} />
          </View>
          {mode === "new" ? (
            <FormInput label="Título do simulado" required value={title} onChangeText={setTitle} maxLength={255} />
          ) : (
            <SearchableSelect label="Simulado" required modalTitle="Escolher simulado do banco" placeholder="Selecione…"
              value={setId} onChange={setSetId} options={[]} onSearch={search} />
          )}
        </View>
      </DialogPanel>
    </OverlayPortal>
  );
}
