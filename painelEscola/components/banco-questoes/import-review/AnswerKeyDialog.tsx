import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import OverlayPortal from "../../ui/OverlayPortal";
import DialogPanel from "../../ui/DialogPanel";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import { extractPdfPages, gabaritoSlice, matchAnswerKey, parseAnswerKey, type AnswerKeyTarget } from "../../../utils/pdfQuestionImport";

type Props = {
  visible: boolean;
  pdfFile: File | null;
  /** Texto já extraído nesta importação, quando o PDF ainda está na memória. */
  pdfText: string;
  targets: AnswerKeyTarget[];
  onCancel: () => void;
  onApply: (indexes: number[]) => void;
};

/** Cola o gabarito (ou lê a página do PDF) e devolve o índice da alternativa de cada questão. */
export default function AnswerKeyDialog({ visible, pdfFile, pdfText, targets, onCancel, onApply }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const fromPdf = gabaritoSlice(pdfText);
    setText(fromPdf);
    setMessage(fromPdf
      ? "O gabarito do PDF já está no campo. Confira e preencha as respostas."
      : "Cole o gabarito da prova. Uma matéria por bloco, no formato 1.B ou 1-B.");
    setReading(false);
  }, [visible, pdfText]);

  const apply = (source: string) => {
    const sections = parseAnswerKey(source);
    const indexes = matchAnswerKey(targets, sections);
    const marked = indexes.filter((index) => index >= 0).length;
    if (!marked) {
      setMessage("Nenhuma resposta encontrada. Use linhas como 1.B ou 1-B, com o nome da matéria antes.");
      return;
    }
    const pending = targets.filter((target, index) => target.type !== "essay" && target.optionCount >= 2 && indexes[index] < 0).length;
    onApply(indexes);
    setMessage(pending
      ? `${marked} respostas marcadas. ${pending} ${pending === 1 ? "questão ficou" : "questões ficaram"} sem gabarito.`
      : `${marked} respostas marcadas.`);
  };

  const readPdf = async () => {
    if (!pdfFile) {
      setMessage("Anexe o PDF de novo ou cole o gabarito no campo.");
      return;
    }
    setReading(true);
    try {
      const pages = await extractPdfPages(pdfFile);
      const slice = gabaritoSlice(pages.join("\n"));
      if (!slice) {
        setMessage("Não encontrei a palavra Gabarito no PDF. Cole o texto no campo.");
        return;
      }
      setText(slice);
      setMessage("Gabarito encontrado no PDF. Confira e preencha as respostas.");
    } catch {
      setMessage("Não foi possível ler o PDF. Cole o gabarito no campo.");
    } finally {
      setReading(false);
    }
  };

  return (
    <OverlayPortal open={visible} onClose={reading ? () => {} : onCancel} contentPadding={16}>
      <DialogPanel title="Importar gabarito" maxWidth={560}
        footer={
          <>
            <Button label="Fechar" onPress={onCancel} disabled={reading} />
            {pdfFile && !gabaritoSlice(pdfText) && (
              <Button label="Ler do PDF" onPress={() => void readPdf()} loading={reading} />
            )}
            <Button variant="primary" label="Preencher respostas" disabled={!text.trim() || reading} onPress={() => apply(text)} />
          </>
        }>
        <Text className="text-[13px] text-ink-muted">
          Cole a folha de respostas. A letra A é a primeira alternativa, na ordem do PDF. Exemplo: Português, 1.B, 2.D e, em seguida, Matemática, 1-B, 2-A.
        </Text>
        <FormInput
          label="Gabarito"
          multiline
          value={text}
          onChangeText={setText}
          placeholder={"Português\n1.B\n2.D\n\nMatemática\n1-B\n2-A"}
          style={{ minHeight: 180, textAlignVertical: "top", paddingTop: 10 }}
        />
        {!!message && <Text className="text-[13px] text-ink">{message}</Text>}
      </DialogPanel>
    </OverlayPortal>
  );
}
