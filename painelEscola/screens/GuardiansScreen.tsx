import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { parseApiErrors } from "../utils/apiErrors";
import Modal from "../components/ui/Modal";
import FormInput from "../components/ui/FormInput";
import FormSelect from "../components/ui/FormSelect";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import ToastBanner from "../components/ui/ToastBanner";
import GuardianActionsModal, {
  type GuardianActionKey,
} from "../components/guardians/GuardianActionsModal";
import GuardianStudentsModal from "../components/guardians/GuardianStudentsModal";
import {
  useGuardianRelationships,
  domainToOptions,
} from "../hooks/useDomains";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { maskCPF, maskPhone } from "../utils/masks";
import type { GuardianDetail, GuardianListItem } from "../types/guardians";

type Form = {
  name: string;
  document: string;
  email: string;
  phone: string;
  relationship: string;
};

const EMPTY: Form = {
  name: "",
  document: "",
  email: "",
  phone: "",
  relationship: "",
};

const unwrapBody = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { body?: T };
  return (data.body ?? payload) as T;
};

export default function GuardiansScreen() {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<GuardianListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [menuGuardian, setMenuGuardian] = useState<GuardianListItem | null>(null);
  const [studentsModalVisible, setStudentsModalVisible] = useState(false);
  const [studentsDetail, setStudentsDetail] = useState<GuardianDetail | null>(null);
  const [studentsDetailLoading, setStudentsDetailLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({
    visible: false,
    type: "success",
    message: "",
  });

  const relationships = useGuardianRelationships();
  const relOptions = [
    { value: "", label: "Não informado" },
    ...domainToOptions(relationships),
  ];

  const relationshipLabel = (value: string | null | undefined) => {
    if (!value) return "—";
    return relOptions.find((o) => o.value === value)?.label ?? value;
  };

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page };
      if (search) params.search = search;
      const { data } = await api.get("/guardians", { params });
      setRows(Array.isArray(data.data) ? data.data : []);
      setMeta(
        data.meta ?? {
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: 0,
        }
      );
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [page, search]);

  const fetchStudentsDetail = useCallback(async (id: number) => {
    setStudentsDetailLoading(true);
    try {
      const { data } = await api.get(`/guardians/${id}`);
      const body = unwrapBody<GuardianDetail>(data);
      if (body?.id) {
        setStudentsDetail({
          ...body,
          students: Array.isArray(body.students) ? body.students : [],
        });
      } else {
        setStudentsDetail(null);
      }
    } catch {
      setStudentsDetail(null);
    }
    setStudentsDetailLoading(false);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const refreshStudentsModalIfOpen = async (guardianId?: number | null) => {
    if (studentsModalVisible && guardianId && studentsDetail?.id === guardianId) {
      await fetchStudentsDetail(guardianId);
    }
  };

  const refreshAfterMutation = async (guardianId?: number | null) => {
    await fetchList();
    await refreshStudentsModalIfOpen(guardianId);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setErrors({});
    setModalVisible(true);
  };

  const openEdit = (g: GuardianListItem | GuardianDetail) => {
    setEditId(g.id);
    setForm({
      name: g.name ?? "",
      document: maskCPF(g.document ?? ""),
      email: g.email ?? "",
      phone: maskPhone(g.phone ?? ""),
      relationship: g.relationship ?? "",
    });
    setErrors({});
    setModalVisible(true);
  };

  const handleMenuAction = async (action: GuardianActionKey) => {
    if (!menuGuardian) return;
    const g = menuGuardian;

    if (action === "view_students") {
      setStudentsDetail(null);
      setStudentsModalVisible(true);
      await fetchStudentsDetail(g.id);
    } else if (action === "edit") {
      openEdit(g);
    } else if (action === "delete") {
      setDeleteId(g.id);
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, string> = { name: form.name };
      if (form.document) payload.document = form.document.replace(/\D/g, "");
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone.replace(/\D/g, "");
      if (form.relationship) payload.relationship = form.relationship;

      if (editId) {
        await api.put(`/guardians/${editId}`, payload);
      } else {
        await api.post("/guardians", payload);
      }
      setModalVisible(false);
      await refreshAfterMutation(editId);
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data.errors ?? {}));
      }
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/guardians/${deleteId}`);
      if (studentsDetail?.id === deleteId) {
        setStudentsModalVisible(false);
        setStudentsDetail(null);
      }
      setDeleteId(null);
      setToast({
        visible: true,
        type: "success",
        message: "Responsável excluído com sucesso.",
      });
      await fetchList();
    } catch (e: any) {
      setDeleteId(null);
      setToast({
        visible: true,
        type: "error",
        message:
          e?.response?.data?.message ||
          "Não foi possível excluir o responsável.",
      });
    }
    setDeleting(false);
  };

  const renderMenuButton = (item: GuardianListItem) => (
    <TouchableOpacity
      onPress={() => setMenuGuardian(item)}
      className="p-1.5 rounded-lg bg-gray-50 border border-gray-100"
      accessibilityLabel="Abrir opções"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color="#6B7280" />
    </TouchableOpacity>
  );

  const renderRow = (item: GuardianListItem, i: number) => {
    if (isMobile) {
      return (
        <View
          key={item.id}
          className="bg-white border border-gray-200 rounded-xl p-3"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 1,
          }}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View style={{ flex: 1 }}>
              <Text className="text-sm font-semibold text-gray-800">{item.name}</Text>
              {item.document ? (
                <Text className="text-xs text-gray-400 mt-0.5">
                  {maskCPF(item.document)}
                </Text>
              ) : null}
            </View>
            {renderMenuButton(item)}
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
            <Text className="text-xs text-gray-500">E-mail: {item.email ?? "—"}</Text>
            <Text className="text-xs text-gray-500">
              Telefone: {item.phone ? maskPhone(item.phone) : "—"}
            </Text>
            <Text className="text-xs text-gray-500">
              Parentesco: {relationshipLabel(item.relationship)}
            </Text>
            <Text className="text-xs text-gray-500">
              Alunos: {item.students_count ?? 0}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View
        key={item.id}
        className={`flex-row items-center px-3 py-2 border-b border-gray-50 ${
          i % 2 === 1 ? "bg-gray-50/40" : ""
        }`}
      >
        <View style={{ flex: 2 }}>
          <Text className="text-xs font-medium text-gray-800">{item.name}</Text>
          {item.document ? (
            <Text className="text-[11px] text-gray-400">{maskCPF(item.document)}</Text>
          ) : null}
        </View>
        <Text className="text-xs text-gray-600" style={{ flex: 2 }}>
          {item.email ?? "—"}
        </Text>
        <Text className="text-xs text-gray-600" style={{ flex: 1 }}>
          {item.phone ? maskPhone(item.phone) : "—"}
        </Text>
        <Text className="text-xs text-gray-600" style={{ flex: 1 }}>
          {relationshipLabel(item.relationship)}
        </Text>
        <Text
          className="text-xs font-medium text-violet-700 text-center"
          style={{ width: 48 }}
        >
          {item.students_count ?? 0}
        </Text>
        <View style={{ width: 44 }} className="items-end">
          {renderMenuButton(item)}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      <View
        className="mb-6"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-800">Responsáveis</Text>
          <Text className="text-sm text-gray-500">
            Pais e responsáveis pelos alunos
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo Responsável
          </Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4">
        <View
          className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
          style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
        >
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 ml-2 text-sm text-gray-800"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal={!isMobile}
        showsHorizontalScrollIndicator={!isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: "100%" }}
      >
        <View
          className={isMobile ? "gap-3" : "bg-white rounded-2xl overflow-hidden"}
          style={{
            width: "100%",
            minWidth: isMobile ? undefined : tableMinWidth,
            shadowColor: isMobile ? undefined : "#000",
            shadowOpacity: isMobile ? undefined : 0.05,
            shadowRadius: isMobile ? undefined : 10,
            elevation: isMobile ? undefined : 2,
          }}
        >
          {!isMobile && (
            <View className="flex-row bg-gray-50 border-b border-gray-100 px-3 py-2">
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 2 }}
              >
                Nome
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 2 }}
              >
                E-mail
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 1 }}
              >
                Telefone
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 1 }}
              >
                Parentesco
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center"
                style={{ width: 48 }}
              >
                Alunos
              </Text>
              <View style={{ width: 44 }} />
            </View>
          )}

          {loading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center justify-center py-16">
              <Ionicons name="person-outline" size={40} color="#E5E7EB" />
              <Text className="text-gray-400 mt-3 text-sm">
                Nenhum responsável encontrado
              </Text>
            </View>
          ) : (
            rows.map((item, i) => renderRow(item, i))
          )}

          {meta.total > 0 && (
            <View className="px-4 border-t border-gray-100">
              <Pagination
                currentPage={meta.current_page}
                lastPage={meta.last_page}
                total={meta.total}
                perPage={meta.per_page}
                onPageChange={setPage}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <GuardianActionsModal
        visible={menuGuardian !== null}
        guardian={menuGuardian}
        onClose={() => setMenuGuardian(null)}
        onSelect={handleMenuAction}
      />

      <GuardianStudentsModal
        visible={studentsModalVisible}
        guardian={studentsDetail}
        loading={studentsDetailLoading}
        onClose={() => {
          setStudentsModalVisible(false);
          setStudentsDetail(null);
        }}
      />

      <Modal
        visible={modalVisible}
        title={editId ? "Editar Responsável" : "Novo Responsável"}
        onClose={() => setModalVisible(false)}
        footer={
          <>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              {saving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <FormInput
          label="Nome"
          required
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
          error={errors.name}
          placeholder="Nome completo"
        />
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="E-mail"
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              error={errors.email}
              placeholder="email@exemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Telefone"
              value={form.phone}
              onChangeText={(v) => setForm({ ...form, phone: maskPhone(v) })}
              error={errors.phone}
              placeholder="(11) 99999-0000"
              keyboardType="phone-pad"
              maxLength={16}
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Documento (CPF/RG)"
              value={form.document}
              onChangeText={(v) => setForm({ ...form, document: maskCPF(v) })}
              error={errors.document}
              placeholder="000.000.000-00"
              keyboardType="numeric"
              maxLength={14}
            />
          </View>
          <View className="flex-1">
            <FormSelect
              label="Parentesco"
              value={form.relationship}
              options={relOptions}
              onChange={(v) => setForm({ ...form, relationship: v })}
              error={errors.relationship}
            />
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Responsável"
        message="Esta ação não pode ser desfeita."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </ScrollView>
  );
}
