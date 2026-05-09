import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import ToastBanner from "../../components/ui/ToastBanner";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

// ── Constants ─────────────────────────────────────────────────────────────────

const BILLING_CYCLES = [
  { value: "monthly", label: "Mensal", months: 1 },
  { value: "bimonthly", label: "Bimestral", months: 2 },
  { value: "quadrimestral", label: "Quadrimestral", months: 4 },
  { value: "semiannual", label: "Semestral", months: 6 },
  { value: "annual", label: "Anual", months: 12 },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Types ─────────────────────────────────────────────────────────────────────

type CourseOption = { id: number; name: string };

type BundleForm = {
  name: string;
  description: string;
  billing_cycle: string;
  price: string;
  status: string;
  course_ids: number[];
};

const EMPTY: BundleForm = {
  name: "",
  description: "",
  billing_cycle: "monthly",
  price: "",
  status: "active",
  course_ids: [],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  bundleId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BundleFormScreen({ bundleId, navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const isEdit = bundleId !== null;
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BundleForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({
    visible: false,
    type: "success",
    message: "",
  });
  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Load active courses for multi-select
  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", {
        params: { status: "active", per_page: 999 },
      });
      setCourseOptions(data.data ?? []);
    } catch {}
  }, []);

  // Load bundle data if editing
  useEffect(() => {
    fetchCourses();
    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/course-bundles/${bundleId}`);
        const bundle = data.body ?? data.data ?? data;
        setForm({
          name: bundle.name ?? "",
          description: bundle.description ?? "",
          billing_cycle: bundle.billing_cycle ?? "monthly",
          price: bundle.price ?? "",
          status: bundle.status ?? "active",
          course_ids: (bundle.courses ?? []).map((c: CourseOption) => c.id),
        });
      } catch {}
      setLoading(false);
    })();
  }, [bundleId]);

  const monthsForCycle = (cycle: string) =>
    BILLING_CYCLES.find((c) => c.value === cycle)?.months ?? 1;

  const monthlyEquivalent = () => {
    const price = parseFloat(form.price.replace(",", "."));
    if (isNaN(price) || price <= 0) return null;
    return price / monthsForCycle(form.billing_cycle);
  };

  const toggleCourse = (id: number) => {
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(id)
        ? prev.course_ids.filter((c) => c !== id)
        : [...prev.course_ids, id],
    }));
  };

  const save = async () => {
    const localErrors: Record<string, string> = {};
    if (!form.name.trim()) localErrors.name = "Nome é obrigatório.";
    if (!form.price.trim()) localErrors.price = "Preço é obrigatório.";
    else if (isNaN(parseFloat(form.price.replace(",", "."))))
      localErrors.price = "Preço inválido.";
    if (form.course_ids.length < 2)
      localErrors.course_ids = "Selecione pelo menos 2 cursos.";

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = {
        name: form.name,
        billing_cycle: form.billing_cycle,
        price: parseFloat(form.price.replace(",", ".")),
        status: form.status,
        course_ids: form.course_ids,
      };
      if (form.description.trim()) payload.description = form.description;

      if (isEdit) {
        const { data } = await api.put(`/course-bundles/${bundleId}`, payload);
        const bundle = data.body ?? data.data ?? data;
        setForm({
          name: bundle.name ?? form.name,
          description: bundle.description ?? "",
          billing_cycle: bundle.billing_cycle ?? form.billing_cycle,
          price: bundle.price != null ? String(bundle.price) : form.price,
          status: bundle.status ?? form.status,
          course_ids: (bundle.courses ?? []).map((c: CourseOption) => c.id),
        });
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Operacao realizada com sucesso.",
        });
        setTimeout(() => {
          navigate("pacotes");
        }, 1800);
      } else {
        const { data } = await api.post("/course-bundles", payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Pacote criado com sucesso.",
        });
        setTimeout(() => {
          navigate("pacotes");
        }, 1800);
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data.errors ?? {}));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        setToast({
          visible: true,
          type: "error",
          message:
            e?.response?.data?.message || "Nao foi possivel salvar o pacote.",
        });
      }
    }
    setSaving(false);
  };

  const monthly = monthlyEquivalent();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
      {/* Breadcrumb */}
      <View className="flex-row items-center gap-2 mb-6">
        <TouchableOpacity
          onPress={() => navigate("pacotes")}
          className="flex-row items-center gap-1.5"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Pacotes</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">
          {isEdit ? "Editar Pacote" : "Novo Pacote"}
        </Text>
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">
          {isEdit ? "Editar Pacote" : "Novo Pacote"}
        </Text>
        <Text className="text-sm text-gray-500">
          Agrupe 2 ou mais cursos com cobrança unificada
        </Text>
      </View>

      {loading ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <View>
          {/* ── Card: Dados do Pacote ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
                <Ionicons name="albums-outline" size={16} color="#7C3AED" />
              </View>
              <Text className="text-base font-semibold text-gray-800">
                Dados do Pacote
              </Text>
            </View>

            <FormInput
              label="Nome do pacote"
              required
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              error={errors.name}
              placeholder="Ex: CPM Completo"
            />

            <View className="mt-1">
              <FormInput
                label="Descrição"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                error={errors.description}
                placeholder="Breve descrição do pacote"
              />
            </View>

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 mb-1.5">
                  Ciclo de Cobrança <Text className="text-red-500">*</Text>
                </Text>
                <select
                  value={form.billing_cycle}
                  onChange={(e: any) =>
                    setForm({ ...form, billing_cycle: e.target.value })
                  }
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: "#374151",
                    backgroundColor: "white",
                  }}
                >
                  {BILLING_CYCLES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </View>
              <View className="flex-1">
                <FormInput
                  label="Preço total do ciclo (R$)"
                  required
                  value={form.price}
                  onChangeText={(v) => setForm({ ...form, price: v })}
                  error={errors.price}
                  placeholder="Ex: 900.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {monthly !== null && (
              <View className="flex-row items-center gap-2 bg-violet-50 rounded-lg px-3 py-2 mt-2">
                <Ionicons name="trending-down-outline" size={14} color="#7C3AED" />
                <Text className="text-xs text-violet-600">
                  Equivalente a{" "}
                  <Text className="font-bold">{fmtBRL(monthly)}/mês</Text> por
                  aluno
                </Text>
              </View>
            )}

            <View className="mt-3">
              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                Status
              </Text>
              <select
                value={form.status}
                onChange={(e: any) =>
                  setForm({ ...form, status: e.target.value })
                }
                style={{
                  width: "100%",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontSize: 14,
                  color: "#374151",
                  backgroundColor: "white",
                }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </View>
          </View>

          {/* ── Card: Cursos do Pacote ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 mb-1">
              <View className="w-8 h-8 bg-amber-100 rounded-lg items-center justify-center">
                <Ionicons name="book-outline" size={16} color="#D97706" />
              </View>
              <Text className="text-base font-semibold text-gray-800">
                Cursos do Pacote
              </Text>
            </View>
            <Text className="text-xs text-gray-400 mb-4">
              Selecione no mínimo 2 cursos
            </Text>

            {errors.course_ids && (
              <View className="flex-row items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text className="text-xs text-red-600">{errors.course_ids}</Text>
              </View>
            )}

            {courseOptions.length === 0 ? (
              <View className="items-center py-8">
                <Ionicons name="book-outline" size={32} color="#E5E7EB" />
                <Text className="text-gray-400 text-sm mt-2">
                  Nenhum curso ativo disponível
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {courseOptions.map((course) => {
                  const selected = form.course_ids.includes(course.id);
                  return (
                    <TouchableOpacity
                      key={course.id}
                      onPress={() => toggleCourse(course.id)}
                      activeOpacity={0.7}
                      className={`flex-row items-center gap-3 px-4 py-3 rounded-xl border ${
                        selected
                          ? "bg-violet-50 border-violet-200"
                          : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={20}
                        color={selected ? "#7C3AED" : "#9CA3AF"}
                      />
                      <Text
                        className={`text-sm font-medium ${
                          selected ? "text-violet-700" : "text-gray-700"
                        }`}
                      >
                        {course.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {form.course_ids.length > 0 && (
              <View className="flex-row items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mt-3">
                <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                <Text className="text-xs text-green-600">
                  {form.course_ids.length} curso
                  {form.course_ids.length !== 1 ? "s" : ""} selecionado
                  {form.course_ids.length !== 1 ? "s" : ""}
                  {form.course_ids.length < 2 ? " — selecione mais 1" : ""}
                </Text>
              </View>
            )}
          </View>

          {/* ── Action bar ── */}
          <View className="flex-row justify-end gap-3 mt-2">
            <TouchableOpacity
              onPress={() => navigate("pacotes")}
              className="px-6 py-3 rounded-xl border border-gray-200 bg-white"
              activeOpacity={0.8}
            >
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              className="flex-row items-center gap-2 px-8 py-3 rounded-xl bg-violet-600"
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="white" />
                  <Text className="text-sm font-bold text-white">
                    {isEdit ? "Salvar Alterações" : "Cadastrar Pacote"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
      </ScrollView>

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </View>
  );
}
