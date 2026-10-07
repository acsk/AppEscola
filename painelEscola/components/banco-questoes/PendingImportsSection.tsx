import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { FilePen, Trash2 } from "lucide-react-native";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import ConfirmModal from "../ui/ConfirmModal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { deleteImportDraft, listImportDrafts, type ImportDraftSummary } from "../../services/questionImportDrafts";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../utils/apiErrors";

type Props = {
  visible: boolean;
  /** Continua a revisão (abre o Importar PDF). */
  onResumeImport: (draftId: string) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
  /** Título exibido abaixo da lista, antes do conteúdo seguinte (ex.: "Simulados criados"). */
  nextSectionTitle?: string;
};

/** Importações de PDF ainda em revisão (rascunhos salvos pelo usuário): o simulado só nasce ao concluir. */
export default function PendingImportsSection({ visible, onResumeImport, setToast, nextSectionTitle }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [pending, setPending] = useState<ImportDraftSummary[]>([]);
  const [deletePending, setDeletePending] = useState<ImportDraftSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPending((await listImportDrafts()).body.items);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const remove = async () => {
    if (!deletePending) return;
    setDeleting(true);
    try {
      const response = await deleteImportDraft(deletePending.id);
      showApiToast(setToast, response, "Rascunho excluído.");
      setDeletePending(null);
      void load();
    } catch (cause) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(cause, "Não foi possível excluir o rascunho.") });
    } finally {
      setDeleting(false);
    }
  };

  if (pending.length === 0) return null;

  return (
    <>
      <View style={{ gap: 8 }}>
        <Text className="text-sm font-semibold text-ink">Importações em revisão ({pending.length})</Text>
        <Text className="text-xs text-ink-subtle">Rascunhos de importação salvos por você: o simulado é criado ao concluir a revisão e incluir as questões.</Text>
        <View className="border border-border rounded-ds-md">
          {pending.map((item, i) => (
            <View key={item.id} className={`px-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10 }}>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="text-sm font-semibold text-ink" numberOfLines={2}>{item.source_exam_name}</Text>
                <Text className="text-xs text-ink-muted">
                  {item.question_count} questão(ões) em revisão · salvo em {new Date(item.updated_at).toLocaleString("pt-BR")}
                </Text>
              </View>
              <Badge label="Importação em revisão" tone="warning" />
              <View className="flex-row justify-end" style={{ gap: 8 }}>
                <Button icon={FilePen} label="Continuar revisão" onPress={() => onResumeImport(item.id)} />
                <Button icon={Trash2} variant="danger" label="Excluir" accessibilityLabel={`Excluir rascunho ${item.source_exam_name}`}
                  onPress={() => setDeletePending(item)} />
              </View>
            </View>
          ))}
        </View>
        {nextSectionTitle ? <Text className="text-sm font-semibold text-ink mt-2">{nextSectionTitle}</Text> : null}
      </View>

      <ConfirmModal visible={deletePending !== null} title="Excluir rascunho da importação?"
        message={`"${deletePending?.source_exam_name ?? ""}" (${deletePending?.question_count ?? 0} questões em revisão) será excluído. Questões já incluídas no banco não são afetadas.`}
        loading={deleting} onCancel={() => setDeletePending(null)} onConfirm={() => void remove()} />
    </>
  );
}
