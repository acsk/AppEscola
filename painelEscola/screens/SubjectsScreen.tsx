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
import Badge from "../components/ui/Badge";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";

type Subject = {
  id: number;
  name: string;
  description: string | null;
  status: string;
};

type Form = { name: string; description: string; status: string };
const EMPTY: Form = { name: "", description: "", status: "active" };
const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

export default function SubjectsScreen() {
  const [rows, setRows] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/subjects", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setErrors({}); setModalVisible(true); };
  const openEdit = (s: Subject) => {
    setEditId(s.id);
    setForm({ name: s.name, description: s.description ?? "", status: s.status });
    setErrors({});
    setModalVisible(true);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = { name: form.name, status: form.status };
      if (form.description) payload.description = form.description;
      if (editId) {
        await api.put(`/subjects/${editId}`, payload);
      } else {
        await api.post("/subjects", payload);
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
    try { await api.delete(`/subjects/${deleteId}`); setDeleteId(null); fetch(); } catch {}
    setDeleting(false);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Disciplinas</Text>
          <Text className="text-sm text-gray-500">Matérias lecionadas no cursinho</Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl" activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova Disciplina</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row gap-3 mb-4">
        <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4" style={{ height: 44, maxWidth: 360 }}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar disciplina..." placeholderTextColor="#9CA3AF" className="flex-1 ml-2 text-sm text-gray-800" />
          {!!search && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={16} color="#9CA3AF" /></TouchableOpacity>}
        </View>
        <select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "0 14px", fontSize: 14, color: "#374151", backgroundColor: "white", height: 44, minWidth: 160 }}>
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </View>

      <View className="bg-white rounded-2xl overflow-hidden" style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Nome</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 3 }}>Descrição</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Status</Text>
          <View style={{ width: 72 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20"><ActivityIndicator size="large" color="#7C3AED" /></View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="library-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">Nenhuma disciplina encontrada</Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <View key={item.id} className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
              <Text className="text-sm font-medium text-gray-800" style={{ flex: 2 }}>{item.name}</Text>
              <Text className="text-sm text-gray-600" style={{ flex: 3 }} numberOfLines={1}>{item.description ?? "—"}</Text>
              <View style={{ flex: 1 }}>
                <Badge slug={item.status} label={item.status === "active" ? "Ativo" : "Inativo"} />
              </View>
              <View style={{ width: 72 }} className="flex-row justify-end gap-2">
                <TouchableOpacity onPress={() => openEdit(item)} className="p-1.5 bg-violet-50 rounded-lg">
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteId(item.id)} className="p-1.5 bg-red-50 rounded-lg">
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-gray-100">
            <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
          </View>
        )}
      </View>

      <Modal visible={modalVisible} title={editId ? "Editar Disciplina" : "Nova Disciplina"} onClose={() => setModalVisible(false)} size="sm"
        footer={
          <>
            <TouchableOpacity onPress={() => setModalVisible(false)} className="px-5 py-2.5 rounded-xl border border-gray-200">
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-violet-600">
              {saving ? <ActivityIndicator color="white" size="small" /> : <Text className="text-sm font-bold text-white">Salvar</Text>}
            </TouchableOpacity>
          </>
        }
      >
        <FormInput label="Nome" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Ex: Matemática" />
        <FormInput label="Descrição" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} error={errors.description} placeholder="Descrição da disciplina" />
        <FormSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => setForm({ ...form, status: v })} error={errors.status} />
      </Modal>

      <ConfirmModal visible={!!deleteId} title="Excluir Disciplina" message="Esta ação não pode ser desfeita." onConfirm={remove} onCancel={() => setDeleteId(null)} loading={deleting} />
    </ScrollView>
  );
}
