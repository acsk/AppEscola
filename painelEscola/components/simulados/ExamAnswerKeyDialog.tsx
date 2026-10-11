import React, { useState } from "react";
import { Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import Badge from "../ui/Badge";
import ConfirmModal from "../ui/ConfirmModal";
import api from "../../services/api";
import { getApiErrorMessage, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { conferenceExamAnswerKey, type AnswerKeyConference, type ExamKeyQuestion } from "../../utils/examAnswerKey";

type Props = {
  visible: boolean;
  examId: number;
  questions: ExamKeyQuestion[];
  onClose: () => void;
  onApplied: () => void;
  setToast: (toast: ApiToastState) => void;
};

const STATUS = {
  ok: { label: "Certa", tone: "success" as const },
  diff: { label: "Divergente", tone: "danger" as const },
  missing: { label: "Sem gabarito", tone: "warning" as const },
  skip: { label: "Discursiva", tone: "neutral" as const },
};

/** Cola o gabarito, confere com as alternativas do simulado e corrige as divergências. */
export default function ExamAnswerKeyDialog({ visible, examId, questions, onClose, onApplied, setToast }: Props) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<AnswerKeyConference[] | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);

  const close = () => {
    if (applying) return;
    setText("");
    setRows(null);
    setNotice("");
    setConfirm(false);
    onClose();
  };

  const review = () => {
    const next = conferenceExamAnswerKey(questions, text);
    const comparable = next.filter((row) => row.status !== "skip");
    const found = next.filter((row) => row.status === "ok" || row.status === "diff").length;
    if (!found) {
      setRows(null);
      setNotice("Nenhuma resposta encontrada. Use linhas como 1.B ou 1-B, com o nome da matéria antes.");
      return;
    }
    setRows(next);
    const diffs = next.filter((row) => row.status === "diff").length;
    const ok = next.filter((row) => row.status === "ok").length;
    const missing = comparable.length - found;
    setNotice(`${ok} certas, ${diffs} divergentes${missing ? `, ${missing} sem gabarito` : ""}.`);
  };

  const diffs = rows?.filter((row) => row.status === "diff") ?? [];

  const apply = async () => {
    setApplying(true);
    try {
      const response = await api.post(`/exams/${examId}/answer-key`, {
        corrections: diffs.map((row) => ({ question_id: row.questionId, option_index: row.optionIndex })),
      });
      showApiToast(setToast, response.data, "Gabarito aplicado.");
      setConfirm(false);
      close();
      onApplied();
    } catch (cause) {
      setNotice(getApiErrorMessage(cause, "Não foi possível corrigir o gabarito."));
      setConfirm(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Modal visible={visible} title="Importar gabarito" onClose={close} size="lg"
        footer={
          <>
            <Button label="Fechar" onPress={close} disabled={applying} />
            <Button label="Conferir" onPress={review} disabled={!text.trim() || applying} />
            <Button variant="primary" label="Corrigir divergências" disabled={!diffs.length || applying} loading={applying} onPress={() => setConfirm(true)} />
          </>
        }>
        <Text className="text-[13px] text-ink-muted">
          Cole a folha de respostas. A numeração é a de cada matéria, por exemplo Português 1.B e Matemática 1-C. A letra A é a primeira alternativa da questão.
        </Text>
        <FormInput
          label="Gabarito"
          multiline
          value={text}
          onChangeText={(value) => { setText(value); setRows(null); }}
          placeholder={"Português\n1.B\n2.D\n\nMatemática\n1-C\n2-A"}
          style={{ minHeight: 140, textAlignVertical: "top", paddingTop: 10 }}
        />
        {!!notice && <Text className="text-[13px] text-ink mb-3">{notice}</Text>}
        {rows && (
          <View style={{ gap: 8 }}>
            {rows.filter((row) => row.status !== "skip").map((row) => (
              <View key={row.questionId} className="flex-row flex-wrap items-center border border-border rounded-ds-md px-3 py-2" style={{ gap: 8 }}>
                <Text className="font-mono text-[13px] font-medium text-ink" style={{ width: 36 }}>{row.number.padStart(2, "0")}</Text>
                <Text className="text-[13px] text-ink flex-1" numberOfLines={1}>{row.subjectName ?? "Sem disciplina"}</Text>
                <Text className="text-[13px] text-ink-muted">Marcada {row.current ?? "—"}</Text>
                <Text className="text-[13px] text-ink-muted">Gabarito {row.imported ?? "—"}</Text>
                <Badge tone={STATUS[row.status].tone} dot label={STATUS[row.status].label} />
              </View>
            ))}
          </View>
        )}
      </Modal>
      <ConfirmModal
        visible={confirm}
        tone="primary"
        title="Corrigir as divergências?"
        message={`${diffs.length} ${diffs.length === 1 ? "questão terá" : "questões terão"} a alternativa correta trocada pela do gabarito. Provas já corrigidas desses itens serão recalculadas.`}
        confirmLabel="Corrigir"
        loading={applying}
        onCancel={() => { if (!applying) setConfirm(false); }}
        onConfirm={() => void apply()}
      />
    </>
  );
}
