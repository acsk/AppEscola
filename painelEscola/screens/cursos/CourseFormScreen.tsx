import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
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

type CourseForm = {
  name: string;
  description: string;
  status: string;
};

type Plan = {
  id: number;
  name: string;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  enrollment_fee_amount?: string;
  monthly_equivalent: number;
  status: string;
};

type PlanForm = {
  name: string;
  billing_cycle: string;
  price: string;
  enrollment_fee_amount: string;
  status: string;
};

const EMPTY_COURSE: CourseForm = { name: "", description: "", status: "active" };
const EMPTY_PLAN: PlanForm = {
  name: "",
  billing_cycle: "monthly",
  price: "",
  enrollment_fee_amount: "",
  status: "active",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  courseId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CourseFormScreen({ courseId, navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const isEdit = courseId !== null;
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CourseForm>(EMPTY_COURSE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({
    visible: false,
    type: "success",
    message: "",
  });

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [editPlanId, setEditPlanId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);

  // Load course data if editing
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/courses/${courseId}`);
        const c = data.body ?? data.data ?? data;
        setForm({
          name: c.name ?? "",
          description: c.description ?? "",
          status: c.status ?? "active",
        });
      } catch {}
      setLoading(false);
    })();
  }, [courseId]);

  // Load plans when editing
  const fetchPlans = useCallback(async () => {
    if (!isEdit || !courseId) return;
    setLoadingPlans(true);
    try {
      const { data } = await api.get(`/courses/${courseId}/plans`);
      const plansData = data.body ?? data.data ?? data;
      setPlans(Array.isArray(plansData) ? plansData : Array.isArray(plansData?.data) ? plansData.data : []);
    } catch {}
    setLoadingPlans(false);
  }, [courseId, isEdit]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Save course
  const save = async () => {
    const localErrors: Record<string, string> = {};
    if (!form.name.trim()) localErrors.name = "Nome é obrigatório.";
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
        status: form.status,
      };
      if (form.description.trim()) payload.description = form.description;

      if (isEdit) {
        const { data } = await api.put(`/courses/${courseId}`, payload);
        const updated = data.body ?? data.data ?? data;
        setForm({
          name: updated.name ?? form.name,
          description: updated.description ?? "",
          status: updated.status ?? form.status,
        });
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Operacao realizada com sucesso.",
        });
        setTimeout(() => {
          navigate("cursos");
        }, 1800);
      } else {
        const { data } = await api.post("/courses", payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Curso criado com sucesso.",
        });
        setTimeout(() => {
          navigate("cursos");
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
            e?.response?.data?.message || "Nao foi possivel salvar o curso.",
        });
      }
    }
    setSaving(false);
  };

  // Plan helpers
  const monthsForCycle = (cycle: string) =>
    BILLING_CYCLES.find((c) => c.value === cycle)?.months ?? 1;

  const planMonthlyEquivalent = () => {
    const price = parseFloat(planForm.price.replace(",", "."));
    if (isNaN(price) || price <= 0) return null;
    const months = monthsForCycle(planForm.billing_cycle);
    return price / months;
  };

  const openCreatePlan = () => {
    setEditPlanId(null);
    setPlanForm(EMPTY_PLAN);
    setPlanErrors({});
    setPlanModal(true);
  };

  const openEditPlan = (plan: Plan) => {
    setEditPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      billing_cycle: plan.billing_cycle,
      price: plan.price,
      enrollment_fee_amount: plan.enrollment_fee_amount ?? "",
      status: plan.status,
    });
    setPlanErrors({});
    setPlanModal(true);
  };

  const savePlan = async () => {
    const localErrors: Record<string, string> = {};
    if (!planForm.name.trim()) localErrors.name = "Nome é obrigatório.";
    if (!planForm.price.trim()) localErrors.price = "Preço é obrigatório.";
    else if (isNaN(parseFloat(planForm.price.replace(",", "."))))
      localErrors.price = "Preço inválido.";
    if (Object.keys(localErrors).length > 0) {
      setPlanErrors(localErrors);
      return;
    }

    setSavingPlan(true);
    setPlanErrors({});
    try {
      const payload = {
        name: planForm.name,
        billing_cycle: planForm.billing_cycle,
        price: parseFloat(planForm.price.replace(",", ".")),
        enrollment_fee_amount: planForm.enrollment_fee_amount.trim()
          ? parseFloat(planForm.enrollment_fee_amount.replace(",", "."))
          : undefined,
        status: planForm.status,
      };
      if (editPlanId) {
        const { data } = await api.put(`/course-plans/${editPlanId}`, payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Operacao realizada com sucesso.",
        });
      } else {
        const { data } = await api.post(`/courses/${courseId}/plans`, payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Operacao realizada com sucesso.",
        });
      }
      setPlanModal(false);
      fetchPlans();
    } catch (e: any) {
      if (e.response?.status === 422) {
        setPlanErrors(parseApiErrors(e.response.data.errors ?? {}));
      } else {
        setToast({
          visible: true,
          type: "error",
          message:
            e?.response?.data?.message || "Nao foi possivel salvar o plano.",
        });
      }
    }
    setSavingPlan(false);
  };

  const removePlan = async () => {
    if (!deletePlanId) return;
    setDeletingPlan(true);
    try {
      await api.delete(`/course-plans/${deletePlanId}`);
      setDeletePlanId(null);
      fetchPlans();
    } catch {}
    setDeletingPlan(false);
  };

  const cycleMonthly = planMonthlyEquivalent();

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
          onPress={() => navigate("cursos")}
          className="flex-row items-center gap-1.5"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Cursos</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">
          {isEdit ? "Editar Curso" : "Novo Curso"}
        </Text>
      </View>

      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">
            {isEdit ? "Editar Curso" : "Novo Curso"}
          </Text>
          <Text className="text-sm text-gray-500">
            {isEdit
              ? "Atualize os dados e gerencie os planos de cobrança"
              : "Preencha os dados para cadastrar um novo curso"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-gray-500 text-sm mt-3">Carregando...</Text>
        </View>
      ) : (
        <View>
          {/* ── Card: Dados do Curso ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
                <Ionicons name="book-outline" size={16} color="#7C3AED" />
              </View>
              <Text className="text-base font-semibold text-gray-800">
                Dados do Curso
              </Text>
            </View>

            <FormInput
              label="Nome do curso"
              required
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              error={errors.name}
              placeholder="Ex: Preparatório ENEM"
            />

            <View className="mt-1">
              <FormInput
                label="Descrição"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                error={errors.description}
                placeholder="Breve descrição do curso"
              />
            </View>

            <View className="mt-1">
              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                Status
              </Text>
              <select
                value={form.status}
                onChange={(e: any) => setForm({ ...form, status: e.target.value })}
                style={{
                  width: "100%",
                  border: `1px solid ${errors.status ? "#EF4444" : "#E5E7EB"}`,
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

          {/* ── Card: Planos de Cobrança (só no modo edição) ── */}
          {isEdit && (
            <View
              className="bg-white rounded-2xl p-6 mb-5"
              style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
            >
              <View className="flex-row items-center justify-between mb-5">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 bg-amber-100 rounded-lg items-center justify-center">
                    <Ionicons name="wallet-outline" size={16} color="#D97706" />
                  </View>
                  <Text className="text-base font-semibold text-gray-800">
                    Planos de Cobrança
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openCreatePlan}
                  className="flex-row items-center bg-violet-600 px-4 py-2 rounded-xl"
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="white" />
                  <Text className="text-white font-semibold text-xs ml-1">
                    Adicionar Plano
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingPlans ? (
                <View className="items-center py-10">
                  <ActivityIndicator color="#7C3AED" />
                </View>
              ) : plans.length === 0 ? (
                <View className="items-center py-10">
                  <Ionicons name="wallet-outline" size={32} color="#E5E7EB" />
                  <Text className="text-gray-400 text-sm mt-2">
                    Nenhum plano cadastrado
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    Clique em "Adicionar Plano" para começar
                  </Text>
                </View>
              ) : (
                <View className="gap-3">
                  {plans.map((plan) => {
                    const monthly = parseFloat(plan.price) / monthsForCycle(plan.billing_cycle);
                    return (
                      <View
                        key={plan.id}
                        className="flex-row items-center border border-gray-100 rounded-xl px-4 py-3 bg-gray-50/50"
                      >
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-sm font-semibold text-gray-800">
                              {plan.name}
                            </Text>
                            <Badge
                              slug={plan.status}
                              label={plan.status === "active" ? "Ativo" : "Inativo"}
                            />
                          </View>
                          <Text className="text-xs text-gray-500 mt-0.5">
                            {plan.cycle_label} — {fmtBRL(parseFloat(plan.price))}
                            {"  "}
                            <Text className="text-violet-500">
                              (equiv. {fmtBRL(monthly)}/mês)
                            </Text>
                            {plan.enrollment_fee_amount ? (
                              <Text className="text-amber-600">
                                {"  "}· taxa matrícula {fmtBRL(parseFloat(plan.enrollment_fee_amount))}
                              </Text>
                            ) : null}
                          </Text>
                        </View>
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => openEditPlan(plan)}
                            className="p-1.5 bg-violet-50 rounded-lg"
                          >
                            <Ionicons name="pencil-outline" size={14} color="#7C3AED" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setDeletePlanId(plan.id)}
                            className="p-1.5 bg-red-50 rounded-lg"
                          >
                            <Ionicons name="trash-outline" size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {!isEdit && (
            <View className="flex-row items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5">
              <Ionicons name="information-circle-outline" size={18} color="#3B82F6" />
              <Text className="text-sm text-blue-600 flex-1">
                Após salvar o curso, você poderá adicionar os planos de cobrança.
              </Text>
            </View>
          )}

          {/* ── Action bar ── */}
          <View className="flex-row justify-end gap-3 mt-2">
            <TouchableOpacity
              onPress={() => navigate("cursos")}
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
                    {isEdit ? "Salvar Alterações" : "Cadastrar Curso"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Modal: Plano ── */}
      <Modal
        visible={planModal}
        title={editPlanId ? "Editar Plano" : "Novo Plano"}
        onClose={() => setPlanModal(false)}
        size="sm"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setPlanModal(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={savePlan}
              disabled={savingPlan}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              {savingPlan ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <FormInput
          label="Nome do plano"
          required
          value={planForm.name}
          onChangeText={(v) => setPlanForm({ ...planForm, name: v })}
          error={planErrors.name}
          placeholder="Ex: Plano Mensal"
        />

        <View className="mt-1">
          <Text className="text-xs font-medium text-gray-600 mb-1.5">
            Ciclo de Cobrança <Text className="text-red-500">*</Text>
          </Text>
          <select
            value={planForm.billing_cycle}
            onChange={(e: any) =>
              setPlanForm({ ...planForm, billing_cycle: e.target.value })
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

        <View className="mt-2">
          <FormInput
            label="Preço total do ciclo (R$)"
            required
            value={planForm.price}
            onChangeText={(v) => setPlanForm({ ...planForm, price: v })}
            error={planErrors.price}
            placeholder="Ex: 900.00"
            keyboardType="decimal-pad"
          />
        </View>

        <View className="mt-2">
          <FormInput
            label="Taxa de matrícula (R$)"
            value={planForm.enrollment_fee_amount}
            onChangeText={(v) => setPlanForm({ ...planForm, enrollment_fee_amount: v })}
            error={planErrors.enrollment_fee_amount}
            placeholder="Ex: 100,00"
            keyboardType="decimal-pad"
          />
          <Text className="text-xs text-gray-500 mt-1">
            Esse valor será usado na invoice da matrícula vinculada a este plano.
          </Text>
        </View>

        {cycleMonthly !== null && (
          <View className="flex-row items-center gap-2 bg-violet-50 rounded-lg px-3 py-2 mt-1">
            <Ionicons name="trending-down-outline" size={14} color="#7C3AED" />
            <Text className="text-xs text-violet-600">
              Equivalente a{" "}
              <Text className="font-bold">{fmtBRL(cycleMonthly)}/mês</Text>
            </Text>
          </View>
        )}

        <View className="mt-2">
          <FormInput
            label="Taxa de matrícula (R$)"
            value={planForm.enrollment_fee_amount}
            onChangeText={(v) => setPlanForm({ ...planForm, enrollment_fee_amount: v })}
            error={planErrors.enrollment_fee_amount}
            placeholder="Ex: 150,00"
            keyboardType="decimal-pad"
          />
          <Text className="text-xs text-gray-500 mt-1">
            Valor usado para a invoice da matrícula vinculada a este plano.
          </Text>
        </View>

        <View className="mt-2">
          <Text className="text-xs font-medium text-gray-600 mb-1.5">
            Status
          </Text>
          <select
            value={planForm.status}
            onChange={(e: any) =>
              setPlanForm({ ...planForm, status: e.target.value })
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
      </Modal>

        <ConfirmModal
          visible={!!deletePlanId}
          title="Excluir Plano"
          message="Este plano será removido permanentemente."
          onConfirm={removePlan}
          onCancel={() => setDeletePlanId(null)}
          loading={deletingPlan}
        />
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
