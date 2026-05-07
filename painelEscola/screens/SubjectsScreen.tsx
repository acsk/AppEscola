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
import {
  Calculator, BookOpen, FlaskConical, Landmark, Globe,
  Dumbbell, Languages, Atom, Music, Palette, Code2,
  Brain, BookMarked, GraduationCap, Microscope, Earth,
  Lightbulb, PenLine, Sigma,
} from "lucide-react-native";
import api from "../services/api";
import { parseApiErrors } from "../utils/apiErrors";
import Modal from "../components/ui/Modal";
import FormInput from "../components/ui/FormInput";
import FormSelect from "../components/ui/FormSelect";
import Badge from "../components/ui/Badge";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

// ── Icon registry ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  calculator: Calculator,
  "book-open": BookOpen,
  "flask-conical": FlaskConical,
  landmark: Landmark,
  globe: Globe,
  dumbbell: Dumbbell,
  languages: Languages,
  atom: Atom,
  music: Music,
  palette: Palette,
  code2: Code2,
  brain: Brain,
  "book-marked": BookMarked,
  "graduation-cap": GraduationCap,
  microscope: Microscope,
  earth: Earth,
  lightbulb: Lightbulb,
  "pen-line": PenLine,
  sigma: Sigma,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const COLOR_PRESETS = [
  "#3B82F6", "#10B981", "#EF4444", "#F97316",
  "#8B5CF6", "#EC4899", "#EAB308", "#14B8A6",
  "#6366F1", "#84CC16", "#F43F5E", "#64748B",
];

function SubjectIcon({
  icon,
  color,
  size = 20,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
}) {
  const bg = color ?? "#8B5CF6";
  const IconComp = icon ? ICON_MAP[icon] : null;
  return (
    <View
      style={{
        width: size + 16,
        height: size + 16,
        borderRadius: 10,
        backgroundColor: bg + "22",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {IconComp ? (
        <IconComp size={size} color={bg} strokeWidth={2} />
      ) : (
        <Ionicons name="book-outline" size={size} color={bg} />
      )}
    </View>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

type Subject = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: string;
};

type Form = { name: string; description: string; icon: string; color: string; status: string };
const EMPTY: Form = { name: "", description: "", icon: "", color: "#8B5CF6", status: "active" };
const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

export default function SubjectsScreen() {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
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
    setForm({ name: s.name, description: s.description ?? "", icon: s.icon ?? "", color: s.color ?? "#8B5CF6", status: s.status });
    setErrors({});
    setModalVisible(true);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = { name: form.name, status: form.status };
      if (form.description) payload.description = form.description;
      if (form.icon) payload.icon = form.icon;
      if (form.color) payload.color = form.color;
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
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Disciplinas</Text>
          <Text className="text-sm text-gray-500">Matérias lecionadas no cursinho</Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl" activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova Disciplina</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4" style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar disciplina..." placeholderTextColor="#9CA3AF" className="flex-1 ml-2 text-sm text-gray-800" />
          {!!search && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={16} color="#9CA3AF" /></TouchableOpacity>}
        </View>
        <select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "0 14px", fontSize: 14, color: "#374151", backgroundColor: "white", height: 44, minWidth: isMobile ? "100%" : 160 }}>
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
      <View className="bg-white rounded-2xl overflow-hidden" style={{ minWidth: tableMinWidth, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 3 }}>Nome</Text>
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
              <View className="flex-row items-center gap-3" style={{ flex: 3 }}>
                <SubjectIcon icon={item.icon} color={item.color} size={18} />
                <Text className="text-sm font-medium text-gray-800">{item.name}</Text>
              </View>
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
      </ScrollView>

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

        {/* Ícone */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">Ícone</Text>
          <View className="flex-row flex-wrap gap-2">
            {ICON_OPTIONS.map((key) => {
              const IconComp = ICON_MAP[key];
              const active = form.icon === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setForm({ ...form, icon: active ? "" : key })}
                  activeOpacity={0.7}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? (form.color || "#8B5CF6") + "22" : "#F3F4F6",
                    borderWidth: 2,
                    borderColor: active ? (form.color || "#8B5CF6") : "transparent",
                  }}
                >
                  <IconComp
                    size={20}
                    color={active ? (form.color || "#8B5CF6") : "#9CA3AF"}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          {errors.icon && <Text className="text-xs text-red-500 mt-1">{errors.icon}</Text>}
        </View>

        {/* Cor */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">Cor</Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {COLOR_PRESETS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setForm({ ...form, color: c })}
                activeOpacity={0.8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: c,
                  borderWidth: 3,
                  borderColor: form.color === c ? "#1F2937" : "transparent",
                }}
              />
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: form.color || "#8B5CF6",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            />
            <TextInput
              value={form.color}
              onChangeText={(v) => setForm({ ...form, color: v })}
              placeholder="#RRGGBB"
              placeholderTextColor="#9CA3AF"
              maxLength={9}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-gray-50"
              style={{ width: 110 }}
            />
          </View>
          {errors.color && <Text className="text-xs text-red-500 mt-1">{errors.color}</Text>}
        </View>

        <FormSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => setForm({ ...form, status: v })} error={errors.status} />
      </Modal>

      <ConfirmModal visible={!!deleteId} title="Excluir Disciplina" message="Esta ação não pode ser desfeita." onConfirm={remove} onCancel={() => setDeleteId(null)} loading={deleting} />
    </ScrollView>
  );
}
