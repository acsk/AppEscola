import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import OverlayPortal from "../../ui/OverlayPortal";
import DialogPanel from "../../ui/DialogPanel";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import SearchableSelect from "../../ui/SearchableSelect";
import type { QuestionBankCatalogs } from "../../../hooks/useQuestionBankCatalogs";
import { generateQuestionSet, type QuestionSet } from "../../../services/questionSets";
import { type ApiToastState, showApiErrorToast, showApiToast } from "../../../utils/apiErrors";

const MAX_QUANTITY = 100;

type Props = {
  visible: boolean;
  catalogs: QuestionBankCatalogs;
  onCancel: () => void;
  onGenerated: (set: QuestionSet) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

const ids = (value: string) => (value ? [Number(value)] : undefined);

/** Gera um simulado (rascunho) sorteando questões avulsas prontas para o aluno pelos filtros escolhidos. */
export default function GenerateQuestionSetDialog({ visible, catalogs, onCancel, onGenerated, setToast }: Props) {
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficultyId, setDifficultyId] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setQuantity("10");
    setSubjectId("");
    setTopicId("");
    setDifficultyId("");
    setExamTypeId("");
  }, [visible]);

  const topics = catalogs.taxonomy.find((s) => String(s.id) === subjectId)?.topics ?? [];
  const amount = Number(quantity);
  const quantityError = quantity && (!Number.isInteger(amount) || amount < 1 || amount > MAX_QUANTITY)
    ? `Informe de 1 a ${MAX_QUANTITY}.` : undefined;
  const invalid = !title.trim() || !quantity || !!quantityError;

  const submit = async () => {
    if (invalid) return;
    setLoading(true);
    try {
      const response = await generateQuestionSet({
        title: title.trim(), quantity: amount, subject_ids: ids(subjectId), topic_ids: ids(topicId),
        difficulty_ids: ids(difficultyId), exam_type_ids: ids(examTypeId),
      });
      showApiToast(setToast, response, "Simulado gerado.");
      onGenerated(response.body);
    } catch (cause) {
      showApiErrorToast(setToast, cause, "Não foi possível gerar o simulado.");
    } finally {
      setLoading(false);
    }
  };

  const all = (label: string) => ({ value: "", label });

  return (
    <OverlayPortal open={visible} onClose={loading ? () => {} : onCancel} contentPadding={16}>
      <DialogPanel title="Gerar simulado automaticamente" maxWidth={560}
        footer={
          <>
            <Button label="Cancelar" onPress={onCancel} disabled={loading} />
            <Button variant="primary" label="Gerar simulado" loading={loading} disabled={invalid} onPress={() => void submit()} />
          </>
        }>
        <Text className="text-[13px] text-ink-muted">
          Sorteia questões avulsas que o aluno pode responder (objetivas, com gabarito). O simulado nasce como rascunho
          para você revisar antes de publicar.
        </Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flex: 3, minWidth: 220 }}>
              <FormInput label="Título" required value={title} onChangeText={setTitle} maxLength={255} placeholder="Ex.: Revisão de Português" />
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <FormInput label="Quantidade" required value={quantity} onChangeText={setQuantity} valueFormat="integer" maxDigits={3}
                error={quantityError} />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <SearchableSelect label="Disciplina" modalTitle="Disciplina" placeholder="Todas" showSelectedPreview={false}
                value={subjectId} onChange={(v) => { setSubjectId(v); setTopicId(""); }}
                options={[all("Todas"), ...catalogs.taxonomy.map((s) => ({ value: String(s.id), label: s.name }))]} />
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <SearchableSelect label="Assunto" modalTitle="Assunto" placeholder={subjectId ? "Todos" : "Escolha a disciplina"}
                disabled={!subjectId} showSelectedPreview={false} value={topicId} onChange={setTopicId}
                options={[all("Todos"), ...topics.map((t) => ({ value: String(t.id), label: t.name }))]} />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <SearchableSelect label="Dificuldade" modalTitle="Dificuldade" placeholder="Todas" showSelectedPreview={false}
                value={difficultyId} onChange={setDifficultyId}
                options={[all("Todas"), ...catalogs.difficulties.map((d) => ({ value: String(d.id), label: d.name }))]} />
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <SearchableSelect label="Modalidade" modalTitle="Modalidade" placeholder="Todas" showSelectedPreview={false}
                value={examTypeId} onChange={setExamTypeId}
                options={[all("Todas"), ...catalogs.examTypes.map((t) => ({ value: String(t.id), label: t.label }))]} />
            </View>
          </View>
        </View>
      </DialogPanel>
    </OverlayPortal>
  );
}
