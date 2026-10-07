import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import { clearDomainCache } from "../../hooks/useDomains";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import Badge from "../../components/ui/Badge";
import ExamTypeLogo from "../../components/ui/ExamTypeLogo";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CONTAINER,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useAuth } from "../../contexts/AuthContext";

type ExamTypeRow = {
  id: number;
  slug: string;
  label: string;
  logo_url?: string | null;
  sort_order: number;
  is_active: boolean;
  exams_count?: number;
  past_exams_count?: number;
  questions_count?: number;
};

const EMPTY_FORM = {
  label: "",
  slug: "",
  sort_order: "0",
  is_active: true,
};

export default function ExamTypesScreen() {
  const { user } = useAuth();
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const isSuperAdmin = user?.role === "super_admin";

  const [rows, setRows] = useState<ExamTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const editingRow = rows.find((r) => r.id === editingId) ?? null;
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const fetchRows = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const { data } = await api.get("/admin/exam-types");
      const body = data?.body ?? data;
      setRows(Array.isArray(body) ? body : body?.data ?? []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row: ExamTypeRow) => {
    setEditingId(row.id);
    setForm({
      label: row.label,
      slug: row.slug,
      sort_order: String(row.sort_order ?? 0),
      is_active: row.is_active,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const localErrors: Record<string, string> = {};
    if (!form.label.trim()) localErrors.label = "Nome obrigatório";
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        slug: form.slug.trim() || undefined,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };

      if (editingId) {
        await api.put(`/admin/exam-types/${editingId}`, payload);
        setToast({ visible: true, type: "success", message: "Classificação atualizada." });
      } else {
        await api.post("/admin/exam-types", payload);
        setToast({ visible: true, type: "success", message: "Classificação cadastrada." });
      }

      clearDomainCache("/exam-types");
      setModalOpen(false);
      fetchRows();
    } catch (e: any) {
      setErrors(parseApiErrors(e));
      setToast({
        visible: true,
        type: "error",
        message: e?.response?.data?.message ?? "Não foi possível salvar.",
      });
    }
    setSaving(false);
  };

  /** Logo da modalidade (IFAL, CPM…), exibido como ícone do simulado no painel e no app do aluno. */
  const uploadLogo = async (file: File) => {
    if (!editingId) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 1024 * 1024) {
      setToast({ visible: true, type: "error", message: "Envie PNG, JPG ou WEBP de até 1 MB." });
      return;
    }
    setLogoBusy(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const { data } = await api.post(`/admin/exam-types/${editingId}/logo`, formData);
      setToast({ visible: true, type: "success", message: data?.message ?? "Logo atualizado." });
      clearDomainCache("/exam-types");
      await fetchRows();
    } catch (e: any) {
      const fieldError = parseApiErrors(e).logo;
      setToast({ visible: true, type: "error", message: fieldError ?? e?.response?.data?.message ?? "Não foi possível enviar o logo." });
    }
    setLogoBusy(false);
  };

  const removeLogo = async () => {
    if (!editingId) return;
    setLogoBusy(true);
    try {
      const { data } = await api.delete(`/admin/exam-types/${editingId}/logo`);
      setToast({ visible: true, type: "success", message: data?.message ?? "Logo removido." });
      clearDomainCache("/exam-types");
      await fetchRows();
    } catch (e: any) {
      setToast({ visible: true, type: "error", message: e?.response?.data?.message ?? "Não foi possível remover o logo." });
    }
    setLogoBusy(false);
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/admin/exam-types/${deleteId}`);
      clearDomainCache("/exam-types");
      setToast({ visible: true, type: "success", message: "Classificação removida." });
      setDeleteId(null);
      fetchRows();
    } catch (e: any) {
      setToast({
        visible: true,
        type: "error",
        message: e?.response?.data?.message ?? "Não foi possível remover.",
      });
      setDeleteId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm text-warning">Acesso permitido apenas para super admin.</Text>
      </View>
    );
  }

  const fieldStyle = {
    border: "1px solid #D9DDE3",
    borderRadius: 4,
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--ds-ink)",
    backgroundColor: "var(--ds-surface-sunken)",
    outline: "none",
    width: "100%",
    minHeight: 38,
  } as const;

  return (
    <ScrollView className="flex-1 bg-surface-sunken" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View
        className="mb-6"
        style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}
      >
        <View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Tipos de prova</Text>
          <Text className="text-sm text-ink-muted mt-1">
            Classificações (ENEM, Vestibular, etc.) usadas em simulados, questões e provas/exercícios
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center gap-2 bg-brand px-4 rounded-ds-md self-start py-2 min-h-control-md justify-center"
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium">Nova classificação</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="var(--ds-brand)" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
          <View
            className={TABLE_CONTAINER}
            style={{ minWidth: tableMinWidth, width: "100%" }}
          >
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={`${TABLE_HEADER_CELL} flex-[2]`}>Nome</Text>
              <Text className={`${TABLE_HEADER_CELL} flex-1`}>Identificador</Text>
              <Text className={`${TABLE_HEADER_CELL} w-16 text-right`}>Ordem</Text>
              <Text className={`${TABLE_HEADER_CELL} w-24 text-center`}>Status</Text>
              <Text className={`${TABLE_HEADER_CELL} w-28 text-center`}>Uso</Text>
              <Text className={`${TABLE_HEADER_CELL} w-20 text-right`}>Ações</Text>
            </View>
            {rows.length === 0 ? (
              <Text className="text-ink-subtle p-6">Nenhuma classificação cadastrada.</Text>
            ) : (
              rows.map((row, i) => (
                <DataTableRow key={row.id} index={i}>
                  <View className="flex-row items-center flex-[2]" style={{ gap: 10 }}>
                    <ExamTypeLogo label={row.label} logoUrl={row.logo_url} size={30} />
                    <Text className="text-sm font-medium text-ink flex-1">{row.label}</Text>
                  </View>
                  <Text className="text-sm font-mono text-ink-muted flex-1">{row.slug}</Text>
                  <Text className="text-sm font-mono text-ink w-16 text-right">{row.sort_order}</Text>
                  <View className="w-24 items-center">
                    <Badge
                      label={row.is_active ? "Ativo" : "Inativo"}
                      tone={row.is_active ? "success" : "neutral"}
                    />
                  </View>
                  <Text className="text-xs font-mono text-ink-muted w-28 text-center">
                    S:{row.exams_count ?? 0} · P:{row.past_exams_count ?? 0} · Q:{row.questions_count ?? 0}
                  </Text>
                  <View className="flex-row gap-2 w-20 justify-end">
                    <TouchableOpacity onPress={() => openEdit(row)}>
                      <Ionicons name="pencil-outline" size={18} color="var(--ds-brand)" />
                    </TouchableOpacity>
                    <TouchableOpacity className="p-1.5 bg-danger rounded-ds-md" onPress={() => setDeleteId(row.id)}>
                      <Ionicons name="trash-outline" size={18} color="var(--ds-on-danger)" />
                    </TouchableOpacity>
                  </View>
                </DataTableRow>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={modalOpen}
        title={editingId ? "Editar classificação" : "Nova classificação"}
        onClose={() => setModalOpen(false)}
        size="sm"
        footer={
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="bg-brand px-5 rounded-ds-md items-center py-2 min-h-control-md justify-center"
          >
            {saving ? (
              <ActivityIndicator color="var(--ds-on-brand)" size="small" />
            ) : (
              <Text className="text-on-brand text-sm font-medium">Salvar</Text>
            )}
          </TouchableOpacity>
        }
      >
        <View className="gap-3">
          <View>
            <Text className="text-xs font-semibold text-ink-muted mb-1">
              Nome <Text className="text-danger">*</Text>
            </Text>
            <input
              value={form.label}
              onChange={(e: any) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="Ex.: ENEM"
              style={{ ...fieldStyle, borderColor: errors.label ? "var(--ds-danger)" : "var(--ds-border)" }}
            />
            {errors.label ? <Text className="text-xs text-danger mt-1">{errors.label}</Text> : null}
          </View>
          <View>
            <Text className="text-xs font-semibold text-ink-muted mb-1">Identificador (slug)</Text>
            <Text className="text-[10px] text-ink-subtle mb-1">Opcional no cadastro; gerado automaticamente a partir do nome.</Text>
            <input
              value={form.slug}
              onChange={(e: any) => setForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="ex.: enem"
              style={fieldStyle}
            />
            {errors.slug ? <Text className="text-xs text-danger mt-1">{errors.slug}</Text> : null}
          </View>
          <View>
            <Text className="text-xs font-semibold text-ink-muted mb-1">Ordem de exibição</Text>
            <input
              value={form.sort_order}
              inputMode="numeric"
              onChange={(e: any) =>
                setForm((p) => ({ ...p, sort_order: e.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
              style={fieldStyle}
            />
          </View>
          {editingRow ? (
            <View>
              <Text className="text-xs font-semibold text-ink-muted mb-1">Logo (ícone do simulado)</Text>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <ExamTypeLogo label={form.label || editingRow.label} logoUrl={editingRow.logo_url} size={48} />
                <TouchableOpacity
                  onPress={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  className="flex-row items-center gap-1.5 border border-border bg-surface px-3 rounded-ds-md py-2 min-h-control-md"
                >
                  {logoBusy ? <ActivityIndicator size="small" color="var(--ds-brand)" /> : <Ionicons name="image-outline" size={16} color="var(--ds-ink)" />}
                  <Text className="text-sm text-ink">{editingRow.logo_url ? "Trocar logo" : "Enviar logo"}</Text>
                </TouchableOpacity>
                {editingRow.logo_url ? (
                  <TouchableOpacity
                    onPress={removeLogo}
                    disabled={logoBusy}
                    accessibilityLabel="Remover logo"
                    className="p-2 bg-danger rounded-ds-md"
                  >
                    <Ionicons name="trash-outline" size={16} color="var(--ds-on-danger)" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text className="text-[10px] text-ink-subtle mt-1">PNG, JPG ou WEBP, até 1 MB, quadrado de preferência. Sem logo, aparece a sigla.</Text>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e: any) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadLogo(file);
                }}
              />
            </View>
          ) : (
            <Text className="text-[10px] text-ink-subtle">Salve a classificação para enviar o logo.</Text>
          )}
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-ink">Ativo nos formulários</Text>
            <Switch value={form.is_active} onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover classificação"
        message="Só é possível remover se não houver simulados, provas/exercícios ou questões vinculados. Desative o tipo se ainda estiver em uso."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </ScrollView>
  );
}
