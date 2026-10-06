import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import ToastBanner from "../../components/ui/ToastBanner";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  deleteCatalogItem,
  deleteTopic,
  fetchCatalog,
  fetchCatalogDefinitions,
  fetchSubjectsWithCounts,
  fetchTopics,
  importDefaultTaxonomy,
  saveCatalogItem,
  saveTopic,
} from "../../services/questionBank";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import { foldText } from "../../utils/questionBankQuery";
import type { CatalogDefinition, CatalogItem, CatalogKey, SubjectTopic } from "../../types/questionBank";
import Tabs from "../../components/ui/Tabs";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import { Download } from "lucide-react-native";
import { useAuth } from "../../contexts/AuthContext";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type SubjectRow = { id: number; name: string; questions_count: number };

/** Formulário de item (assunto ou cadastro simples). */
type EditState =
  | { kind: "topic"; id?: number; subjectId: number; name: string; description: string }
  | { kind: "catalog"; catalog: CatalogKey; id?: number; name: string; description: string };

type DeleteState = { kind: "topic"; id: number; name: string } | { kind: "catalog"; catalog: CatalogKey; id: number; name: string };

const countLabel = (n: number) => `${n} ${n === 1 ? "questão" : "questões"}`;

export default function QuestionTaxonomyScreen({ navigate }: Props) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [section, setSection] = useState<"tree" | CatalogKey>("tree");

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [topics, setTopics] = useState<SubjectTopic[]>([]);
  const [definitions, setDefinitions] = useState<CatalogDefinition[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<DeleteState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const canImport = user?.role === "admin" || user?.role === "super_admin";
  const [confirmImport, setConfirmImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (section === "tree") {
        const [s, t, d] = await Promise.all([fetchSubjectsWithCounts(), fetchTopics(), fetchCatalogDefinitions()]);
        setSubjects(s);
        setTopics(t);
        setDefinitions(d);
      } else {
        const [list, d] = await Promise.all([fetchCatalog(section), fetchCatalogDefinitions()]);
        setItems(list);
        setDefinitions(d);
      }
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar a taxonomia."));
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Importa a taxonomia padrão (ENEM/vestibular e concursos). Idempotente: só cria o que falta. */
  const runImport = async () => {
    setImporting(true);
    try {
      const response = await importDefaultTaxonomy();
      showApiToast(setToast, response, "Taxonomia importada.");
      setConfirmImport(false);
      await load();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível importar a taxonomia.");
    } finally {
      setImporting(false);
    }
  };

  const topicsBySubject = useMemo(() => {
    const map = new Map<number, SubjectTopic[]>();
    topics.forEach((t) => map.set(t.subject_id, [...(map.get(t.subject_id) ?? []), t]));
    return map;
  }, [topics]);

  const visibleSubjects = useMemo(() => {
    const q = foldText(filter);
    if (!q) return subjects;
    return subjects.filter(
      (s) => foldText(s.name).includes(q) || (topicsBySubject.get(s.id) ?? []).some((t) => foldText(t.name).includes(q))
    );
  }, [filter, subjects, topicsBySubject]);

  const currentDefinition = definitions.find((d) => d.key === section);

  const submitEdit = async () => {
    if (!edit) return;
    if (!edit.name.trim()) {
      setEditErrors({ name: "Informe o nome." });
      return;
    }
    setSaving(true);
    setEditErrors({});
    try {
      const payload = { name: edit.name.trim(), description: edit.description.trim() || null };
      const response =
        edit.kind === "topic"
          ? await saveTopic({ ...payload, subject_id: edit.subjectId }, edit.id)
          : await saveCatalogItem(edit.catalog, payload, edit.id);
      showApiToast(setToast, response, "Operação realizada com sucesso.");
      setEdit(null);
      void load();
    } catch (error) {
      setEditErrors(getApiValidationErrors(error));
      showApiErrorToast(setToast, error, "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const response =
        toDelete.kind === "topic" ? await deleteTopic(toDelete.id) : await deleteCatalogItem(toDelete.catalog, toDelete.id);
      showApiToast(setToast, response, "Removido com sucesso.");
      void load();
    } catch (error) {
      // 409: item em uso — a API explica o motivo.
      showApiErrorToast(setToast, error, "Não foi possível excluir.");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const IconButton = ({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) => (
    <TouchableOpacity onPress={onPress} aria-label={label} className={`p-1.5 rounded-ds-md ${danger ? "bg-danger" : ""}`}>
      <Ionicons name={icon} size={16} color={danger ? "var(--ds-on-danger)" : "var(--ds-ink-muted)"} />
    </TouchableOpacity>
  );

  const sectionTabs: { key: "tree" | CatalogKey; label: string }[] = [
    { key: "tree", label: "Disciplinas e assuntos" },
    ...definitions.map((d) => ({ key: d.key, label: d.key === "boards" ? "Bancas" : d.key === "tags" ? "Tags" : "Dificuldades" })),
  ];

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
        <View className="mb-4">
          <PageHeader
            breadcrumb={[{ label: "Banco de questões", onPress: () => navigate("questoes") }, { label: "Taxonomia" }]}
            title="Taxonomia"
            description="Disciplinas, assuntos e cadastros usados para classificar as questões. Itens em uso não podem ser excluídos."
            actions={
              canImport ? <Button icon={Download} label="Importar taxonomia padrão" onPress={() => setConfirmImport(true)} /> : undefined
            }
          />
        </View>

        <View className="mb-4">
          <Tabs accessibilityLabel="Seções da taxonomia" items={sectionTabs.map((t) => ({ id: t.key, label: t.label }))} value={section} onChange={setSection} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="var(--ds-brand)" />
          </View>
        ) : loadError ? (
          <View className="py-14 items-center gap-3">
            <Text className="text-sm text-ink-muted text-center">{loadError}</Text>
            <TouchableOpacity onPress={() => void load()} className="px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center">
              <Text className="text-sm font-medium text-on-brand">Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : section === "tree" ? (
          <View style={{ gap: 10 }}>
            <View style={{ maxWidth: isMobile ? undefined : 360 }}>
              <FormInput label="Filtrar" value={filter} onChangeText={setFilter} placeholder="Disciplina ou assunto..." />
            </View>
            {visibleSubjects.length === 0 ? (
              <Text className="text-sm text-ink-muted py-8 text-center">
                {subjects.length === 0 ? "Nenhuma disciplina ativa. Cadastre em Acadêmico › Disciplinas." : "Nada encontrado."}
              </Text>
            ) : (
              visibleSubjects.map((subject) => {
                const subjectTopics = topicsBySubject.get(subject.id) ?? [];
                const open = expanded.has(subject.id) || foldText(filter) !== "";
                return (
                  <View key={subject.id} className="bg-surface rounded-ds-md border border-border overflow-hidden">
                    <TouchableOpacity
                      onPress={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          next.has(subject.id) ? next.delete(subject.id) : next.add(subject.id);
                          return next;
                        })
                      }
                      aria-expanded={open}
                      className="flex-row items-center px-4 py-3 gap-3"
                    >
                      <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color="var(--ds-ink-muted)" />
                      <Text className={`${TABLE_CELL_SEMIBOLD} flex-1`}>{subject.name}</Text>
                      <Text className={TABLE_CELL_MUTED}>
                        {subjectTopics.length} assunto(s) · {countLabel(subject.questions_count)}
                      </Text>
                    </TouchableOpacity>
                    {open && (
                      <View className="border-t border-border">
                        {subjectTopics.map((topic, i) => (
                          <DataTableRow key={topic.id} index={i} style={{ paddingLeft: 44 }}>
                            <Text className={`${TABLE_CELL} flex-1`}>{topic.name}</Text>
                            <Text className={TABLE_CELL_MUTED} style={{ width: 110 }}>
                              {countLabel(topic.questions_count)}
                            </Text>
                            <IconButton
                              icon="create-outline"
                              label={`Editar assunto ${topic.name}`}
                              onPress={() =>
                                setEdit({ kind: "topic", id: topic.id, subjectId: topic.subject_id, name: topic.name, description: topic.description ?? "" })
                              }
                            />
                            <IconButton
                              icon="trash-outline"
                              danger
                              label={`Excluir assunto ${topic.name}`}
                              onPress={() => setToDelete({ kind: "topic", id: topic.id, name: topic.name })}
                            />
                          </DataTableRow>
                        ))}
                        <TouchableOpacity
                          onPress={() => setEdit({ kind: "topic", subjectId: subject.id, name: "", description: "" })}
                          className="flex-row items-center gap-2 px-4 py-3"
                          style={{ paddingLeft: 44 }}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="var(--ds-brand)" />
                          <Text className="text-xs font-semibold text-brand">Novo assunto em {subject.name}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {currentDefinition?.editable ? (
              <TouchableOpacity
                onPress={() => setEdit({ kind: "catalog", catalog: section, name: "", description: "" })}
                className="self-start flex-row items-center gap-1.5 px-3 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
              >
                <Ionicons name="add" size={16} color="var(--ds-on-brand)" />
                <Text className="text-xs font-medium text-on-brand">Novo item</Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-xs text-ink-muted">Cadastro fixo do sistema (somente leitura).</Text>
            )}
            <View className="bg-surface rounded-ds-md overflow-hidden border border-border">
              <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Nome</Text>
                {!isMobile && <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Descrição</Text>}
                <Text className={TABLE_HEADER_CELL} style={{ width: 100 }}>Uso</Text>
                {currentDefinition?.editable && <View style={{ width: 72 }} />}
              </View>
              {items.length === 0 ? (
                <Text className="text-sm text-ink-muted py-10 text-center">Nenhum item cadastrado.</Text>
              ) : (
                items.map((item, i) => (
                  <DataTableRow key={item.id} index={i}>
                    <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 1 }}>{item.name}</Text>
                    {!isMobile && <Text className={TABLE_CELL_MUTED} style={{ flex: 1 }} numberOfLines={1}>{item.description || "—"}</Text>}
                    <Text className={TABLE_CELL_MUTED} style={{ width: 100 }}>{countLabel(item.questions_count)}</Text>
                    {currentDefinition?.editable && (
                      <View className="flex-row" style={{ width: 72, justifyContent: "flex-end" }}>
                        <IconButton
                          icon="create-outline"
                          label={`Editar ${item.name}`}
                          onPress={() => setEdit({ kind: "catalog", catalog: section, id: item.id, name: item.name, description: item.description ?? "" })}
                        />
                        <IconButton
                          icon="trash-outline"
                          danger
                          label={`Excluir ${item.name}`}
                          onPress={() => setToDelete({ kind: "catalog", catalog: section, id: item.id, name: item.name })}
                        />
                      </View>
                    )}
                  </DataTableRow>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!edit}
        title={edit?.id ? "Editar" : edit?.kind === "topic" ? "Novo assunto" : `Novo item — ${currentDefinition?.label ?? ""}`}
        onClose={() => !saving && setEdit(null)}
        size="md"
        compact
        footer={
          <View className="flex-row justify-end gap-3">
            <TouchableOpacity onPress={() => setEdit(null)} disabled={saving} className="px-4 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center">
              <Text className="text-sm font-semibold text-ink-muted">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submitEdit} disabled={saving} className={`px-4 py-2.5 rounded-ds-md flex-row items-center gap-2 ${saving ? "bg-brand-tint" : "bg-brand"}`}>
              {saving && <ActivityIndicator size="small" color="var(--ds-on-brand)" />}
              <Text className="text-sm font-medium text-on-brand">Salvar</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {edit && (
          <View style={{ gap: 10 }}>
            {edit.kind === "topic" && edit.id && (
              <SearchableSelect
                dense
                label="Disciplina"
                modalTitle="Mover para a disciplina"
                options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
                value={String(edit.subjectId)}
                onChange={(v) => v && setEdit({ ...edit, subjectId: Number(v) })}
                error={editErrors.subject_id}
              />
            )}
            <FormInput
              label="Nome"
              required
              value={edit.name}
              onChangeText={(v) => setEdit({ ...edit, name: v })}
              error={editErrors.name}
              maxLength={edit.kind === "catalog" && edit.catalog === "tags" ? 50 : 150}
            />
            <FormInput
              label="Descrição"
              value={edit.description}
              onChangeText={(v) => setEdit({ ...edit, description: v })}
              error={editErrors.description}
              multiline
            />
          </View>
        )}
      </Modal>

      <ConfirmModal
        visible={!!toDelete}
        title="Excluir item"
        message={`Excluir "${toDelete?.name ?? ""}"? Itens em uso por questões não podem ser excluídos.`}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmModal
        visible={confirmImport}
        tone="primary"
        title="Importar taxonomia padrão"
        message="Cria as disciplinas, os assuntos e as bancas padrão que ainda não existem (ENEM/vestibular e concursos). Nada do que já existe é alterado ou removido. As disciplinas novas também aparecem em Acadêmico › Disciplinas."
        confirmLabel="Importar"
        loading={importing}
        onConfirm={() => void runImport()}
        onCancel={() => setConfirmImport(false)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
