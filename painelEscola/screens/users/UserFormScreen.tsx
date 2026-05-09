import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Calculator, BookOpen, FlaskConical, Landmark, Globe,
  Dumbbell, Languages, Atom, Music, Palette, Code2,
  Brain, BookMarked, GraduationCap, Microscope, Earth,
  Lightbulb, PenLine, Sigma,
} from "lucide-react-native";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import { parseApiErrors } from "../../utils/apiErrors";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

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

function SubjectIcon({
  icon,
  color,
  size = 18,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
}) {
  const bg = color ?? "#7C3AED";
  const IconComp = icon ? ICON_MAP[icon] : null;

  return (
    <View
      style={{
        width: size + 16,
        height: size + 16,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg + "22",
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

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  userId: number | null;
};

type TenantOption = {
  value: string;
  label: string;
};

type SubjectOption = {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
};

type RoleOption = {
  value: string;
  label: string;
};

type Form = {
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  password: string;
  password_confirmation: string;
  password_change_required: boolean;
  subject_ids: number[];
};

const EMPTY: Form = {
  tenant_id: "",
  name: "",
  email: "",
  role: "secretaria",
  status: "active",
  password: "",
  password_confirmation: "",
  password_change_required: true,
  subject_ids: [],
};

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

export default function UserFormScreen({ navigate, userId }: Props) {
  const { user } = useAuth();
  const { contentPadding } = useResponsiveLayout();
  const isGlobalSuperAdmin = user?.role === "super_admin" && user?.tenant_id == null;
  const isEdit = userId !== null;

  const [form, setForm] = useState<Form>(EMPTY);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!isGlobalSuperAdmin) return;

    const loadTenants = async () => {
      try {
        const { data } = await api.get("/tenants", {
          params: { per_page: 200, status: "active" },
        });

        const list = Array.isArray(data.data) ? data.data : [];
        setTenants(
          list.map((t: any) => ({
            value: String(t.id),
            label: t.name || t.trade_name || t.corporate_name || `Tenant #${t.id}`,
          }))
        );
      } catch {
        setTenants([]);
      }
    };

    loadTenants();
  }, [isGlobalSuperAdmin]);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const { data } = await api.get("/domains/user-roles");
        const list = Array.isArray(data) ? data : [];
        const nextRoles = list.map((role: any) => ({
          value: String(role.slug ?? role.value ?? role.name ?? ""),
          label: String(role.name ?? role.label ?? role.slug ?? role.value ?? ""),
        }));

        setRoles(
          isGlobalSuperAdmin
            ? nextRoles
            : nextRoles.filter((opt) => opt.value !== "super_admin")
        );
      } catch {
        setRoles([]);
      }
    };

    loadRoles();
  }, [isGlobalSuperAdmin]);

  useEffect(() => {
    if (!isEdit || !userId) {
      if (!isGlobalSuperAdmin && user?.tenant_id != null) {
        setForm((prev) => ({ ...prev, tenant_id: String(user.tenant_id) }));
      }
      return;
    }

    const loadUser = async () => {
      setLoading(true);
      setForbidden(false);

      try {
        const { data } = await api.get(`/users/${userId}`);
        const u = data.body ?? data.data ?? data;

        setForm((prev) => ({
          ...prev,
          tenant_id: u.tenant_id != null ? String(u.tenant_id) : "",
          name: u.name ?? "",
          email: u.email ?? "",
          role: u.role ?? "secretaria",
          status: u.status ?? "active",
          password_change_required: !!u.password_change_required,
          password: "",
          password_confirmation: "",
          subject_ids: Array.isArray(u.subjects)
            ? u.subjects.map((s: any) => s.id ?? s)
            : Array.isArray(u.subject_ids)
            ? u.subject_ids
            : [],
        }));
      } catch (e: any) {
        if (e.response?.status === 403) setForbidden(true);
      }

      setLoading(false);
    };

    loadUser();
  }, [isEdit, isGlobalSuperAdmin, user?.tenant_id, userId]);

  useEffect(() => {
    if (form.role !== "professor") {
      setSubjects([]);
      return;
    }

    const loadSubjects = async () => {
      try {
        const { data } = await api.get("/subjects", {
          params: { per_page: 200, status: "active" },
        });
        const list = Array.isArray(data.data) ? data.data : [];
        setSubjects(
          list.map((s: any) => ({
            id: s.id,
            name: s.name,
            icon: s.icon ?? null,
            color: s.color ?? null,
          }))
        );
      } catch {
        setSubjects([]);
      }
    };

    loadSubjects();
  }, [form.role]);

  const title = useMemo(() => (isEdit ? "Editar Usuario" : "Novo Usuario"), [isEdit]);

  const showTenantField = isGlobalSuperAdmin && form.role !== "super_admin";

  const onRoleChange = (nextRole: string) => {
    setForm((prev) => ({
      ...prev,
      role: nextRole,
      tenant_id: nextRole === "super_admin" ? "" : prev.tenant_id,
      subject_ids: nextRole === "professor" ? prev.subject_ids : [],
    }));
    setErrors((prev) => ({ ...prev, role: "", tenant_id: "" }));
  };

  const toggleSubject = (id: number) => {
    setForm((prev) => ({
      ...prev,
      subject_ids: prev.subject_ids.includes(id)
        ? prev.subject_ids.filter((s) => s !== id)
        : [...prev.subject_ids, id],
    }));
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    setForbidden(false);

    const localErrors: Record<string, string> = {};

    if (!form.name.trim()) localErrors.name = "Informe o nome.";
    if (!form.email.trim()) localErrors.email = "Informe o e-mail.";
    if (!form.role) localErrors.role = "Selecione o perfil.";

    if (showTenantField && !form.tenant_id) {
      localErrors.tenant_id = "Selecione o tenant.";
    }

    if (!isEdit) {
      if (!form.password) localErrors.password = "Informe a senha.";
      if (!form.password_confirmation) {
        localErrors.password_confirmation = "Confirme a senha.";
      }
    }

    if (form.password && form.password.length < 6) {
      localErrors.password = "A senha deve ter ao menos 6 caracteres.";
    }

    if (form.password || form.password_confirmation) {
      if (form.password !== form.password_confirmation) {
        localErrors.password_confirmation = "A confirmacao de senha nao confere.";
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      setSaving(false);
      return;
    }

    const payload: Record<string, any> = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      status: form.status,
      password_change_required: form.password_change_required,
    };

    if (isGlobalSuperAdmin) {
      payload.tenant_id = form.role === "super_admin" ? null : Number(form.tenant_id);
    }

    if (!isGlobalSuperAdmin && user?.tenant_id != null) {
      payload.tenant_id = user.tenant_id;
    }

    if (form.role === "professor") {
      payload.subject_ids = form.subject_ids;
    }

    if (form.password) {
      payload.password = form.password;
      payload.password_confirmation = form.password_confirmation;
    }

    try {
      if (isEdit && userId) {
        await api.put(`/users/${userId}`, payload);
        navigate("users", { success: "Usuario atualizado com sucesso." });
      } else {
        await api.post("/users", payload);
        navigate("users", { success: "Usuario criado com sucesso." });
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data?.errors ?? {}));
      } else if (e.response?.status === 403) {
        setForbidden(true);
      } else {
        setErrors({ general: e.response?.data?.message || "Nao foi possivel salvar este usuario." });
      }
    }

    setSaving(false);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}>
      <View className="flex-row items-center gap-2 mb-6">
        <TouchableOpacity onPress={() => navigate("users")} className="flex-row items-center gap-1.5" activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Usuarios</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">{title}</Text>
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">{title}</Text>
        <Text className="text-sm text-gray-500">Defina acesso, perfil e status do usuario</Text>
      </View>

      {forbidden && (
        <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="shield-outline" size={16} color="#B45309" />
          <Text className="text-sm text-amber-700">Seu perfil nao possui permissao para esta operacao.</Text>
        </View>
      )}

      {!!errors.general && (
        <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
          <Text className="text-sm text-red-700" style={{ flex: 1 }}>{errors.general}</Text>
        </View>
      )}

      <View className="bg-white rounded-2xl p-5 mb-5" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
        <Text className="text-base font-semibold text-gray-800 mb-3">Dados do usuario</Text>

        {showTenantField && (
          <FormSelect
            label="Tenant"
            value={form.tenant_id}
            onChange={(value) => {
              setForm((prev) => ({ ...prev, tenant_id: value }));
              setErrors((prev) => ({ ...prev, tenant_id: "" }));
            }}
            options={tenants}
            placeholder="Selecione um tenant"
            required
            error={errors.tenant_id}
          />
        )}

        <FormInput
          label="Nome"
          value={form.name}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, name: v }));
            setErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="Nome completo"
          error={errors.name}
          required
        />

        <FormInput
          label="E-mail"
          value={form.email}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, email: v }));
            setErrors((prev) => ({ ...prev, email: "" }));
          }}
          placeholder="usuario@tenant.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
          required
        />

        <View className="flex-row gap-3" style={{ flexWrap: "wrap" as any }}>
          <View style={{ minWidth: 240, flexGrow: 1 }}>
            <FormSelect
              label="Perfil"
              value={form.role}
              onChange={onRoleChange}
              options={roles}
              error={errors.role}
              required
            />
          </View>

          <View style={{ minWidth: 180, flexGrow: 1 }}>
            <FormSelect
              label="Status"
              value={form.status}
              onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
              options={STATUS_OPTIONS}
              error={errors.status}
              required
            />
          </View>
        </View>
      </View>

      {form.role === "professor" && (
        <View className="bg-white rounded-2xl p-5 mb-5" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <Text className="text-base font-semibold text-gray-800 mb-1">Disciplinas</Text>
          <Text className="text-xs text-gray-400 mb-3">Selecione as disciplinas que este professor leciona</Text>
          {subjects.length === 0 ? (
            <Text className="text-sm text-gray-400">Nenhuma disciplina disponivel.</Text>
          ) : (
            subjects.map((s) => {
              const selected = form.subject_ids.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  className="flex-row items-center py-2"
                  onPress={() => toggleSubject(s.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={selected ? "checkbox" : "square-outline"}
                    size={20}
                    color={selected ? "#7C3AED" : "#9CA3AF"}
                  />
                  <View className="flex-row items-center gap-2 ml-2" style={{ flex: 1 }}>
                    <SubjectIcon icon={s.icon} color={s.color} size={16} />
                    <Text className="text-sm text-gray-700" style={{ flex: 1 }}>
                      {s.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      <View className="bg-white rounded-2xl p-5 mb-5" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
        <Text className="text-base font-semibold text-gray-800 mb-3">Senha</Text>

        <FormInput
          label={isEdit ? "Nova senha (opcional)" : "Senha"}
          value={form.password}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, password: v }));
            setErrors((prev) => ({ ...prev, password: "" }));
          }}
          secureTextEntry
          error={errors.password}
          required={!isEdit}
        />

        <FormInput
          label={isEdit ? "Confirmacao da nova senha" : "Confirmacao de senha"}
          value={form.password_confirmation}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, password_confirmation: v }));
            setErrors((prev) => ({ ...prev, password_confirmation: "" }));
          }}
          secureTextEntry
          error={errors.password_confirmation}
          required={!isEdit}
        />

        <TouchableOpacity
          className="flex-row items-center mt-1"
          onPress={() => setForm((prev) => ({ ...prev, password_change_required: !prev.password_change_required }))}
          activeOpacity={0.75}
        >
          <Ionicons
            name={form.password_change_required ? "checkbox" : "square-outline"}
            size={20}
            color={form.password_change_required ? "#7C3AED" : "#9CA3AF"}
          />
          <Text className="text-sm text-gray-700 ml-2">Exigir troca de senha no primeiro acesso</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row items-center justify-end gap-3">
        <TouchableOpacity
          onPress={() => navigate("users")}
          className="px-5 py-3 rounded-xl border border-gray-200"
          activeOpacity={0.75}
          disabled={saving}
        >
          <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={save}
          className="px-6 py-3 rounded-xl bg-violet-600"
          activeOpacity={0.85}
          disabled={saving || loading}
          style={{ opacity: saving || loading ? 0.75 : 1 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm font-semibold text-white">Salvar</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading && (
        <View className="mt-6 items-center">
          <ActivityIndicator size="small" color="#7C3AED" />
          <Text className="text-xs text-gray-500 mt-2">Carregando dados do usuario...</Text>
        </View>
      )}
    </ScrollView>
  );
}
