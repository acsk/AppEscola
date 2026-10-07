import React, { useEffect, useMemo, useState } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { createPortal } from "react-dom";
import { Check, FileText, List, Save, Sparkles, X } from "lucide-react-native";
import Button from "../../ui/Button";
import ConfirmModal from "../../ui/ConfirmModal";
import ReviewQuestionList, { type ReviewFilter, type ReviewListItem } from "./ReviewQuestionList";
import ReviewQuestionEditor, { type EditorDraft } from "./ReviewQuestionEditor";
import PdfSourcePanel from "./PdfSourcePanel";
import ConcludeImportDialog, { type ConcludeChoice } from "./ConcludeImportDialog";
import { color } from "../../../constants/theme";
import type { QuestionBankCatalogs } from "../../../hooks/useQuestionBankCatalogs";
import { reviewIssues, reviewStatus } from "../../../utils/importReview";

export type SaveStatus = { state: "idle" | "saving" | "saved" | "error"; at: Date | null };

type Props = {
  sourceExamName: string;
  drafts: EditorDraft[];
  activeKey: string;
  onActiveKey: (key: string) => void;
  onChangeDraft: (key: string, patch: Partial<EditorDraft>) => void;
  busy: boolean;
  catalogs: QuestionBankCatalogs;
  subjectIds: number[];
  pdfFile: File | null;
  pdfFileName: string | null;
  onPickPdf: (file: File) => void;
  saveStatus: SaveStatus;
  onClose: () => void;
  onSaveAndExit: () => void;
  onAutofill: (draft: EditorDraft) => void;
  onRemove: (key: string) => void;
  onUploadImage: (key: string, file: File) => void;
  exam: { createExam: boolean; examTitle: string; examTypeSlug: string; existingExamTitle: string | null };
  concluding: boolean;
  onConclude: (choice: ConcludeChoice, keys: string[]) => Promise<boolean>;
  /** Avisos sobre a leitura do PDF (páginas não separadas, sem texto) — topo da lista. */
  listNotice?: React.ReactNode;
  /** Avisos sobre o rascunho (versão desatualizada) — topo do editor. */
  editorNotice?: React.ReactNode;
};

const WORKSPACE_Z = 1000; // acima do app; abaixo dos diálogos (OverlayPortal 20000) e seletores

function savedLabel(status: SaveStatus) {
  if (status.state === "saving") return "Salvando rascunho…";
  if (status.state === "error") return "Não foi possível salvar o rascunho";
  if (status.state === "saved" && status.at) {
    const seconds = (Date.now() - status.at.getTime()) / 1000;
    return `Rascunho salvo automaticamente · ${seconds < 60 ? "agora" : status.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "Rascunho salvo automaticamente";
}

/** Revisão das questões convertidas pela IA (protótipo "TelaRevisaoIA"): lista, editor e PDF original. */
export default function ImportReviewWorkspace(props: Props) {
  const {
    sourceExamName, drafts, activeKey, onActiveKey, onChangeDraft, busy, catalogs, subjectIds, pdfFile, pdfFileName, onPickPdf,
    saveStatus, onClose, onSaveAndExit, onAutofill, onRemove, onUploadImage, exam, concluding, onConclude, listNotice, editorNotice,
  } = props;
  const { width } = useWindowDimensions();
  const wide = width >= 1280; // três colunas
  const medium = width >= 900; // lista + editor; PDF em painel sobreposto
  const roomy = width >= 1180; // barra superior com progresso e estado do salvamento
  const phone = width < 640;
  const [filter, setFilter] = useState<ReviewFilter>("todas");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [, tick] = useState(0);

  // "agora" → hora do salvamento, sem depender de outra mudança.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const subjectHasTopics = useMemo(() => {
    const withTopics = new Set(catalogs.taxonomy.filter((s) => s.topics.length).map((s) => s.id));
    return (id: number) => withTopics.has(id);
  }, [catalogs.taxonomy]);
  const subjectName = (id: number | null) => (id ? catalogs.subjects.find((s) => s.id === id)?.name ?? "Disciplina" : null);

  const items: ReviewListItem[] = drafts.map((draft, index) => {
    const issues = reviewIssues(draft, subjectHasTopics);
    return {
      key: draft.key, number: index + 1, subjectName: subjectName(draft.classification.subject_id) ?? "Sem disciplina",
      questionText: draft.content.question_text, issues, status: reviewStatus(draft, issues),
    };
  });
  const index = Math.max(0, drafts.findIndex((d) => d.key === activeKey));
  const draft = drafts[index];
  const item = items[index];
  const reviewedCount = items.filter((i) => i.status === "ok").length;
  const pendingCount = items.filter((i) => i.status === "warn").length;
  const hasPending = pendingCount > 0 && items.some((i, n) => n !== index && i.status === "warn");

  const go = (n: number) => {
    if (drafts[n]) {
      onActiveKey(drafts[n].key);
      setCropping(false);
    }
  };
  const nextPending = () => {
    for (let step = 1; step <= items.length; step += 1) {
      const n = (index + step) % items.length;
      if (items[n].status === "warn") return go(n);
    }
  };
  const confirm = () => {
    if (!draft || item.issues.length || busy) return;
    onChangeDraft(draft.key, { reviewed: true });
    // Próxima ainda não revisada, a partir da atual.
    for (let step = 1; step <= items.length; step += 1) {
      const n = (index + step) % items.length;
      if (n !== index && items[n].status !== "ok") return go(n);
    }
  };
  const startCrop = () => {
    if (!wide) setPdfOpen(true);
    setCropping(true);
  };

  // Atalhos: J/K navegam (fora de campos de texto); ⌘/Ctrl+Enter confirma.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (concludeOpen || removeKey) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        confirm();
      } else if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === "j" || event.key === "J") go(index + 1);
        if (event.key === "k" || event.key === "K") go(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!draft || typeof document === "undefined") return null;

  const list = (
    <ReviewQuestionList items={items} activeKey={activeKey} filter={filter} onFilter={setFilter} notice={listNotice}
      onSelect={(key) => { onActiveKey(key); setListOpen(false); setCropping(false); }} />
  );
  const pdf = (
    <PdfSourcePanel file={pdfFile} fileName={pdfFileName} onPickFile={onPickPdf} page={draft.sourcePage ?? null}
      onLocate={(page) => onChangeDraft(draft.key, { sourcePage: page })}
      questionLabel={`Questão ${index + 1}`} questionText={draft.content.question_text}
      options={draft.content.options.map((o) => o.option_text)}
      cropping={cropping} onCancelCrop={() => setCropping(false)}
      onCrop={(file) => { setCropping(false); onUploadImage(draft.key, file); }} />
  );

  const workspace = (
    <View style={{ position: "fixed" as never, top: 0, left: 0, right: 0, bottom: 0, zIndex: WORKSPACE_Z, backgroundColor: color.bg ?? color["surface-sunken"] }}
      className="bg-surface-sunken">
      {/* Barra superior */}
      <View className="flex-row items-center bg-surface border-b border-border" style={{ height: 56, gap: phone ? 8 : 16, paddingHorizontal: phone ? 12 : 20 }}>
        <View style={{ marginLeft: -8 }}>
          <Button variant="ghost" iconOnly icon={X} label="Fechar revisão" onPress={onClose} disabled={busy} />
        </View>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text className="text-xs text-ink-subtle" numberOfLines={1}>Banco de questões · Importação de PDF</Text>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-base font-semibold text-ink" numberOfLines={1} style={{ flexShrink: 1 }}>{sourceExamName}</Text>
            {!phone && <View className="flex-row items-center border border-border rounded-ds-sm bg-surface-sunken px-1.5" style={{ height: 20, gap: 4 }}>
              <Sparkles size={12} color={color["ink-muted"]} />
              <Text className="font-medium text-ink-muted" style={{ fontSize: 11 }}>Convertido pela IA</Text>
            </View>}
          </View>
        </View>
        {roomy && (
          <View className="flex-row items-center ml-5" style={{ gap: 12 }} aria-label="Progresso da revisão">
            <View className="bg-surface-sunken border border-border" style={{ width: 180, height: 6, position: "relative" }}>
              <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${drafts.length ? (reviewedCount / drafts.length) * 100 : 0}%`, backgroundColor: color.success }} />
            </View>
            <Text className="font-mono font-medium text-ink" style={{ fontSize: 13 }}>{reviewedCount}/{drafts.length}</Text>
            <Text className="text-xs text-ink-subtle">revisadas</Text>
          </View>
        )}
        {roomy && (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            {saveStatus.state !== "error" && <Check size={14} color={color["ink-subtle"]} />}
            <Text className={`text-xs ${saveStatus.state === "error" ? "text-danger" : "text-ink-subtle"}`} numberOfLines={1}>{savedLabel(saveStatus)}</Text>
          </View>
        )}
        {!roomy && !phone && (
          <Text className="font-mono text-xs text-ink-muted" aria-label="Questões revisadas">{reviewedCount}/{drafts.length}</Text>
        )}
        {!wide && <Button icon={FileText} label="PDF" iconOnly={phone} onPress={() => setPdfOpen((o) => !o)} />}
        <Button icon={phone ? Save : undefined} iconOnly={phone} label="Salvar e sair" onPress={onSaveAndExit} disabled={busy} />
        <Button variant="primary" label={phone ? "Concluir" : "Concluir importação"} onPress={() => setConcludeOpen(true)} disabled={busy} />
      </View>

      {/* Corpo: lista · editor · PDF */}
      <View className="flex-1 flex-row" style={{ minHeight: 0 }}>
        {medium && <View className="border-r border-border" style={{ width: 272, minHeight: 0 }}>{list}</View>}
        <View className="flex-1" style={{ minWidth: 0, minHeight: 0 }}>
          <ReviewQuestionEditor
            draft={draft} number={index + 1} subjectName={subjectName(draft.classification.subject_id)} issues={item.issues}
            catalogs={catalogs} preferredSubjectIds={subjectIds} busy={busy}
            canPrev={index > 0} canNext={index < drafts.length - 1} hasPending={hasPending} pdfAvailable={!!pdfFile}
            notice={editorNotice}
            compact={phone}
            listButton={medium ? undefined : <Button size="sm" icon={List} label={`Questões (${drafts.length})`} onPress={() => setListOpen(true)} />}
            onChange={(patch) => onChangeDraft(draft.key, patch)}
            onPrev={() => go(index - 1)} onNext={() => go(index + 1)} onNextPending={nextPending}
            onAutofill={() => onAutofill(draft)} onRemove={() => setRemoveKey(draft.key)} onConfirm={confirm}
            onUploadImage={(file) => onUploadImage(draft.key, file)} onStartCrop={startCrop} />
        </View>
        {wide && <View style={{ width: 400, minHeight: 0 }}>{pdf}</View>}
      </View>

      {/* Telas menores: PDF e lista em painéis sobrepostos */}
      {!wide && pdfOpen && (
        <View style={{ position: "absolute", top: 56, right: 0, bottom: 0, width: Math.min(420, width), zIndex: 5, boxShadow: "0 8px 24px rgba(14,17,22,.18)" } as never}>
          <View className="absolute" style={{ top: 8, right: 8, zIndex: 6 }}>
            <Button size="sm" variant="ghost" iconOnly icon={X} label="Fechar PDF" onPress={() => { setPdfOpen(false); setCropping(false); }} />
          </View>
          {pdf}
        </View>
      )}
      {!medium && listOpen && (
        <View style={{ position: "absolute", top: 56, left: 0, bottom: 0, width: Math.min(320, width), zIndex: 5, boxShadow: "0 8px 24px rgba(14,17,22,.18)" } as never}>
          <View className="flex-row justify-end bg-surface border-b border-border px-2" style={{ height: 40, alignItems: "center" }}>
            <Button size="sm" variant="ghost" iconOnly icon={X} label="Fechar lista" onPress={() => setListOpen(false)} />
          </View>
          {list}
        </View>
      )}

      <ConcludeImportDialog visible={concludeOpen} loading={concluding} examTypes={catalogs.examTypes}
        counts={{ reviewed: reviewedCount, toCheck: items.filter((i) => i.status === "check").length, pending: pendingCount }}
        initial={{ createExam: exam.createExam, examTitle: exam.examTitle, examTypeSlug: exam.examTypeSlug }}
        existingExamTitle={exam.existingExamTitle}
        onCancel={() => setConcludeOpen(false)}
        onConfirm={async (choice) => {
          const keys = items.filter((i) => (choice.scope === "reviewed" ? i.status === "ok" : i.status !== "warn")).map((i) => i.key);
          if (await onConclude(choice, keys)) setConcludeOpen(false);
        }} />
      <ConfirmModal visible={removeKey !== null} title="Remover questão da importação?"
        message="A questão sai desta revisão e não será incluída no banco. Esta ação não pode ser desfeita depois que o rascunho for salvo."
        confirmLabel="Remover questão" onCancel={() => setRemoveKey(null)}
        onConfirm={() => { if (removeKey) onRemove(removeKey); setRemoveKey(null); }} />
    </View>
  );

  return createPortal(workspace, document.body);
}
