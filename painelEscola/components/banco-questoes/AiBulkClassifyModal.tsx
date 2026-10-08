import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sparkles } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SearchableSelect from "../ui/SearchableSelect";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { aiClassifyQuestions, type AiClassifyField, type AiClassifyItem } from "../../services/questionAi";
import { chunk } from "../../utils/questionBankQuery";
import { describeAiError } from "../../utils/aiErrors";
import type { BatchItem } from "../../types/questionBank";

/** Questões por execução (cada bloco de 10 é uma chamada à IA). */
export const AI_BULK_MAX = 100;
const AI_CHUNK = 10;

const FIELDS: { value: AiClassifyField; label: string; hint: string }[] = [
  { value: "topics", label: "Assuntos", hint: "Escolhe os assuntos dentro da disciplina atual de cada questão." },
  { value: "subject", label: "Disciplina", hint: "Pode trocar a disciplina (os assuntos da antiga deixam de valer)." },
  { value: "difficulty", label: "Dificuldade", hint: "" },
  { value: "board", label: "Banca", hint: "Só quando estiver explícita no enunciado." },
  { value: "year", label: "Ano", hint: "Só quando estiver explícito no enunciado." },
  { value: "tags", label: "Tags", hint: "Adiciona palavras-chave; as tags atuais são mantidas." },
];

type Change = { label: string; before: string; after: string };
type Reviewed = AiClassifyItem & { changes: Change[]; patch: Omit<BatchItem, "id"> };

type Props = {
  visible: boolean;
  ids: number[];
  catalogs: QuestionBankCatalogs;
  applying: boolean;
  progress?: { done: number; total: number } | null;
  /** Verifica a chave de IA; devolve a mensagem de erro ou null. */
  ensureAvailable: () => Promise<string | null>;
  onClose: () => void;
  onConfirm: (items: BatchItem[]) => void;
};

/**
 * Atualização em massa com IA: escolhe os campos, a IA sugere por questão e um resumo pede confirmação (OK).
 * Nada é salvo antes do OK; a aplicação usa o lote de classificação (com "Desfazer").
 */
export default function AiBulkClassifyModal({ visible, ids, catalogs, applying, progress, ensureAvailable, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<"config" | "running" | "review">("config");
  const [fields, setFields] = useState<AiClassifyField[]>(["topics"]);
  const [subjectId, setSubjectId] = useState("");
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Reviewed[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const cancelled = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setStep("config");
    setFields(["topics"]);
    setSubjectId("");
    setError(null);
    setItems([]);
    setExcluded(new Set());
  }, [visible]);

  const names = useMemo(() => {
    const topics = new Map(catalogs.taxonomy.flatMap((s) => s.topics.map((t) => [t.id, t.name] as const)));
    const subjects = new Map(catalogs.subjects.map((s) => [s.id, s.name] as const));
    const difficulties = new Map(catalogs.difficulties.map((d) => [d.id, d.name] as const));
    const boards = new Map(catalogs.boards.map((b) => [b.id, b.name] as const));
    return { topics, subjects, difficulties, boards };
  }, [catalogs]);

  /** Só o que muda de fato; tags viram "adicionar" (as atuais ficam). */
  const review = (item: AiClassifyItem): Reviewed => {
    const { suggestion: s, current: c } = item;
    const changes: Change[] = [];
    const patch: Omit<BatchItem, "id"> = {};
    const list = (values: string[]) => (values.length ? values.join(", ") : "—");
    const topicNames = (topicIds: number[]) => list(topicIds.map((id) => names.topics.get(id) ?? `#${id}`));

    const subjectChanged = s.subject_id !== undefined && s.subject_id !== c.subject_id;
    const topicsChanged = s.topic_ids !== undefined
      && (s.topic_ids.length !== c.topic_ids.length || s.topic_ids.some((id) => !c.topic_ids.includes(id)));
    if (subjectChanged) {
      changes.push({ label: "Disciplina", before: names.subjects.get(c.subject_id ?? 0) ?? "—", after: names.subjects.get(s.subject_id!) ?? "—" });
    }
    if (topicsChanged) changes.push({ label: "Assuntos", before: topicNames(c.topic_ids), after: topicNames(s.topic_ids!) });
    if (subjectChanged || topicsChanged) {
      patch.subject_id = s.subject_id ?? c.subject_id;
      patch.topic_ids = s.topic_ids ?? [];
    }
    if (s.difficulty_id !== undefined && s.difficulty_id !== c.difficulty_id) {
      changes.push({ label: "Dificuldade", before: names.difficulties.get(c.difficulty_id ?? 0) ?? "—", after: names.difficulties.get(s.difficulty_id) ?? "—" });
      patch.difficulty_id = s.difficulty_id;
    }
    if (s.board_id !== undefined && s.board_id !== c.board_id) {
      changes.push({ label: "Banca", before: names.boards.get(c.board_id ?? 0) ?? "—", after: names.boards.get(s.board_id) ?? "—" });
      patch.board_id = s.board_id;
    }
    if (s.year !== undefined && s.year !== c.year) {
      changes.push({ label: "Ano", before: c.year ? String(c.year) : "—", after: String(s.year) });
      patch.year = s.year;
    }
    const lower = new Set(c.tags.map((t) => t.toLocaleLowerCase()));
    const newTags = (s.tags ?? []).filter((t) => !lower.has(t.toLocaleLowerCase()));
    if (newTags.length) {
      changes.push({ label: "Tags (adicionar)", before: list(c.tags), after: newTags.join(", ") });
      patch.add_tags = newTags;
    }
    return { ...item, changes, patch };
  };

  const toggleField = (field: AiClassifyField) =>
    setFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));

  const run = async () => {
    setError(null);
    const unavailable = await ensureAvailable();
    if (unavailable) {
      setError(unavailable);
      return;
    }
    cancelled.current = false;
    setStep("running");
    setDone(0);
    const results: Reviewed[] = [];
    for (const part of chunk(ids, AI_CHUNK)) {
      if (cancelled.current) break;
      try {
        const response = await aiClassifyQuestions(part, fields, subjectId ? Number(subjectId) : null);
        results.push(...response.map(review));
      } catch (err) {
        const { title, message } = describeAiError(err, "Não foi possível classificar com IA");
        if (results.length === 0) {
          setError(`${title}. ${message}`);
          setStep("config");
          return;
        }
        results.push(...part.map((id) => review({
          id, snippet: "", note: message, suggestion: {},
          current: { subject_id: null, topic_ids: [], difficulty_id: null, board_id: null, year: null, tags: [] },
        })));
      }
      setDone(Math.min(results.length, ids.length));
    }
    setItems(results);
    setExcluded(new Set());
    setStep("review");
  };

  const withChanges = items.filter((i) => i.changes.length > 0);
  const withoutChanges = items.filter((i) => i.changes.length === 0);
  const toApply = withChanges.filter((i) => !excluded.has(i.id));
  const tooMany = ids.length > AI_BULK_MAX;
  const usesSubject = fields.includes("subject") || fields.includes("topics");
  const countLabel = (n: number) => `${n} ${n === 1 ? "questão" : "questões"}`;

  const footer =
    step === "config" ? (
      <>
        <Button label="Cancelar" onPress={onClose} />
        <Button variant="ai" icon={Sparkles} label="Sugerir com IA" onPress={() => void run()} disabled={!fields.length || tooMany} />
      </>
    ) : step === "running" ? (
      <Button label="Parar" onPress={() => { cancelled.current = true; }} />
    ) : (
      <>
        <Button label="Voltar" onPress={() => setStep("config")} disabled={applying} />
        <Button
          variant="primary"
          label={toApply.length ? `OK, aplicar em ${countLabel(toApply.length)}` : "OK"}
          onPress={() => (toApply.length ? onConfirm(toApply.map((i) => ({ id: i.id, ...i.patch }))) : onClose())}
          loading={applying}
        />
      </>
    );

  return (
    <Modal
      visible={visible}
      title={step === "review" ? "Resumo das sugestões da IA" : "Atualizar com IA"}
      onClose={step === "running" || applying ? () => {} : onClose}
      size={step === "review" ? "lg" : "md"}
      compact
      maxHeight="90%"
      showScrollIndicator
      footer={<View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>{footer}</View>}
    >
      {step === "config" && (
        <View style={{ gap: 12 }}>
          <Text className="text-sm text-ink-muted">
            {countLabel(ids.length)} selecionada(s). A IA sugere só os campos marcados; nada é salvo antes de você confirmar no resumo.
          </Text>
          {tooMany && (
            <Text className="text-sm text-danger">Selecione até {AI_BULK_MAX} questões por vez para usar a IA.</Text>
          )}
          <View role="group" aria-label="Campos para a IA preencher" style={{ gap: 6 }}>
            {FIELDS.map((field) => {
              const checked = fields.includes(field.value);
              return (
                <TouchableOpacity
                  key={field.value}
                  role="checkbox"
                  aria-checked={checked}
                  onPress={() => toggleField(field.value)}
                  className={`flex-row items-start rounded-ds-md border px-3 py-2 ${checked ? "border-brand bg-brand-tint" : "border-border bg-surface"}`}
                  style={{ gap: 8 }}
                >
                  <Ionicons name={checked ? "checkbox" : "square-outline"} size={18} color={checked ? "var(--ds-brand)" : "var(--ds-ink-subtle)"} />
                  <View style={{ flex: 1 }}>
                    <Text className="text-sm font-medium text-ink">{field.label}</Text>
                    {field.hint ? <Text className="text-xs text-ink-subtle">{field.hint}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {usesSubject && (
            <View>
              <SearchableSelect
                dense
                showSelectedPreview={false}
                label="Usar a disciplina (opcional)"
                placeholder="Manter a disciplina de cada questão"
                modalTitle="Selecionar disciplina"
                options={catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }))}
                value={subjectId}
                onChange={setSubjectId}
              />
              <Text className="text-xs text-ink-subtle">
                Com uma disciplina escolhida, todas as questões passam para ela e a IA escolhe os assuntos dela.
              </Text>
            </View>
          )}
          {error ? <Text className="text-sm text-danger" aria-live="polite">{error}</Text> : null}
        </View>
      )}

      {step === "running" && (
        <View className="items-center py-8" style={{ gap: 12 }} aria-live="polite">
          <ActivityIndicator color="var(--ds-brand)" />
          <Text className="text-sm text-ink">Analisando {done} de {ids.length} questões…</Text>
          <Text className="text-xs text-ink-subtle">Cada bloco de {AI_CHUNK} questões leva alguns segundos.</Text>
        </View>
      )}

      {step === "review" && (
        <View style={{ gap: 12 }}>
          <Text className="text-sm text-ink" aria-live="polite">
            {countLabel(withChanges.length)} com alteração sugerida
            {withoutChanges.length ? ` · ${countLabel(withoutChanges.length)} sem alteração` : ""}. Desmarque o que não quiser aplicar.
          </Text>
          {applying && progress ? (
            <Text className="text-xs text-brand" aria-live="polite">Aplicando… {progress.done} de {progress.total}</Text>
          ) : null}

          {withChanges.map((item) => {
            const checked = !excluded.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                role="checkbox"
                aria-checked={checked}
                disabled={applying}
                onPress={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                className={`flex-row rounded-ds-md border px-3 py-2 ${checked ? "border-border bg-surface" : "border-border bg-surface-sunken"}`}
                style={{ gap: 10, opacity: checked ? 1 : 0.6 }}
              >
                <Ionicons name={checked ? "checkbox" : "square-outline"} size={18} color={checked ? "var(--ds-brand)" : "var(--ds-ink-subtle)"} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text className="text-sm text-ink" numberOfLines={1}>
                    <Text className="font-mono text-ink-muted">#{item.id} </Text>
                    {item.snippet || "Questão sem texto (imagem)"}
                  </Text>
                  {item.changes.map((change) => (
                    <Text key={change.label} className="text-xs text-ink">
                      <Text className="font-medium">{change.label}: </Text>
                      <Text className="text-brand">{change.after}</Text>
                      <Text className="text-ink-subtle">  (antes: {change.before})</Text>
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}

          {withoutChanges.length > 0 && (
            <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-2" style={{ gap: 2 }}>
              <Text className="text-xs font-medium text-ink-muted">Sem alteração ({withoutChanges.length})</Text>
              {withoutChanges.map((item) => (
                <Text key={item.id} className="text-xs text-ink-subtle" numberOfLines={1}>
                  <Text className="font-mono">#{item.id}</Text> {item.note ?? "A sugestão é igual à classificação atual."}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}
