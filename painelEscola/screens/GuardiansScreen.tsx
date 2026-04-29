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
import {
  useGuardianRelationships,
  domainToOptions,
} from "../hooks/useDomains";

type Guardian = {
  id: number;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  relationship: string | null;
};

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

export default function GuardiansScreen() {
  const [rows, setRows] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const relationships = useGuardianRelationships();
  const relOptions = [
    { value: "", label: "Não informado" },
    ...domainToOptions(relationships),
  ];

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      const { data } = await api.get("/guardians", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setErrors({});
    setModalVisible(true);
  };

  const openEdit = (g: Guardian) => {
    setEditId(g.id);
    setForm({
      name: g.name ?? "",
      document: g.document ?? "",
      email: g.email ?? "",
      phone: g.phone ?? "",
      relationship: g.relationship ?? "",
    });
    setErrors({});
    setModalVisible(true);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = { name: form.name };
      if (form.document) payload.document = form.document;
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.relationship) payload.relationship = form.relationship;

      if (editId) {
        await api.put(`/guardians/${editId}`, payload);
      } else {
        await api.post("/guardians", payload);
      }
      setModalVisible(false);
      fetch();
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
      setDeleteId(null);
      fetch();
    } catch {}
    setDeleting(false);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between mb-6">
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
          style={{ height: 44, maxWidth: 360 }}
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

      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>
            Nome
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>
            E-mail
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>
            Telefone
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>
            Parentesco
          </Text>
          <View style={{ width: 72 }} />
        </View>

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
          rows.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${
                i % 2 === 1 ? "bg-gray-50/40" : ""
              }`}
            >
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-medium text-gray-800">
                  {item.name}
                </Text>
                {item.document && (
                  <Text className="text-xs text-gray-400">{item.document}</Text>
                )}
              </View>
              <Text className="text-sm text-gray-600" style={{ flex: 2 }}>
                {item.email ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {item.phone ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600 capitalize" style={{ flex: 1 }}>
                {item.relationship
                  ? relOptions.find((o) => o.value === item.relationship)?.label ?? item.relationship
                  : "—"}
              </Text>
              <View style={{ width: 72 }} className="flex-row justify-end gap-2">
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  className="p-1.5 bg-violet-50 rounded-lg"
                >
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(item.id)}
                  className="p-1.5 bg-red-50 rounded-lg"
                >
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
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
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
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
              onChangeText={(v) => setForm({ ...form, phone: v })}
              error={errors.phone}
              placeholder="(11) 99999-0000"
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Documento (CPF/RG)"
              value={form.document}
              onChangeText={(v) => setForm({ ...form, document: v })}
              error={errors.document}
              placeholder="000.000.000-00"
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
    </ScrollView>
  );
}
