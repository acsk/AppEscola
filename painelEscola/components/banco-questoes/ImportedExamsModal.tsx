import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { ExternalLink, FilePen, Trash2 } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Tabs from "../ui/Tabs";
import Pagination from "../ui/Pagination";
import FormInput from "../ui/FormInput";
import ConfirmModal from "../ui/ConfirmModal";
import ExamTypeLogo from "../ui/ExamTypeLogo";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { deleteImportedExam, fetchImportedExams, type ImportedExam } from "../../services/questionBank";
import { deleteImportDraft, listImportDrafts, type ImportDraftSummary } from "../../services/questionImportDrafts";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../utils/apiErrors";

type StatusTab = "" | "draft" | "published";
const TABS: { id: StatusTab; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "draft", label: "Simulados em rascunho" },
  { id: "published", label: "Publicados" },
];
const PER_PAGE = 10;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Abre o simulado na tela de edição (Simulados). */
  onOpenExam: (examId: number) => void;
  /** Continua a revisão de uma importação ainda não concluída (abre o Importar PDF). */
  onResumeImport: (draftId: string) => void;
  /** Chamado após excluir: questões podem ter voltado ao banco ou saído dele. */
  onChanged: () => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

/** Simulados criados a partir de provas em PDF importadas no banco de questões (rascunho ou não). */
export default function ImportedExamsModal({ visible, onClose, onOpenExam, onResumeImport, onChanged, setToast }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [status, setStatus] = useState<StatusTab>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ImportedExam[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, per_page: PER_PAGE });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteExam, setDeleteExam] = useState<ImportedExam | null>(null);
  const [keepQuestions, setKeepQuestions] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // Importações em revisão (rascunhos de importação, ainda sem simulado criado).
  const [pending, setPending] = useState<ImportDraftSummary[]>([]);
  const [deletePending, setDeletePending] = useState<ImportDraftSummary | null>(null);

  const loadPending = useCallback(async () => {
    try {
      setPending((await listImportDrafts()).body.items);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    if (visible) void loadPending();
  }, [visible, loadPending]);

  const removePending = async () => {
    if (!deletePending) return;
    setDeleting(true);
    try {
      const response = await deleteImportDraft(deletePending.id);
      showApiToast(setToast, response, "Rascunho excluído.");
      setDeletePending(null);
      void loadPending();
    } catch (cause) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(cause, "Não foi possível excluir o rascunho.") });
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchImportedExams({ status: status || undefined, search: query || undefined, page, per_page: PER_PAGE });
      setRows(response.data);
      setMeta(response.meta);
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar os simulados importados."));
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

  const askDelete = (exam: ImportedExam) => {
    // Simulado já respondido não pode devolver as questões ao banco (as respostas dependem delas).
    setKeepQuestions(!exam.attempts_count);
    setDeleteExam(exam);
  };

  const remove = async () => {
    if (!deleteExam) return;
    setDeleting(true);
    try {
      const response = await deleteImportedExam(deleteExam.id, keepQuestions);
      showApiToast(setToast, response, "Simulado excluído.");
      setDeleteExam(null);
      onChanged();
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else void load();
    } catch (cause) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(cause, "Não foi possível excluir o simulado.") });
    } finally {
      setDeleting(false);
    }
  };

  const answered = !!deleteExam?.attempts_count;

  return (
    <>
      <Modal visible={visible} title="Simulados importados de PDF" onClose={onClose} size="lg" maxHeight="90%"
        footer={<Button label="Fechar" onPress={onClose} />}>
        <View style={{ gap: 14 }}>
          <Text className="text-sm text-ink-muted">
            Provas importadas pelo banco de questões que viraram simulado. Rascunhos ainda não aparecem para os alunos:
            abra o simulado para revisar, definir turmas e publicar.
          </Text>
          {pending.length > 0 && (
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
              <Text className="text-sm font-semibold text-ink mt-2">Simulados criados</Text>
            </View>
          )}
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
              {query || status ? "Nenhum simulado importado com esses filtros." : "Nenhuma prova importada virou simulado ainda."}
            </Text>
          ) : (
            <View className="border border-border rounded-ds-md">
              {rows.map((exam, i) => (
                <View key={exam.id}
                  className={`px-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10 }}>
                  <View className="flex-row items-center flex-1" style={{ gap: 10, minWidth: 0 }}>
                    <ExamTypeLogo label={exam.exam_type_label} logoUrl={exam.exam_type_logo_url} size={38} />
                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <Text className="text-sm font-semibold text-ink" numberOfLines={2}>{exam.title}</Text>
                      <Text className="text-xs text-ink-muted" numberOfLines={1}>
                        {exam.exam_type_label ?? "Sem modalidade"} · {exam.questions_count ?? 0} questão(ões)
                        {exam.attempts_count ? ` · ${exam.attempts_count} tentativa(s)` : ""}
                        {" · "}{new Date(exam.created_at).toLocaleDateString("pt-BR")}
                      </Text>
                    </View>
                    <Badge label={exam.status_label ?? "—"} tone={exam.status === "published" ? "success" : "neutral"} />
                  </View>
                  <View className="flex-row justify-end" style={{ gap: 8 }}>
                    <Button icon={ExternalLink} label="Abrir" onPress={() => onOpenExam(exam.id)} />
                    <Button icon={Trash2} variant="danger" label="Excluir" accessibilityLabel={`Excluir simulado ${exam.title}`}
                      onPress={() => askDelete(exam)} />
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

      <ConfirmModal visible={deletePending !== null} title="Excluir rascunho da importação?"
        message={`"${deletePending?.source_exam_name ?? ""}" (${deletePending?.question_count ?? 0} questões em revisão) será excluído. Questões já incluídas no banco não são afetadas.`}
        loading={deleting} onCancel={() => setDeletePending(null)} onConfirm={() => void removePending()} />

      <ConfirmModal visible={deleteExam !== null} title="Excluir simulado importado?"
        message={`"${deleteExam?.title ?? ""}" deixa de aparecer em Simulados e para os alunos.`}
        confirmLabel="Excluir simulado" loading={deleting}
        onCancel={() => setDeleteExam(null)} onConfirm={() => void remove()}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Switch accessibilityLabel="Manter as questões no banco como avulsas" value={keepQuestions}
            disabled={answered || deleting} onValueChange={setKeepQuestions} />
          <Text className="text-sm text-ink flex-1">Manter as {deleteExam?.questions_count ?? 0} questões no banco como avulsas</Text>
        </View>
        <Text className="text-xs text-ink-subtle mt-2">
          {answered
            ? "Este simulado já foi respondido por alunos: as questões saem do banco junto com ele (o histórico das tentativas é preservado)."
            : keepQuestions
              ? "As questões continuam no banco de questões, sem vínculo com simulado."
              : "As questões também deixam de aparecer no banco de questões."}
        </Text>
      </ConfirmModal>
    </>
  );
}
