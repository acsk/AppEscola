import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ExternalLink, Shuffle, Trash2 } from "lucide-react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import Tabs from "../../ui/Tabs";
import Pagination from "../../ui/Pagination";
import FormInput from "../../ui/FormInput";
import ConfirmModal from "../../ui/ConfirmModal";
import ExamTypeLogo from "../../ui/ExamTypeLogo";
import PendingImportsSection from "../PendingImportsSection";
import QuestionSetDetailModal from "./QuestionSetDetailModal";
import GenerateQuestionSetDialog from "./GenerateQuestionSetDialog";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { QuestionBankCatalogs } from "../../../hooks/useQuestionBankCatalogs";
import {
  QUESTION_SET_ORIGIN_LABEL as ORIGIN_LABEL,
  deleteQuestionSet,
  fetchQuestionSets,
  type QuestionSet,
  type QuestionSetStatus,
} from "../../../services/questionSets";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../../utils/apiErrors";

type StatusTab = "" | QuestionSetStatus;
const TABS: { id: StatusTab; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "draft", label: "Rascunhos" },
  { id: "published", label: "Publicados" },
];
const PER_PAGE = 10;

type Props = {
  visible: boolean;
  catalogs: QuestionBankCatalogs;
  onClose: () => void;
  onResumeImport: (draftId: string) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

/**
 * Simulados do banco de questões: referenciam questões avulsas (que continuam no banco) e, publicados,
 * aparecem no app para todos os alunos ativos da escola. Não geram nota oficial.
 */
export default function QuestionSetsModal({ visible, catalogs, onClose, onResumeImport, setToast }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [status, setStatus] = useState<StatusTab>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<QuestionSet[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, per_page: PER_PAGE });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [deleteSet, setDeleteSet] = useState<QuestionSet | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchQuestionSets({ status: status || undefined, search: query || undefined, page, per_page: PER_PAGE });
      setRows(response.data);
      setMeta(response.meta);
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar os simulados do banco."));
    } finally {
      setLoading(false);
    }
  }, [status, query, page]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const remove = async () => {
    if (!deleteSet) return;
    setDeleting(true);
    try {
      showApiToast(setToast, await deleteQuestionSet(deleteSet.id), "Simulado excluído.");
      setDeleteSet(null);
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else void load();
    } catch (cause) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(cause, "Não foi possível excluir o simulado.") });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} title="Simulados do banco" onClose={onClose} size="lg" maxHeight="90%"
        footer={<Button label="Fechar" onPress={onClose} />}>
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "flex-start" }}>
            <Text className="text-sm text-ink-muted flex-1">
              Simulados montados com questões do banco: importados de PDF, gerados automaticamente ou montados pela seleção
              de questões (“Adicionar a simulado”). Publicados aparecem no app para todos os alunos ativos, sem nota oficial.
            </Text>
            <Button icon={Shuffle} label="Gerar automaticamente" onPress={() => setGenerateOpen(true)} />
          </View>
          <PendingImportsSection visible={visible} onResumeImport={onResumeImport} setToast={setToast} nextSectionTitle="Simulados do banco" />
          <Tabs items={TABS} value={status} onChange={(id) => { setStatus(id); setPage(1); }} accessibilityLabel="Status do simulado" />
          <FormInput label="Buscar" value={search} onChangeText={setSearch} placeholder="Título do simulado" maxLength={255} />

          {loading ? (
            <View className="py-10 items-center"><ActivityIndicator color="var(--ds-brand)" /></View>
          ) : loadError ? (
            <View className="py-8 items-center" style={{ gap: 10 }}>
              <Text className="text-sm text-danger text-center">{loadError}</Text>
              <Button label="Tentar novamente" onPress={() => void load()} />
            </View>
          ) : rows.length === 0 ? (
            <Text className="text-sm text-ink-subtle py-8 text-center">
              {query || status ? "Nenhum simulado com esses filtros." : "Nenhum simulado do banco ainda. Importe um PDF, gere automaticamente ou selecione questões na lista."}
            </Text>
          ) : (
            <View className="border border-border rounded-ds-md">
              {rows.map((set, i) => (
                <View key={set.id} className={`px-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10 }}>
                  <View className="flex-row items-center flex-1" style={{ gap: 10, minWidth: 0 }}>
                    <ExamTypeLogo label={set.exam_type?.label} logoUrl={set.exam_type?.logo_url} size={38} />
                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <Text className="text-sm font-semibold text-ink" numberOfLines={2}>{set.title}</Text>
                      <Text className="text-xs text-ink-muted" numberOfLines={2}>
                        {ORIGIN_LABEL[set.origin]} · {set.questions_count} questão(ões)
                        {set.attempts_count ? ` · ${set.attempts_count} tentativa(s)` : ""}
                        {" · "}{new Date(set.created_at).toLocaleDateString("pt-BR")}
                      </Text>
                    </View>
                    <Badge label={set.status === "published" ? "Publicado" : "Rascunho"} tone={set.status === "published" ? "success" : "neutral"} />
                  </View>
                  <View className="flex-row justify-end" style={{ gap: 8 }}>
                    <Button icon={ExternalLink} label="Abrir" onPress={() => setOpenId(set.id)} />
                    <Button icon={Trash2} variant="danger" label="Excluir" accessibilityLabel={`Excluir simulado ${set.title}`}
                      onPress={() => setDeleteSet(set)} />
                  </View>
                </View>
              ))}
            </View>
          )}
          {meta.last_page > 1 && (
            <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page}
              onPageChange={setPage} />
          )}
        </View>
      </Modal>

      <QuestionSetDetailModal setId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} setToast={setToast} />

      <GenerateQuestionSetDialog visible={generateOpen} catalogs={catalogs} setToast={setToast}
        onCancel={() => setGenerateOpen(false)}
        onGenerated={(set) => { setGenerateOpen(false); void load(); setOpenId(set.id); }} />

      <ConfirmModal visible={deleteSet !== null} title="Excluir simulado do banco?"
        message={`"${deleteSet?.title ?? ""}" deixa de aparecer para os alunos. As ${deleteSet?.questions_count ?? 0} questões continuam no banco${deleteSet?.attempts_count ? " e o histórico de quem já respondeu é preservado" : ""}.`}
        confirmLabel="Excluir simulado" loading={deleting}
        onCancel={() => setDeleteSet(null)} onConfirm={() => void remove()} />
    </>
  );
}
