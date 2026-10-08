import React, { useRef } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Check, ChevronLeft, ChevronRight, CircleCheck, Crop, ImageIcon, ImageUpscale, Sparkles, Trash2, TriangleAlert, Upload } from "lucide-react-native";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import RichTextInput from "../../ui/RichTextInput";
import ActionsMenu from "../../ui/ActionsMenu";
import ReviewAlternatives from "./ReviewAlternatives";
import ReviewClassification from "./ReviewClassification";
import { color } from "../../../constants/theme";
import type { QuestionBankCatalogs } from "../../../hooks/useQuestionBankCatalogs";
import type { ImportDraftQuestion } from "../../../services/questionImportDrafts";
import { ISSUE_LABEL, type IssueCode } from "../../../utils/importReview";

export type EditorDraft = ImportDraftQuestion & { imageLoadError: boolean; errors: Record<string, string> };

type Props = {
  draft: EditorDraft;
  number: number;
  subjectName: string | null;
  issues: IssueCode[];
  catalogs: QuestionBankCatalogs;
  preferredSubjectIds: number[];
  busy: boolean;
  canPrev: boolean;
  canNext: boolean;
  hasPending: boolean;
  pdfAvailable: boolean;
  /** Aviso acima da questão (ex.: rascunho desatualizado). */
  notice?: React.ReactNode;
  /** Botão "Questões" (telas estreitas, quando a lista fica recolhida). */
  listButton?: React.ReactNode;
  /** Celular: navegação só com ícones e respiro menor. */
  compact?: boolean;
  onChange: (patch: Partial<EditorDraft>) => void;
  onPrev: () => void;
  onNext: () => void;
  onNextPending: () => void;
  onAutofill: () => void;
  /** Dissertativa → objetiva com IA. */
  onConvertToObjective: () => void;
  onRemove: () => void;
  onConfirm: () => void;
  onUploadImage: (file: File) => void;
  onStartCrop: () => void;
  /** A imagem atual veio de um recorte do PDF aberto e pode ser recriada em alta resolução. */
  canEnhanceImage?: boolean;
  enhancingImage?: boolean;
  onEnhanceImage?: () => void;
};

/** Card do editor: título à esquerda, ações à direita, conteúdo com respiro de 16px. */
function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="bg-surface border border-border rounded-ds-md mb-4">
      <View className="flex-row items-center border-b border-border px-4 py-3" style={{ gap: 8 }}>
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        <View className="flex-row items-center ml-auto" style={{ gap: 8 }}>{right}</View>
      </View>
      <View className="p-4">{children}</View>
    </View>
  );
}

/** Editor da questão em revisão: pendências, enunciado, imagem, alternativas, resolução e classificação. */
export default function ReviewQuestionEditor({
  draft, number, subjectName, issues, catalogs, preferredSubjectIds, busy, canPrev, canNext, hasPending, pdfAvailable,
  notice, listButton, compact = false, onChange, onPrev, onNext, onNextPending, onAutofill, onConvertToObjective, onRemove, onConfirm, onUploadImage,
  onStartCrop, canEnhanceImage = false, enhancingImage = false, onEnhanceImage,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const blockers = issues.length > 0;
  const content = draft.content;
  const hasAnswer = content.type === "essay" || content.options.some((o) => o.is_correct);
  const imageMissing = issues.includes("imagem");
  const done = [
    hasAnswer && content.type === "multiple_choice" ? (draft.answerFromPdf ? "Gabarito do PDF" : "Gabarito sugerido pela IA") : null,
    draft.classification.subject_id ? "Disciplina" : null,
    draft.classification.topic_ids.length ? "Assunto" : null,
    draft.needsImage && content.image_url ? "Imagem" : null,
  ].filter(Boolean) as string[];

  const pickImage = (files: FileList | null | undefined) => {
    const selected = files?.[0];
    if (selected) onUploadImage(selected);
  };

  return (
    <View className="flex-1" style={{ minHeight: 0 }}>
      <View className="flex-row flex-wrap items-center bg-surface border-b border-border py-3" style={{ gap: 12, paddingHorizontal: compact ? 16 : 24 }}>
        {listButton}
        <Text className="text-lg font-semibold text-ink">Questão {number}</Text>
        <Text className="text-[13px] text-ink-muted">
          {subjectName ?? "Sem disciplina"}{draft.sourcePage ? ` · página ${draft.sourcePage} do PDF` : ""}
        </Text>
        <View className="flex-row flex-wrap items-center ml-auto" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" icon={ChevronLeft} iconOnly={compact} label="Anterior" disabled={!canPrev} onPress={onPrev} />
          <Button size="sm" variant="ghost" icon={ChevronRight} iconOnly={compact} label="Próxima" disabled={!canNext} onPress={onNext} />
          <Button size="sm" label={compact ? "Pendente" : "Próxima pendente"} accessibilityLabel="Próxima pendente" disabled={!hasPending} onPress={onNextPending} />
          <ActionsMenu label="Mais ações (completar com IA, remover da importação)" items={[
            { key: "ai", label: "Completar com IA", icon: Sparkles, onPress: onAutofill, disabled: busy },
            { key: "remove", label: "Remover da importação", icon: Trash2, onPress: onRemove, danger: true, separatorBefore: true, disabled: busy },
          ]} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: compact ? 12 : 24, paddingTop: compact ? 12 : 20, paddingBottom: 32 }}>
        {notice}
        <View role="status" className="flex-row items-start bg-surface border border-border rounded-ds-md px-4 py-3 mb-4"
          style={{ gap: 12, overflow: "hidden", position: "relative" }}>
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: blockers ? color.warning : color.success }} />
          <View style={{ marginTop: 2 }}>
            {blockers ? <TriangleAlert size={18} color={color.warning} /> : <CircleCheck size={18} color={color.success} />}
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">
              {blockers
                ? `${issues.length} ${issues.length > 1 ? "pendências" : "pendência"} antes de confirmar`
                : "Tudo preenchido — confira e confirme"}
            </Text>
            <View className="flex-row flex-wrap mt-1" style={{ columnGap: 16, rowGap: 4 }}>
              {issues.map((code) => (
                <View key={code} className="flex-row items-center" style={{ gap: 6 }}>
                  <View style={{ width: 6, height: 6, backgroundColor: color.warning }} />
                  <Text className="text-[13px] text-ink-muted">{ISSUE_LABEL[code]}</Text>
                </View>
              ))}
              {done.map((label) => (
                <View key={label} className="flex-row items-center" style={{ gap: 6 }}>
                  <Check size={14} color={color.success} strokeWidth={2} />
                  <Text className="text-[13px] text-ink-subtle">{label}</Text>
                </View>
              ))}
            </View>
            {Object.values(draft.errors).map((message, i) => <Text key={i} className="text-xs text-danger mt-1">{message}</Text>)}
          </View>
          {imageMissing && pdfAvailable && (
            <Button size="sm" variant="primary" icon={Crop} label="Recortar do PDF" disabled={busy} onPress={onStartCrop} />
          )}
        </View>

        <Card title="Enunciado" right={<Button size="sm" variant="ghost" icon={Sparkles} label="Completar com IA" disabled={busy} onPress={onAutofill} />}>
          <RichTextInput value={content.question_text} minHeight={96} disabled={busy}
            onChange={(question_text) => onChange({ content: { ...content, question_text } })} />
        </Card>

        <Card title="Imagem" right={imageMissing
          ? <Badge tone="warning" dot label="Obrigatória" />
          : content.image_url ? <Badge tone="success" dot label="Anexada" /> : null}>
          {content.image_url ? (
            <View className="flex-row flex-wrap items-center" style={{ gap: 16 }}>
              <Image source={{ uri: content.image_url }} accessibilityLabel={`Imagem da questão ${number}`} resizeMode="contain"
                style={{ width: 220, height: 120, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface }}
                onError={() => onChange({ imageLoadError: true })} />
              <View>
                <Text className="text-sm font-medium text-ink">Imagem anexada</Text>
                {draft.imageLoadError && <Text className="text-xs text-danger">Não foi possível carregar. Envie novamente.</Text>}
                <View className="flex-row mt-2" style={{ gap: 12 }}>
                  {pdfAvailable && (
                    <TouchableOpacity onPress={onStartCrop} disabled={busy}><Text className="text-[13px] font-medium text-brand">Recortar de novo</Text></TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => fileRef.current?.click()} disabled={busy}><Text className="text-[13px] font-medium text-brand">Trocar arquivo</Text></TouchableOpacity>
                  <TouchableOpacity disabled={busy}
                    onPress={() => onChange({ content: { ...content, image_url: "" }, imageLoadError: false, errors: {} })}>
                    <Text className="text-[13px] font-medium text-danger">Remover</Text>
                  </TouchableOpacity>
                </View>
                {canEnhanceImage && onEnhanceImage && (
                  <View className="flex-row mt-3">
                    <Button size="sm" icon={ImageUpscale} label="Melhorar a qualidade da imagem" loading={enhancingImage}
                      disabled={busy} onPress={onEnhanceImage} />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <div
              tabIndex={0}
              role="button"
              aria-label="Área da imagem: cole (Ctrl+V ou ⌘V) ou arraste uma imagem"
              onPaste={(event) => {
                const item = Array.from(event.clipboardData.items).find((i) => i.kind === "file" && i.type.startsWith("image/"));
                const pasted = item?.getAsFile();
                if (pasted) { event.preventDefault(); onUploadImage(pasted); }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); pickImage(event.dataTransfer.files); }}
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: 16, outline: "none",
                border: `1px dashed ${color["border-strong"]}`, borderRadius: 4, background: color["surface-sunken"],
              }}
            >
              <ImageIcon size={24} color={color["ink-subtle"]} />
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text className="text-sm font-medium text-ink">Arraste, cole (⌘V) ou recorte do PDF</Text>
                <Text className="text-xs text-ink-subtle">
                  JPG, PNG, WEBP ou GIF até 5 MB.{draft.needsImage ? " A IA identificou que esta questão depende de imagem." : ""}
                </Text>
              </View>
              <View className="flex-row" style={{ gap: 8 }}>
                {pdfAvailable && <Button size="sm" icon={Crop} label="Recortar do PDF" disabled={busy} onPress={onStartCrop} />}
                <Button size="sm" variant="ghost" icon={Upload} label="Enviar arquivo" disabled={busy} onPress={() => fileRef.current?.click()} />
              </View>
            </div>
          )}
          {!content.image_url && (
            <Text className="text-xs text-ink-subtle mt-2">
              {draft.needsImage ? "Não precisa de imagem? " : "Esta questão depende de uma figura? "}
              <Text className="text-[13px] font-medium text-brand" onPress={() => onChange({ needsImage: !draft.needsImage, errors: {} })}>
                {draft.needsImage ? "Dispensar imagem nesta questão" : "Marcar imagem como obrigatória"}
              </Text>
            </Text>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }}
            aria-label="Arquivo de imagem da questão"
            onChange={(event) => { pickImage(event.target.files); event.target.value = ""; }} />
        </Card>

        {content.type === "multiple_choice" ? (
          <Card title="Alternativas" right={<Text className="text-xs text-ink-subtle">Clique para marcar a correta</Text>}>
            <ReviewAlternatives options={content.options} answerFromPdf={draft.answerFromPdf} disabled={busy}
              onChange={(options) => onChange({ content: { ...content, options }, answerFromPdf: draft.answerFromPdf })} />
          </Card>
        ) : (
          <Card title="Alternativas" right={<Button size="sm" variant="ghost" icon={Sparkles} label="Transformar em objetiva com IA"
            disabled={busy} onPress={onConvertToObjective} />}>
            <Text className="text-sm text-ink-muted">
              Questão dissertativa: sem alternativas. A resposta esperada fica na resolução; a IA a usa para definir a alternativa correta.
            </Text>
          </Card>
        )}

        <Card title="Resolução" right={content.explanation.trim() && !draft.reviewed
          ? <Badge tone="neutral" label="Gerada pela IA · revise" /> : null}>
          <RichTextInput value={content.explanation} minHeight={72} disabled={busy}
            onChange={(explanation) => onChange({ content: { ...content, explanation } })} />
        </Card>

        <Card title="Classificação">
          <ReviewClassification form={draft.classification} catalogs={catalogs} preferredSubjectIds={preferredSubjectIds} disabled={busy}
            onChange={(classification) => onChange({ classification })} />
        </Card>
      </ScrollView>

      <View className="flex-row flex-wrap items-center bg-surface border-t border-border py-3" style={{ gap: 12, paddingHorizontal: compact ? 16 : 24 }}>
        <Text className="text-xs text-ink-subtle flex-1" style={{ minWidth: 200 }}>
          {blockers ? "Resolva as pendências para confirmar esta questão." : "Ao confirmar, você vai para a próxima questão a revisar."}
        </Text>
        {draft.reviewed && !blockers ? (
          <Badge tone="success" dot label="Questão revisada" />
        ) : (
          <Button variant="primary" icon={Check} label={`Confirmar questão ${number}`} disabled={blockers || busy} onPress={onConfirm} />
        )}
      </View>
    </View>
  );
}
