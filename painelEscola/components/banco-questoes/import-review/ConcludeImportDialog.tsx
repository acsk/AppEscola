import React, { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import OverlayPortal from "../../ui/OverlayPortal";
import DialogPanel from "../../ui/DialogPanel";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import SearchableSelect from "../../ui/SearchableSelect";
import ExamTypeLogo from "../../ui/ExamTypeLogo";
import { color } from "../../../constants/theme";
import type { ExamTypeSummary } from "../../../types/questionBank";

export type ConcludeChoice = {
  scope: "reviewed" | "ready";
  createExam: boolean;
  examTitle: string;
  examTypeSlug: string;
};

type Props = {
  visible: boolean;
  counts: { reviewed: number; toCheck: number; pending: number };
  examTypes: ExamTypeSummary[];
  initial: { createExam: boolean; examTitle: string; examTypeSlug: string };
  /** Simulado já criado numa conclusão anterior: as questões entram nele. */
  existingExamTitle?: string | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (choice: ConcludeChoice) => void;
};

function Option({ on, title, detail, onPress }: { on: boolean; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} role="radio" aria-checked={on}
      style={{
        flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 4, borderWidth: on ? 2 : 1,
        borderColor: on ? color.brand : color["border-strong"], margin: on ? 0 : 1,
      }}>
      <View style={{ marginTop: 3, width: 16, height: 16, borderRadius: 8, borderWidth: on ? 5 : 1.5, borderColor: on ? color.brand : color["border-strong"] }} />
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink">{title}</Text>
        <Text className="text-xs text-ink-muted">{detail}</Text>
      </View>
    </Pressable>
  );
}

/** Conclusão da importação: quais questões entram no banco e se viram (ou entram em) um simulado. */
export default function ConcludeImportDialog({ visible, counts, examTypes, initial, existingExamTitle, loading, onCancel, onConfirm }: Props) {
  const ready = counts.reviewed + counts.toCheck;
  const [scope, setScope] = useState<ConcludeChoice["scope"]>("reviewed");
  const [createExam, setCreateExam] = useState(initial.createExam);
  const [examTitle, setExamTitle] = useState(initial.examTitle);
  const [examTypeSlug, setExamTypeSlug] = useState(initial.examTypeSlug);

  useEffect(() => {
    if (!visible) return;
    setScope(counts.reviewed > 0 ? "reviewed" : "ready");
    setCreateExam(initial.createExam);
    setExamTitle(initial.examTitle);
    setExamTypeSlug(initial.examTypeSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [visible]);

  const total = scope === "reviewed" ? counts.reviewed : ready;
  const selectedType = examTypes.find((t) => t.slug === examTypeSlug) ?? null;
  const examInvalid = createExam && !existingExamTitle && (!examTitle.trim() || !examTypeSlug);

  return (
    <OverlayPortal open={visible} onClose={loading ? () => {} : onCancel} contentPadding={16}>
      <DialogPanel title="Concluir importação" maxWidth={520}
        footer={
          <>
            <Button label="Voltar à revisão" onPress={onCancel} disabled={loading} />
            <Button variant="primary" label={`Incluir ${total} ${total === 1 ? "questão" : "questões"}`} loading={loading}
              disabled={total === 0 || examInvalid}
              onPress={() => onConfirm({ scope, createExam, examTitle: examTitle.trim(), examTypeSlug })} />
          </>
        }>
        <Text className="text-[13px] text-ink-muted">As questões entram no banco de questões. Pendentes continuam salvas como rascunho.</Text>
        <View style={{ gap: 16, marginTop: 8 }}>
          <View className="flex-row border border-border rounded-ds-md">
            {[["Revisadas", counts.reviewed], ["Para conferir", counts.toCheck], ["Com pendências", counts.pending]].map(([label, value], i) => (
              <View key={label as string} className="flex-1 px-4 py-3" style={{ borderLeftWidth: i ? 1 : 0, borderLeftColor: color.border }}>
                <Text className="text-xs text-ink-subtle">{label}</Text>
                <Text className="font-mono font-semibold text-ink" style={{ fontSize: 20, lineHeight: 28 }}>{value}</Text>
              </View>
            ))}
          </View>
          <View role="radiogroup" aria-label="Quais questões incluir" style={{ gap: 8 }}>
            <Option on={scope === "reviewed"} onPress={() => setScope("reviewed")}
              title={`Incluir só as ${counts.reviewed} revisadas`}
              detail={`Recomendado. As outras ${counts.toCheck + counts.pending} ficam em rascunho para revisar depois.`} />
            <Option on={scope === "ready"} onPress={() => setScope("ready")}
              title={`Incluir as ${ready} sem pendências`}
              detail="Inclui também as que a IA preencheu e ninguém conferiu." />
          </View>
          <View className="border-t border-border pt-4" style={{ gap: 12 }}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Switch value={createExam} onValueChange={setCreateExam} disabled={loading || !!existingExamTitle}
                accessibilityLabel="Criar simulado com estas questões" />
              <Text className="text-sm font-medium text-ink">Criar simulado com estas questões</Text>
            </View>
            {createExam && (existingExamTitle ? (
              <Text className="text-[13px] text-ink-muted">
                As questões entram no fim do simulado <Text className="font-semibold text-ink">{existingExamTitle}</Text>, criado na conclusão anterior.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <View style={{ flex: 7, minWidth: 220 }}>
                  <FormInput label="Nome do simulado" required value={examTitle} onChangeText={setExamTitle} maxLength={255} />
                </View>
                <View style={{ flex: 5, minWidth: 180 }}>
                  <View className="flex-row items-end" style={{ gap: 8 }}>
                    <View className="flex-1">
                      <SearchableSelect label="Modalidade" required modalTitle="Selecionar modalidade" placeholder="Selecione…"
                        value={examTypeSlug} showSelectedPreview={false} onChange={setExamTypeSlug}
                        options={examTypes.filter((t) => t.slug).map((t) => ({ value: t.slug!, label: t.label }))} />
                    </View>
                    <ExamTypeLogo size={38} label={selectedType?.label} logoUrl={selectedType?.logo_url} />
                  </View>
                  <Text className="text-xs text-ink-subtle mt-1">Vale para todas as questões.</Text>
                </View>
              </View>
            ))}
            {createExam && !existingExamTitle && (
              <Text className="text-xs text-ink-subtle">
                O simulado fica como rascunho em Simulados do banco; publique para os alunos responderem no app.
              </Text>
            )}
          </View>
        </View>
      </DialogPanel>
    </OverlayPortal>
  );
}
