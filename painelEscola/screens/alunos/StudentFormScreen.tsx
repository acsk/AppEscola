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
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import ToastBanner from "../../components/ui/ToastBanner";
import {
  maskPhone,
  maskCPF,
  isValidCPF,
  displayToISO,
  isoToDisplay,
} from "../../utils/masks";
import {
  useGuardianRelationships,
  domainToOptions,
} from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

// ── Types ─────────────────────────────────────────────────────────────────────

type Form = {
  name: string;
  birth_date: string; // DD/MM/AAAA
  document: string;
  email: string;
  phone: string;
  is_minor: string;
  status: string;
};

type GuardianForm = {
  mode: "new" | "existing";
  guardian_id: number | null;
  name: string;
  document: string;
  email: string;
  phone: string;
  relationship: string;
  is_financial_responsible: boolean;
  is_pedagogical_responsible: boolean;
  can_access_portal: boolean;
};

type GuardianOption = {
  value: string;
  label: string;
  document?: string;
  email?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY: Form = {
  name: "",
  birth_date: "",
  document: "",
  email: "",
  phone: "",
  is_minor: "false",
  status: "active",
};

const EMPTY_GUARDIAN: GuardianForm = {
  mode: "new",
  guardian_id: null,
  name: "",
  document: "",
  email: "",
  phone: "",
  relationship: "",
  is_financial_responsible: false,
  is_pedagogical_responsible: false,
  can_access_portal: true,
};

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

// ── Validation ────────────────────────────────────────────────────────────────

function validateForm(form: Form): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = "Nome é obrigatório.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errs.email = "E-mail inválido.";
  if (!form.phone.trim()) errs.phone = "Telefone é obrigatório.";
  if (form.document.trim() && !isValidCPF(form.document))
    errs.document = "CPF inválido.";
  if (!form.birth_date.trim())
    errs.birth_date = "Data de nascimento é obrigatória.";
  else if (form.birth_date.length < 10)
    errs.birth_date = "Data incompleta. Use DD/MM/AAAA.";
  return errs;
}

// ── CheckToggle ───────────────────────────────────────────────────────────────

function CheckToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      className="flex-row items-center gap-2 py-1.5"
      activeOpacity={0.7}
    >
      <Ionicons
        name={value ? "checkbox" : "square-outline"}
        size={20}
        color={value ? "#7C3AED" : "#9CA3AF"}
      />
      <Text className="text-sm text-gray-700">{label}</Text>
    </TouchableOpacity>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  studentId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StudentFormScreen({ studentId, navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const isEdit = studentId !== null;
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [enrollmentNumber, setEnrollmentNumber] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const [guardians, setGuardians] = useState<GuardianForm[]>([]);
  const [guardianOptions, setGuardianOptions] = useState<GuardianOption[]>([]);
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

  const relationships = useGuardianRelationships();
  const relationshipOptions = domainToOptions(relationships);
  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const onlyDigits = (value: string) => value.replace(/\D/g, "");
  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const mapApiGuardiansToForm = useCallback((items: any[]): GuardianForm[] => {
    const seen = new Set<number>();
    return (items ?? [])
      .filter((g: any) => {
        if (!g?.id || seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      })
      .map((g: any) => ({
        mode: "existing" as const,
        guardian_id: g.id,
        name: g.name ?? "",
        document: maskCPF(g.document ?? ""),
        email: g.email ?? "",
        phone: maskPhone(g.phone ?? ""),
        relationship: g.relationship ?? "",
        is_financial_responsible: g.pivot?.is_financial_responsible ?? false,
        is_pedagogical_responsible: g.pivot?.is_pedagogical_responsible ?? false,
        can_access_portal: g.pivot?.can_access_portal ?? true,
      }));
  }, []);

  const resolveGuardianIdByIdentity = useCallback(
    (g: GuardianForm) => {
      const doc = onlyDigits(g.document);
      const email = normalizeEmail(g.email);
      if (!doc && !email) return null;
      const match = guardianOptions.find((opt) => {
        const optDoc = onlyDigits(opt.document ?? "");
        const optEmail = normalizeEmail(opt.email ?? "");
        const byDoc = !!doc && !!optDoc && doc === optDoc;
        const byEmail = !!email && !!optEmail && email === optEmail;
        return byDoc || byEmail;
      });
      return match ? Number(match.value) : null;
    },
    [guardianOptions]
  );

  const syncStudentGuardians = useCallback(
    async (targetStudentId: number) => {
      const desired: Array<{
        guardian_id: number;
        is_financial_responsible: boolean;
        is_pedagogical_responsible: boolean;
        can_access_portal: boolean;
      }> = [];

      for (const g of guardians) {
        let guardianId = g.mode === "existing" ? g.guardian_id : null;

        if (!guardianId && g.mode === "new") {
          guardianId = resolveGuardianIdByIdentity(g);
        }

        if (!guardianId && g.mode === "new") {
          const createPayload: Record<string, any> = {
            name: g.name.trim(),
            document: onlyDigits(g.document),
            email: g.email.trim(),
          };
          if (g.phone.trim()) createPayload.phone = onlyDigits(g.phone);
          if (g.relationship) createPayload.relationship = g.relationship;
          const { data: createdRaw } = await api.post("/guardians", createPayload);
          const created = createdRaw?.body ?? createdRaw?.data ?? createdRaw;
          guardianId = created?.id ?? null;
        }

        if (!guardianId) continue;

        desired.push({
          guardian_id: guardianId,
          is_financial_responsible: g.is_financial_responsible,
          is_pedagogical_responsible: g.is_pedagogical_responsible,
          can_access_portal: g.can_access_portal,
        });
      }

      const desiredUniqueMap = new Map<number, (typeof desired)[number]>();
      for (const item of desired) desiredUniqueMap.set(item.guardian_id, item);
      const desiredUnique = Array.from(desiredUniqueMap.values());

      const { data: currentRaw } = await api.get(`/students/${targetStudentId}/guardians`);
      const currentData = currentRaw?.body ?? currentRaw?.data ?? currentRaw;
      const currentList = Array.isArray(currentData)
        ? currentData
        : Array.isArray(currentData?.data)
        ? currentData.data
        : [];
      const currentIds = new Set<number>((currentList ?? []).map((g: any) => Number(g.id)));

      // Deleta responsáveis não desejados
      for (const currentId of currentIds) {
        if (!desiredUniqueMap.has(currentId)) {
          await api.delete(`/students/${targetStudentId}/guardians/${currentId}`);
        }
      }

      // Atualiza ou cria responsáveis desejados (só DELETE+POST se mudou flags)
      for (const item of desiredUnique) {
        const currentGuardian = currentList.find((c: any) => Number(c.id) === item.guardian_id);
        const flagsChanged = !currentGuardian || 
          currentGuardian.pivot?.is_financial_responsible !== item.is_financial_responsible ||
          currentGuardian.pivot?.is_pedagogical_responsible !== item.is_pedagogical_responsible ||
          currentGuardian.pivot?.can_access_portal !== item.can_access_portal;

        if (flagsChanged && currentGuardian) {
          // Só faz DELETE+POST se as flags realmente mudaram
          await api.delete(`/students/${targetStudentId}/guardians/${item.guardian_id}`);
          await api.post(`/students/${targetStudentId}/guardians`, item);
        } else if (!currentGuardian) {
          // Se é novo responsável, só faz POST
          await api.post(`/students/${targetStudentId}/guardians`, item);
        }
        // Se não mudou nada, não faz nada
      }
    },
    [guardians, resolveGuardianIdByIdentity]
  );

  // Auto-compute is_minor from birth_date
  useEffect(() => {
    if (form.birth_date.length === 10) {
      const [day, month, year] = form.birth_date.split("/").map(Number);
      const birth = new Date(year, month - 1, day);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setForm((prev) => ({ ...prev, is_minor: age < 18 ? "true" : "false" }));
    }
  }, [form.birth_date]);

  const fetchGuardianOptions = useCallback(async () => {
    try {
      const { data } = await api.get("/guardians", {
        params: { per_page: 999 },
      });
      const guardiansData = data.body ?? data.data ?? data;
      const rows = Array.isArray(guardiansData)
        ? guardiansData
        : Array.isArray(guardiansData?.data)
        ? guardiansData.data
        : [];
      setGuardianOptions(
        rows.map((g: any) => ({
          value: String(g.id),
          label: g.name,
          document: g.document ?? "",
          email: g.email ?? "",
        }))
      );
    } catch {}
  }, []);

  // Load student data if editing
  useEffect(() => {
    fetchGuardianOptions();
    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/students/${studentId}`);
        const student = data.body ?? data.data ?? data;
        setEnrollmentNumber(student.enrollment_number ?? null);
        setForm({
          name: student.name ?? "",
          birth_date: isoToDisplay(student.birth_date ?? ""),
          document: maskCPF(student.document ?? ""),
          email: student.email ?? "",
          phone: maskPhone(student.phone ?? ""),
          is_minor: student.is_minor ? "true" : "false",
          status: student.status ?? "active",
        });
        setGuardians(mapApiGuardiansToForm(student.guardians ?? []));
      } catch {}
      setLoading(false);
    })();
  }, [studentId, fetchGuardianOptions, isEdit, mapApiGuardiansToForm]);

  const updateGuardian = (idx: number, partial: Partial<GuardianForm>) => {
    setGuardians((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, ...partial } : g))
    );
  };

  const switchGuardianMode = (idx: number, mode: "new" | "existing") => {
    setGuardians((prev) =>
      prev.map((g, i) => {
        if (i !== idx) return g;
        if (mode === "new") {
          return {
            ...g,
            mode: "new",
            guardian_id: null,
            name: "",
            document: "",
            email: "",
            phone: "",
            relationship: "",
          };
        }
        return {
          ...g,
          mode: "existing",
          guardian_id: null,
          name: "",
          document: "",
          email: "",
          phone: "",
          relationship: "",
        };
      })
    );
  };

  const save = async () => {
    const localErrors = validateForm(form);

    const financialCount = guardians.filter(
      (g) => g.is_financial_responsible
    ).length;
    if (financialCount > 1) {
      localErrors.guardians =
        "Apenas um responsável financeiro pode ser definido.";
    }
    const existingSelected = new Set<number>();
    const newIdentitySelected = new Set<string>();

    guardians.forEach((g, i) => {
      if (g.mode === "new" && !g.name.trim()) {
        localErrors[`guardians.${i}.name`] =
          "Nome do responsável é obrigatório.";
      }
      if (g.mode === "new" && !g.document.trim()) {
        localErrors[`guardians.${i}.document`] = "CPF é obrigatório.";
      }
      if (g.mode === "new" && !g.email.trim()) {
        localErrors[`guardians.${i}.email`] = "E-mail é obrigatório.";
      }
      if (g.mode === "existing" && !g.guardian_id) {
        localErrors[`guardians.${i}.guardian_id`] = "Selecione o responsável.";
      }

      if (g.mode === "existing" && g.guardian_id) {
        if (existingSelected.has(g.guardian_id)) {
          localErrors[`guardians.${i}.guardian_id`] =
            "Responsável já selecionado na lista.";
        }
        existingSelected.add(g.guardian_id);
      }

      if (g.mode === "new") {
        const identity = `${onlyDigits(g.document)}|${normalizeEmail(g.email)}`;
        if (identity !== "|" && newIdentitySelected.has(identity)) {
          localErrors[`guardians.${i}.email`] =
            "Este responsável já foi informado na lista.";
        }
        newIdentitySelected.add(identity);
      }
    });

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
        email: form.email,
        phone: form.phone.replace(/\D/g, ""),
        document: form.document.replace(/\D/g, ""),
        birth_date: displayToISO(form.birth_date),
        is_minor: form.is_minor === "true",
        status: form.status,
      };

      if (isEdit) {
        const { data } = await api.put(`/students/${studentId}`, payload);
        await syncStudentGuardians(Number(studentId));
        const { data: guardiansRaw } = await api.get(`/students/${studentId}/guardians`);
        const guardiansData = guardiansRaw?.body ?? guardiansRaw?.data ?? guardiansRaw;
        const guardiansList = Array.isArray(guardiansData)
          ? guardiansData
          : Array.isArray(guardiansData?.data)
          ? guardiansData.data
          : [];
        const student = data.body ?? data.data ?? data;
        setEnrollmentNumber(student.enrollment_number ?? enrollmentNumber);
        setForm({
          name: student.name ?? form.name,
          birth_date: isoToDisplay(student.birth_date ?? displayToISO(form.birth_date)),
          document: maskCPF(student.document ?? form.document),
          email: student.email ?? form.email,
          phone: maskPhone(student.phone ?? form.phone),
          is_minor: student.is_minor ? "true" : "false",
          status: student.status ?? form.status,
        });
        setGuardians(mapApiGuardiansToForm(guardiansList));
        await fetchGuardianOptions();
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Operacao realizada com sucesso.",
        });
        setTimeout(() => {
          navigate("alunos");
        }, 1800);
      } else {
        const { data: rawCreate } = await api.post("/students", payload);
        const created = rawCreate?.body ?? rawCreate?.data ?? rawCreate;
        const createdId = Number(created?.id);
        if (createdId) {
          await syncStudentGuardians(createdId);
          await fetchGuardianOptions();
        }
        setToast({
          visible: true,
          type: "success",
          message: rawCreate?.message || "Aluno criado com sucesso.",
        });
        setTimeout(() => {
          navigate("alunos");
        }, 1800);
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        const fieldErrors = parseApiErrors(e.response.data.errors ?? {});
        setErrors(fieldErrors);
        setToast({
          visible: true,
          type: "error",
          message: e.response?.data?.message || "Dados inválidos.",
        });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        setToast({
          visible: true,
          type: "error",
          message:
            e?.response?.data?.message || "Nao foi possivel salvar o aluno.",
        });
      }
    }
    setSaving(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
      {/* Breadcrumb / Header */}
      <View className="flex-row items-center gap-2 mb-6">
        <TouchableOpacity
          onPress={() => navigate("alunos")}
          className="flex-row items-center gap-1.5 text-gray-500"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Alunos</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">
          {isEdit ? "Editar Aluno" : "Novo Aluno"}
        </Text>
      </View>

      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">
            {isEdit ? "Editar Aluno" : "Novo Aluno"}
          </Text>
          <Text className="text-sm text-gray-500">
            {isEdit
              ? "Atualize os dados do aluno e seus responsáveis"
              : "Preencha os dados para cadastrar um novo aluno"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-gray-500 text-sm mt-3">Carregando dados...</Text>
        </View>
      ) : (
        <View className="gap-0">
          {/* ── Card: Dados pessoais ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
                <Ionicons name="person-outline" size={16} color="#7C3AED" />
              </View>
              <Text className="text-base font-semibold text-gray-800">
                Dados Pessoais
              </Text>
            </View>

            {enrollmentNumber && (
              <View className="flex-row items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 mb-4">
                <Ionicons name="id-card-outline" size={18} color="#7C3AED" />
                <View>
                  <Text className="text-xs text-violet-500 font-medium">Número de Matrícula (login)</Text>
                  <Text className="text-base font-bold text-violet-700 font-mono tracking-widest">
                    {enrollmentNumber}
                  </Text>
                </View>
              </View>
            )}

            <FormInput
              label="Nome completo"
              required
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              error={errors.name}
              placeholder="Nome completo do aluno"
            />

            <View className="flex-row gap-4 mt-1">
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
                  required
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: maskPhone(v) })}
                  error={errors.phone}
                  placeholder="(11) 99999-0000"
                  keyboardType="phone-pad"
                  maxLength={16}
                />
              </View>
            </View>

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <FormInput
                  label="CPF"
                  value={form.document}
                  onChangeText={(v) =>
                    setForm({ ...form, document: maskCPF(v) })
                  }
                  error={errors.document}
                  placeholder="000.000.000-00"
                  keyboardType="numeric"
                  maxLength={14}
                />
              </View>
              <View className="flex-1">
                <DatePickerInput
                  label="Data de Nascimento"
                  required
                  value={form.birth_date}
                  onChangeText={(v) => setForm({ ...form, birth_date: v })}
                  error={errors.birth_date}
                />
              </View>
            </View>

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  Menor de Idade?
                </Text>
                <View className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-50 flex-row items-center gap-2">
                  <Ionicons
                    name={
                      form.is_minor === "true"
                        ? "checkmark-circle"
                        : "close-circle"
                    }
                    size={18}
                    color={form.is_minor === "true" ? "#7C3AED" : "#6B7280"}
                  />
                  <Text
                    className={
                      form.is_minor === "true"
                        ? "text-violet-700 font-medium"
                        : "text-gray-500"
                    }
                  >
                    {form.is_minor === "true" ? "Sim" : "Não"}
                  </Text>
                  <Text className="text-xs text-gray-400 ml-1">
                    (calculado pela data de nascimento)
                  </Text>
                </View>
              </View>
              <View className="flex-1">
                <FormSelect
                  label="Status"
                  required
                  value={form.status}
                  options={STATUS_OPTIONS}
                  onChange={(v) => setForm({ ...form, status: v })}
                  error={errors.status}
                />
              </View>
            </View>
          </View>

          {/* ── Card: Responsáveis ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center gap-2">
                <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
                  <Ionicons name="people-outline" size={16} color="#7C3AED" />
                </View>
                <Text className="text-base font-semibold text-gray-800">
                  Responsáveis
                </Text>
                {guardians.length > 0 && (
                  <View className="bg-violet-100 rounded-full px-2.5 py-0.5 ml-1">
                    <Text className="text-xs font-semibold text-violet-700">
                      {guardians.length}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() =>
                  setGuardians((prev) => [...prev, { ...EMPTY_GUARDIAN }])
                }
                className="flex-row items-center gap-1.5 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl"
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#7C3AED" />
                <Text className="text-sm font-semibold text-violet-700">
                  Adicionar Responsável
                </Text>
              </TouchableOpacity>
            </View>

            {errors.guardians && (
              <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                <Text className="text-sm text-red-600">{errors.guardians}</Text>
              </View>
            )}

            {guardians.length === 0 ? (
              <View className="border-2 border-dashed border-gray-200 rounded-xl py-10 items-center">
                <Ionicons name="people-outline" size={36} color="#D1D5DB" />
                <Text className="text-sm font-medium text-gray-400 mt-3">
                  Nenhum responsável vinculado
                </Text>
                <Text className="text-xs text-gray-400 mt-1">
                  Clique em "Adicionar Responsável" para vincular
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                {guardians.map((g, idx) => (
                  <View
                    key={idx}
                    className="border border-gray-200 rounded-xl overflow-hidden"
                  >
                    {/* Card top bar */}
                    <View className="flex-row items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <View className="flex-row items-center gap-2">
                        <View className="w-6 h-6 bg-violet-600 rounded-full items-center justify-center">
                          <Text className="text-white text-xs font-bold">
                            {idx + 1}
                          </Text>
                        </View>
                        <Text className="text-sm font-semibold text-gray-700">
                          {g.mode === "existing" && g.guardian_id
                            ? guardianOptions.find(
                                (o) => o.value === String(g.guardian_id)
                              )?.label ?? "Responsável"
                            : g.name || "Novo Responsável"}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        {/* Mode toggle */}
                        <View className="flex-row border border-gray-200 rounded-lg overflow-hidden">
                          <TouchableOpacity
                            onPress={() => switchGuardianMode(idx, "new")}
                            className={`px-3 py-1 ${
                              g.mode === "new" ? "bg-violet-600" : "bg-white"
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                g.mode === "new"
                                  ? "text-white"
                                  : "text-gray-500"
                              }`}
                            >
                              Novo
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => switchGuardianMode(idx, "existing")}
                            className={`px-3 py-1 ${
                              g.mode === "existing"
                                ? "bg-violet-600"
                                : "bg-white"
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                g.mode === "existing"
                                  ? "text-white"
                                  : "text-gray-500"
                              }`}
                            >
                              Já cadastrado
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            setGuardians((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="p-1.5 bg-red-50 rounded-lg"
                        >
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color="#EF4444"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Card body */}
                    <View className="p-4">
                      {g.mode === "existing" ? (
                        <View>
                          <SearchableSelect
                            label="Responsável"
                            required
                            placeholder="Selecione um responsável..."
                            modalTitle="Selecionar Responsável"
                            options={guardianOptions}
                            value={g.guardian_id ? String(g.guardian_id) : ""}
                            onChange={(v) =>
                              updateGuardian(idx, { guardian_id: v ? Number(v) : null })
                            }
                            error={errors[`guardians.${idx}.guardian_id`]}
                          />
                        </View>
                      ) : (
                        <View>
                          <View className="flex-row gap-4 mb-1">
                            <View className="flex-1">
                              <FormInput
                                label="Nome"
                                required
                                value={g.name}
                                onChangeText={(v) =>
                                  updateGuardian(idx, { name: v })
                                }
                                error={errors[`guardians.${idx}.name`]}
                                placeholder="Nome do responsável"
                              />
                            </View>
                            <View className="flex-1">
                              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                                Parentesco
                              </Text>
                              <select
                                value={g.relationship}
                                onChange={(e: any) =>
                                  updateGuardian(idx, {
                                    relationship: e.target.value,
                                  })
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
                                <option value="">Selecione...</option>
                                {relationshipOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </View>
                          </View>

                          <View className="flex-row gap-4 mt-2">
                            <View className="flex-1">
                              <FormInput
                                label="E-mail"
                                value={g.email}
                                onChangeText={(v) =>
                                  updateGuardian(idx, { email: v })
                                }
                                placeholder="email@exemplo.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                error={errors[`guardians.${idx}.email`]}
                              />
                            </View>
                            <View className="flex-1">
                              <FormInput
                                label="Telefone"
                                value={g.phone}
                                onChangeText={(v) =>
                                  updateGuardian(idx, { phone: maskPhone(v) })
                                }
                                placeholder="(11) 99999-0000"
                                keyboardType="phone-pad"
                                maxLength={16}
                              />
                            </View>
                          </View>

                          <View style={{ maxWidth: 240 }} className="mt-2">
                            <FormInput
                              label="CPF / RG"
                              value={g.document}
                              onChangeText={(v) =>
                                updateGuardian(idx, { document: maskCPF(v) })
                              }
                              placeholder="000.000.000-00"
                              keyboardType="numeric"
                              maxLength={14}
                              error={errors[`guardians.${idx}.document`]}
                            />
                          </View>
                        </View>
                      )}

                      {/* Permissões */}
                      <View className="mt-3 pt-3 border-t border-gray-100">
                        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Permissões
                        </Text>
                        <View className="flex-row gap-8">
                          <CheckToggle
                            label="Responsável Financeiro"
                            value={g.is_financial_responsible}
                            onChange={(v) =>
                              updateGuardian(idx, {
                                is_financial_responsible: v,
                              })
                            }
                          />
                          <CheckToggle
                            label="Responsável Pedagógico"
                            value={g.is_pedagogical_responsible}
                            onChange={(v) =>
                              updateGuardian(idx, {
                                is_pedagogical_responsible: v,
                              })
                            }
                          />
                          <CheckToggle
                            label="Acesso ao Portal"
                            value={g.can_access_portal}
                            onChange={(v) =>
                              updateGuardian(idx, { can_access_portal: v })
                            }
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Action bar ── */}
          <View className="flex-row justify-end gap-3 mt-2">
            <TouchableOpacity
              onPress={() => navigate("alunos")}
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
                    {isEdit ? "Salvar Alterações" : "Cadastrar Aluno"}
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
