import React, { useState, useEffect, useCallback } from "react";
import {
  Modal as RNModal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
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
import DataTableRow from "../components/ui/DataTableRow";
import {
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../components/ui/dataTableStyles";

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
const ICON_LABELS: Record<string, string> = {
  calculator: "Calculadora",
  "book-open": "Livro aberto",
  "flask-conical": "Frasco",
  landmark: "Colunas",
  globe: "Globo",
  dumbbell: "Halter",
  languages: "Idiomas",
  atom: "Atomo",
  music: "Musica",
  palette: "Paleta",
  code2: "Codigo",
  brain: "Cerebro",
  "book-marked": "Livro marcado",
  "graduation-cap": "Capelo",
  microscope: "Microscopio",
  earth: "Terra",
  lightbulb: "Lampada",
  "pen-line": "Caneta",
  sigma: "Sigma",
};

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

function PickerField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text className="text-sm font-semibold text-gray-700 mb-2">{label}</Text>
      <View className="border border-gray-200 rounded-2xl bg-white relative">
        {children}
      </View>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
    </View>
  );
}

function DropdownTrigger({
  open,
  onPress,
  triggerRef,
  children,
}: {
  open: boolean;
  onPress: () => void;
  triggerRef: React.RefObject<View | null>;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      ref={triggerRef as any}
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100"
    >
      <View style={{ flex: 1 }}>{children}</View>
      <Ionicons
        name={open ? "chevron-up" : "chevron-down"}
        size={18}
        color="#6B7280"
      />
    </TouchableOpacity>
  );
}

function IconDropdownPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (next: string) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const triggerRef = React.useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const measureTrigger = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
    });
  };

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const menuHeight = 220 + 54;
  const openUp = anchor.y + anchor.h + menuHeight > screenHeight - 12;
  const top = openUp ? Math.max(12, anchor.y - menuHeight - 6) : anchor.y + anchor.h + 6;
  const left = Math.max(12, Math.min(anchor.x, screenWidth - anchor.w - 12));

  return (
    <>
      <DropdownTrigger
        open={open}
        onPress={() => {
          if (!open) measureTrigger();
          setOpen((prev) => !prev);
        }}
        triggerRef={triggerRef}
      >
        <View className="flex-row items-center gap-3">
          <SubjectIcon icon={value || null} color={color || null} size={18} />
          <View>
            <Text className="text-sm font-medium text-gray-800">
              {value ? ICON_LABELS[value] ?? value : "Sem ícone selecionado"}
            </Text>
            <Text className="text-xs text-gray-500">Selecione um ícone</Text>
          </View>
        </View>
      </DropdownTrigger>

      {open && (
        <RNModal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: "transparent" }}
          >
            <View
              style={{
                position: "absolute",
                top,
                left,
                width: Math.max(260, anchor.w),
                zIndex: 9999,
                elevation: 30,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 18,
              }}
            >
              <ScrollView
                style={{ maxHeight: 220 }}
                showsVerticalScrollIndicator
                persistentScrollbar
              >
                <TouchableOpacity
                  onPress={() => handleSelect("")}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-50"
                  style={{ backgroundColor: !value ? "#F5F3FF" : "white" }}
                >
                  <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100">
                    <Ionicons name="close-outline" size={18} color="#9CA3AF" />
                  </View>
                  <Text className="text-sm font-medium text-gray-700">Sem ícone</Text>
                </TouchableOpacity>
                {ICON_OPTIONS.map((key) => {
                  const selected = value === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleSelect(key)}
                      activeOpacity={0.7}
                      className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-50"
                      style={{ backgroundColor: selected ? "#F5F3FF" : "white" }}
                    >
                      <SubjectIcon icon={key} color={color} size={18} />
                      <Text
                        className="text-sm"
                        style={{ color: selected ? "#5B21B6" : "#374151", fontWeight: selected ? "600" : "500" }}
                      >
                        {ICON_LABELS[key] ?? key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </RNModal>
      )}
    </>
  );
}

function ColorDropdownPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const triggerRef = React.useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const measureTrigger = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
    });
  };

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const menuHeight = 220 + 54;
  const openUp = anchor.y + anchor.h + menuHeight > screenHeight - 12;
  const top = openUp ? Math.max(12, anchor.y - menuHeight - 6) : anchor.y + anchor.h + 6;
  const left = Math.max(12, Math.min(anchor.x, screenWidth - anchor.w - 12));

  return (
    <>
      <DropdownTrigger
        open={open}
        onPress={() => {
          if (!open) measureTrigger();
          setOpen((prev) => !prev);
        }}
        triggerRef={triggerRef}
      >
        <View className="flex-row items-center gap-3">
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: value || "#8B5CF6",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          />
          <View>
            <Text className="text-sm font-medium text-gray-800">{value}</Text>
            <Text className="text-xs text-gray-500">Selecione uma cor</Text>
          </View>
        </View>
      </DropdownTrigger>

      {open && (
        <RNModal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: "transparent" }}
          >
            <View
              style={{
                position: "absolute",
                top,
                left,
                width: Math.max(260, anchor.w),
                zIndex: 9999,
                elevation: 30,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 18,
              }}
            >
              <ScrollView
                style={{ maxHeight: 220 }}
                showsVerticalScrollIndicator
                persistentScrollbar
              >
                {COLOR_PRESETS.map((colorOption) => {
                  const selected = value === colorOption;
                  return (
                    <TouchableOpacity
                      key={colorOption}
                      onPress={() => handleSelect(colorOption)}
                      activeOpacity={0.7}
                      className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-50"
                      style={{ backgroundColor: selected ? "#F5F3FF" : "white" }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: colorOption,
                          borderWidth: 2,
                          borderColor: selected ? "#1F2937" : "#E5E7EB",
                        }}
                      />
                      <Text
                        className="text-sm"
                        style={{ color: selected ? "#5B21B6" : "#374151", fontWeight: selected ? "600" : "500" }}
                      >
                        {colorOption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </RNModal>
      )}
    </>
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View className="bg-white rounded-2xl overflow-hidden" style={{ width: "100%", minWidth: tableMinWidth, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 3 }}>Nome</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 3 }}>Descrição</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Status</Text>
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
            <DataTableRow key={item.id} index={i}>
              <View className="flex-row items-center gap-3" style={{ flex: 3 }}>
                <SubjectIcon icon={item.icon} color={item.color} size={18} />
                <Text className={TABLE_CELL_SEMIBOLD}>{item.name}</Text>
              </View>
              <Text className={TABLE_CELL_MUTED} style={{ flex: 3 }} numberOfLines={1}>{item.description ?? "—"}</Text>
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
            </DataTableRow>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-gray-100">
            <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
          </View>
        )}
      </View>
      </ScrollView>

      <Modal visible={modalVisible} title={editId ? "Editar Disciplina" : "Nova Disciplina"} onClose={() => setModalVisible(false)} size="lg"
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

        <View className="flex-row gap-4 mb-4">
          <PickerField label="Ícone" error={errors.icon}>
            <IconDropdownPicker
              value={form.icon}
              color={form.color}
              onChange={(next: string) => setForm({ ...form, icon: next })}
            />
          </PickerField>

          <PickerField label="Cor" error={errors.color}>
            <ColorDropdownPicker
              value={form.color}
              onChange={(next: string) => setForm({ ...form, color: next })}
            />
          </PickerField>
        </View>

        <FormSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => setForm({ ...form, status: v })} error={errors.status} />
      </Modal>

      <ConfirmModal visible={!!deleteId} title="Excluir Disciplina" message="Esta ação não pode ser desfeita." onConfirm={remove} onCancel={() => setDeleteId(null)} loading={deleting} />
    </ScrollView>
  );
}
