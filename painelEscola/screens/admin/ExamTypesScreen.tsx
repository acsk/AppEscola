import React, { useCallback, useEffect, useState } from "react";
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
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useAuth } from "../../contexts/AuthContext";

type ExamTypeRow = {
  id: number;
  slug: string;
  label: string;
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
        <Text className="text-sm text-amber-700">Acesso permitido apenas para super admin.</Text>
      </View>
    );
  }

  const fieldStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
    outline: "none",
    width: "100%",
    minHeight: 38,
  } as const;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View
        className="mb-6"
        style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-900">Tipos de prova</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Classificações (ENEM, Vestibular, etc.) usadas em simulados, questões e provas anteriores
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center gap-2 bg-violet-600 px-4 py-3 rounded-xl self-start"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-semibold">Nova classificação</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7C3AED" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
          <View
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            style={{ minWidth: tableMinWidth, width: "100%" }}
          >
            <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase flex-[2]">Nome</Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase flex-1">Identificador</Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase w-16 text-center">Ordem</Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase w-24 text-center">Status</Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase w-28 text-center">Uso</Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase w-20 text-right">Ações</Text>
            </View>
            {rows.length === 0 ? (
              <Text className="text-gray-400 p-6">Nenhuma classificação cadastrada.</Text>
            ) : (
              rows.map((row) => (
                <View key={row.id} className="flex-row items-center px-4 py-3 border-b border-gray-50">
                  <Text className="text-sm font-medium text-gray-800 flex-[2]">{row.label}</Text>
                  <Text className="text-xs text-gray-500 flex-1">{row.slug}</Text>
                  <Text className="text-xs text-gray-600 w-16 text-center">{row.sort_order}</Text>
                  <View className="w-24 items-center">
                    <Badge
                      label={row.is_active ? "Ativo" : "Inativo"}
                      tone={row.is_active ? "emerald" : "gray"}
                    />
                  </View>
                  <Text className="text-[10px] text-gray-400 w-28 text-center">
                    S:{row.exams_count ?? 0} · P:{row.past_exams_count ?? 0} · Q:{row.questions_count ?? 0}
                  </Text>
                  <View className="flex-row gap-2 w-20 justify-end">
                    <TouchableOpacity onPress={() => openEdit(row)}>
                      <Ionicons name="pencil-outline" size={18} color="#7C3AED" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeleteId(row.id)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
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
            className="bg-violet-600 px-5 py-2.5 rounded-xl items-center"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-sm font-semibold">Salvar</Text>
            )}
          </TouchableOpacity>
        }
      >
        <View className="gap-3">
          <View>
            <Text className="text-xs font-semibold text-gray-600 mb-1">
              Nome <Text className="text-red-500">*</Text>
            </Text>
            <input
              value={form.label}
              onChange={(e: any) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="Ex.: ENEM"
              style={{ ...fieldStyle, borderColor: errors.label ? "#FCA5A5" : "#E5E7EB" }}
            />
            {errors.label ? <Text className="text-xs text-red-500 mt-1">{errors.label}</Text> : null}
          </View>
          <View>
            <Text className="text-xs font-semibold text-gray-600 mb-1">Identificador (slug)</Text>
            <Text className="text-[10px] text-gray-400 mb-1">Opcional no cadastro; gerado automaticamente a partir do nome.</Text>
            <input
              value={form.slug}
              onChange={(e: any) => setForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="ex.: enem"
              style={fieldStyle}
            />
            {errors.slug ? <Text className="text-xs text-red-500 mt-1">{errors.slug}</Text> : null}
          </View>
          <View>
            <Text className="text-xs font-semibold text-gray-600 mb-1">Ordem de exibição</Text>
            <input
              value={form.sort_order}
              inputMode="numeric"
              onChange={(e: any) =>
                setForm((p) => ({ ...p, sort_order: e.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
              style={fieldStyle}
            />
          </View>
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-gray-700">Ativo nos formulários</Text>
            <Switch value={form.is_active} onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover classificação"
        message="Só é possível remover se não houver simulados, provas anteriores ou questões vinculados. Desative o tipo se ainda estiver em uso."
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
