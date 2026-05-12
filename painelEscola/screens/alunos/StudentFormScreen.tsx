import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import {
  maskPhone,
  maskCPF,
  isValidCPF,
  onlyDigits,
  displayToISO,
  isoToDisplay,
} from "../../utils/masks";
import {
  useGuardianRelationships,
  useStatuses,
  domainToOptions,
} from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { prepareImageForUpload } from "../../utils/imageCompression";

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
  sublabel?: string;
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
  if (form.birth_date.trim() && form.birth_date.length < 10)
    errs.birth_date = "Data incompleta. Use DD/MM/AAAA.";
  else if (form.birth_date.trim()) {
    const isoDate = displayToISO(form.birth_date);
    if (!isoDate) {
      errs.birth_date = "Data inválida.";
    } else {
      const selectedDate = new Date(`${isoDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate >= today) {
        errs.birth_date = "A data deve ser anterior a hoje.";
      }
    }
  }
  if (form.document.trim() && !isValidCPF(form.document))
    errs.document = "CPF inválido.";
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

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<any>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const [guardians, setGuardians] = useState<GuardianForm[]>([]);
  const [guardianOptions, setGuardianOptions] = useState<GuardianOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteGuardianIndex, setDeleteGuardianIndex] = useState<number | null>(
    null
  );
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
  const statuses = useStatuses();
  const relationshipOptions = domainToOptions(relationships);
  const statusOptions = statuses.length ? domainToOptions(statuses) : STATUS_OPTIONS;
  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

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
      const { data } = isEdit && studentId
        ? await api.get(`/students/${studentId}/guardians/available`)
        : await api.get("/guardians", {
            params: { per_page: 999 },
          });
      const guardiansData = data.body ?? data.data ?? data;
      const rows = Array.isArray(guardiansData)
        ? guardiansData
        : Array.isArray(guardiansData?.guardians)
        ? guardiansData.guardians
        : Array.isArray(guardiansData?.data)
        ? guardiansData.data
        : [];
      setGuardianOptions(
        rows.map((g: any) => ({
          value: String(g.id),
          label: g.name,
          sublabel: g.document ? `CPF: ${maskCPF(g.document)}` : undefined,
          document: g.document ?? "",
          email: g.email ?? "",
        }))
      );
    } catch {}
  }, [isEdit, studentId]);

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
        setPhotoUrl(student.photo_url ?? null);
      } catch {}
      setLoading(false);
    })();
  }, [studentId, fetchGuardianOptions, isEdit, mapApiGuardiansToForm]);

  const handlePhotoSelect = useCallback(
    async (e: any) => {
      const file: File | undefined = e?.target?.files?.[0];
      if (!file) return;

      // Mostrar preview imediato
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setPendingPhotoPreview(result);
      };
      reader.readAsDataURL(file);

      if (!isEdit || !studentId) {
        // Modo criação: guarda arquivo para upload após salvar
        setPendingPhotoFile(file);
        return;
      }

      // Modo edição: upload imediato
      setPhotoUploading(true);
      try {
        const compressed = await prepareImageForUpload(file, 100);
        const formData = new FormData();
        formData.append("photo", compressed);
        const { data } = await api.post(
          `/students/${studentId}/upload-photo`,
          formData
        );
        const body = data?.body ?? data?.data ?? data;
        setPhotoUrl(body?.photo_url ?? null);
        setPendingPhotoPreview(null);
        setPendingPhotoFile(null);
        setToast({ visible: true, type: "success", message: "Foto atualizada com sucesso." });
      } catch (err: any) {
        setToast({
          visible: true,
          type: "error",
          message: err?.response?.data?.message ?? "Não foi possível enviar a foto.",
        });
      } finally {
        setPhotoUploading(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [isEdit, studentId]
  );

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

  const confirmDeleteGuardian = () => {
    if (deleteGuardianIndex === null) return;
    setGuardians((prev) => prev.filter((_, i) => i !== deleteGuardianIndex));
    setDeleteGuardianIndex(null);
  };

  const save = async () => {
    const localErrors = validateForm(form);

    const financialCount = guardians.filter(
      (g) => g.is_financial_responsible
    ).length;
    if (form.is_minor === "true" && financialCount === 0) {
      localErrors.guardians =
        "Para aluno menor de idade, informe ao menos um responsável financeiro.";
    }
    const existingSelected = new Set<number>();
    const newIdentitySelected = new Set<string>();

    guardians.forEach((g, i) => {
      if (g.mode === "new" && !g.name.trim()) {
        localErrors[`guardians.${i}.name`] =
          "Nome do responsável é obrigatório.";
      }
      if (g.mode === "new" && g.document.trim() && !isValidCPF(g.document)) {
        localErrors[`guardians.${i}.document`] = "CPF inválido.";
      }
      if (
        g.mode === "new" &&
        g.email.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)
      ) {
        localErrors[`guardians.${i}.email`] = "E-mail inválido.";
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
        name: form.name.trim(),
        is_minor: form.is_minor === "true",
        status: form.status,
        guardians: guardians.map((g) => {
          const baseFlags = {
            is_financial_responsible: g.is_financial_responsible,
            is_pedagogical_responsible: g.is_pedagogical_responsible,
            can_access_portal: g.can_access_portal,
          };

          if (g.mode === "existing" && g.guardian_id) {
            return {
              guardian_id: g.guardian_id,
              ...baseFlags,
            };
          }

          const newGuardian: Record<string, any> = {
            name: g.name.trim(),
            ...baseFlags,
          };
          if (g.document.trim()) newGuardian.document = onlyDigits(g.document);
          if (g.email.trim()) newGuardian.email = g.email.trim();
          if (g.phone.trim()) newGuardian.phone = g.phone.trim();
          if (g.relationship) newGuardian.relationship = g.relationship;
          return newGuardian;
        }),
      };

      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.document.trim()) payload.document = onlyDigits(form.document);
      if (form.birth_date.trim()) payload.birth_date = displayToISO(form.birth_date);

      if (isEdit) {
        const { data } = await api.put(`/students/${studentId}`, payload);
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
        setGuardians(mapApiGuardiansToForm(student.guardians ?? guardians));
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
          await fetchGuardianOptions();
          if (pendingPhotoFile) {
            try {
              const compressed = await prepareImageForUpload(pendingPhotoFile, 100);
              const formData = new FormData();
              formData.append("photo", compressed);
              const { data: photoData } = await api.post(
                `/students/${createdId}/upload-photo`,
                formData
              );
              const photoBody = photoData?.body ?? photoData?.data ?? photoData;
              setPhotoUrl(photoBody?.photo_url ?? null);
            } catch {}
            setPendingPhotoFile(null);
            setPendingPhotoPreview(null);
          }
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
        const firstFieldError = Object.values(fieldErrors)[0];
        setErrors(fieldErrors);
        setToast({
          visible: true,
          type: "error",
          message:
            firstFieldError ||
            e.response?.data?.message ||
            "Dados inválidos.",
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

            {/* Foto do aluno */}
            <View className="flex-row items-start gap-5 mb-5">
              <View className="items-center gap-2">
                <View
                  className="rounded-2xl overflow-hidden border-2 border-violet-100"
                  style={{ width: 128, height: 128, backgroundColor: "#F5F3FF" }}
                >
                  {pendingPhotoPreview || photoUrl ? (
                    <Image
                      source={{ uri: (pendingPhotoPreview ?? photoUrl)! }}
                      style={{ width: 128, height: 128 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <Ionicons name="person" size={52} color="#C4B5FD" />
                    </View>
                  )}
                  {photoUploading && (
                    <View
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ActivityIndicator color="white" size="small" />
                    </View>
                  )}
                </View>

                {Platform.OS === "web" ? (
                  <label
                    style={{
                      cursor: photoUploading ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "transparent",
                      border: "1px solid #DDD6FE",
                      borderRadius: 8,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#7C3AED",
                      opacity: photoUploading ? 0.5 : 1,
                    }}
                  >
                    <Ionicons name="camera-outline" size={13} color="#7C3AED" />
                    <span style={{ marginLeft: 2 }}>
                      {photoUrl || pendingPhotoPreview ? "Alterar" : "Adicionar foto"}
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      disabled={photoUploading}
                      onChange={handlePhotoSelect}
                    />
                  </label>
                ) : (
                  <TouchableOpacity
                    disabled={photoUploading}
                    className="flex-row items-center gap-1 border border-violet-200 rounded-lg px-2.5 py-1"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera-outline" size={13} color="#7C3AED" />
                    <Text className="text-xs font-semibold text-violet-700">
                      {photoUrl || pendingPhotoPreview ? "Alterar" : "Adicionar foto"}
                    </Text>
                  </TouchableOpacity>
                )}

                {pendingPhotoPreview && !isEdit && (
                  <Text className="text-xs text-amber-600 text-center" style={{ maxWidth: 128 }}>
                    Será enviada ao salvar
                  </Text>
                )}
              </View>

              <View className="flex-1">
                {enrollmentNumber && (
                  <View className="flex-row items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 mb-3">
                    <Ionicons name="id-card-outline" size={18} color="#7C3AED" />
                    <View>
                      <Text className="text-xs text-violet-500 font-medium">Número de Matrícula (login)</Text>
                      <Text className="text-base font-bold text-violet-700 font-mono tracking-widest">
                        {enrollmentNumber}
                      </Text>
                    </View>
                  </View>
                )}
                <Text className="text-xs text-gray-400 leading-relaxed">
                  Formatos aceitos: JPG, PNG, WEBP.{"\n"}Tamanho máximo: 5 MB (será comprimida automaticamente).
                </Text>
              </View>
            </View>

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
                  onChangeText={(v) => setForm({ ...form, document: maskCPF(v) })}
                  error={errors.document}
                  placeholder="000.000.000-00"
                  keyboardType="numeric"
                  maxLength={14}
                />
              </View>
              <View className="flex-1">
                <DatePickerInput
                  label="Data de Nascimento"
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
                  options={statusOptions}
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
                          onPress={() => setDeleteGuardianIndex(idx)}
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
                              <FormSelect
                                label="Parentesco"
                                value={g.relationship}
                                onChange={(v) =>
                                  updateGuardian(idx, {
                                    relationship: v,
                                  })
                                }
                                options={relationshipOptions}
                                placeholder="Selecione..."
                              />
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
                              label="CPF"
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

      <ConfirmModal
        visible={deleteGuardianIndex !== null}
        title="Remover Responsável"
        message="Deseja remover este responsável da lista?"
        onConfirm={confirmDeleteGuardian}
        onCancel={() => setDeleteGuardianIndex(null)}
        loading={false}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </View>
  );
}
