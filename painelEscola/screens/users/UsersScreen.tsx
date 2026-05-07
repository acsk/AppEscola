import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Pagination from "../../components/ui/Pagination";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

type UserRow = {
  id: number;
  tenant_id: number | null;
  name: string;
  email: string;
  role: string;
  status: string;
  password_change_required: boolean;
  created_at: string;
  updated_at: string;
};

type TenantOption = {
  id: number;
  name: string;
};

type Meta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  flashMessage?: string;
};

function roleLabel(role: string) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "secretaria") return "Secretaria";
  if (role === "professor") return "Professor";
  if (role === "financeiro") return "Financeiro";
  return role;
}

function statusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return status;
}

export default function UsersScreen({ navigate, flashMessage }: Props) {
  const { user } = useAuth();
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const isSuperAdmin = user?.role === "super_admin";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [successMessage, setSuccessMessage] = useState(flashMessage ?? "");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [page, setPage] = useState(1);

  const [meta, setMeta] = useState<Meta>({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tenantNameById = useMemo(() => {
    const map = new Map<number, string>();
    tenants.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    setErrorMessage("");

    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (roleFilter) params.role = roleFilter;
      if (search.trim()) params.search = search.trim();
      if (isSuperAdmin && tenantFilter) params.tenant_id = tenantFilter;

      const { data } = await api.get("/users", { params });
      const list = Array.isArray(data.data) ? data.data : [];
      setRows(list);

      if (data.meta) {
        setMeta({
          current_page: data.meta.current_page ?? 1,
          last_page: data.meta.last_page ?? 1,
          per_page: data.meta.per_page ?? 20,
          total: data.meta.total ?? list.length,
        });
      } else {
        setMeta({
          current_page: 1,
          last_page: 1,
          per_page: list.length || 20,
          total: list.length,
        });
      }
    } catch (e: any) {
      if (e.response?.status === 403) {
        setForbidden(true);
      } else {
        setErrorMessage(e.response?.data?.message || "Nao foi possivel carregar os usuarios.");
      }
    }

    setLoading(false);
  }, [isSuperAdmin, page, roleFilter, search, statusFilter, tenantFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (flashMessage) setSuccessMessage(flashMessage);
  }, [flashMessage]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const loadTenants = async () => {
      try {
        const { data } = await api.get("/tenants", {
          params: { per_page: 200, status: "active" },
        });

        const list = Array.isArray(data.data) ? data.data : [];
        setTenants(
          list.map((t: any) => ({
            id: t.id,
            name: t.name || t.trade_name || t.corporate_name || `Tenant #${t.id}`,
          }))
        );
      } catch {
        setTenants([]);
      }
    };

    loadTenants();
  }, [isSuperAdmin]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    setErrorMessage("");

    try {
      await api.delete(`/users/${deleteId}`);
      setDeleteId(null);
      fetchUsers();
    } catch (e: any) {
      if (e.response?.status === 403) {
        setForbidden(true);
      } else if (e.response?.status === 422) {
        setErrorMessage(e.response?.data?.message || "Nao foi possivel remover este usuario.");
      } else {
        setErrorMessage("Nao foi possivel remover este usuario.");
      }
    }

    setDeleting(false);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Usuarios</Text>
          <Text className="text-sm text-gray-500">Gestao de acesso e perfis da plataforma</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("users-form", { userId: null })}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Novo Usuario</Text>
        </TouchableOpacity>
      </View>

      {!!successMessage && (
        <View className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex-row items-start gap-2">
          <Ionicons name="checkmark-circle-outline" size={16} color="#047857" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text className="text-sm text-emerald-700">{successMessage}</Text>
          </View>
          <TouchableOpacity onPress={() => setSuccessMessage("")}>
            <Ionicons name="close" size={16} color="#047857" />
          </TouchableOpacity>
        </View>
      )}

      {forbidden && (
        <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="shield-outline" size={16} color="#B45309" />
          <Text className="text-sm text-amber-700">Seu perfil nao possui permissao para gerenciar usuarios.</Text>
        </View>
      )}

      {!!errorMessage && (
        <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
          <Text className="text-sm text-red-700" style={{ flex: 1 }}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage("")}>
            <Ionicons name="close" size={16} color="#B91C1C" />
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row gap-3 mb-4" style={{ flexWrap: "wrap" as any }}>
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4" style={{ height: 44, minWidth: isMobile ? "100%" : 280, flexGrow: 1 }}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome ou e-mail..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 ml-2 text-sm text-gray-800"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {isSuperAdmin && (
          <select
            value={tenantFilter}
            onChange={(e: any) => {
              setTenantFilter(e.target.value);
              setPage(1);
            }}
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "0 14px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "white",
              height: 44,
              minWidth: isMobile ? "100%" : 200,
            }}
          >
            <option value="">Todos os tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={roleFilter}
          onChange={(e: any) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: "0 14px",
            fontSize: 14,
            color: "#374151",
            backgroundColor: "white",
            height: 44,
            minWidth: isMobile ? "100%" : 170,
          }}
        >
          <option value="">Todos os perfis</option>
          {isSuperAdmin && <option value="super_admin">Super Admin</option>}
          <option value="admin">Admin</option>
          <option value="secretaria">Secretaria</option>
          <option value="professor">Professor</option>
          <option value="financeiro">Financeiro</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e: any) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: "0 14px",
            fontSize: 14,
            color: "#374151",
            backgroundColor: "white",
            height: 44,
            minWidth: isMobile ? "100%" : 150,
          }}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
      <View className="bg-white rounded-2xl overflow-hidden" style={{ minWidth: tableMinWidth, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Usuario</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1.6 }}>Tenant</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1.3 }}>Perfil</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Status</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1.4 }}>Primeiro acesso</Text>
          <View style={{ width: 90 }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-sm text-gray-500 mt-3">Carregando usuarios...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center">
            <Ionicons name="people-outline" size={28} color="#9CA3AF" />
            <Text className="text-sm text-gray-500 mt-2">Nenhum usuario encontrado.</Text>
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} className="flex-row items-center border-b border-gray-100 px-4 py-3">
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-semibold text-gray-800">{row.name}</Text>
                <Text className="text-xs text-gray-500">{row.email}</Text>
              </View>

              <View style={{ flex: 1.6 }}>
                <Text className="text-sm text-gray-700">
                  {row.role === "super_admin"
                    ? "Global"
                    : row.tenant_id
                    ? tenantNameById.get(row.tenant_id) || `Tenant #${row.tenant_id}`
                    : "-"}
                </Text>
              </View>

              <View style={{ flex: 1.3 }}>
                <Text className="text-sm text-gray-700">{roleLabel(row.role)}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Badge label={statusLabel(row.status)} slug={row.status} />
              </View>

              <View style={{ flex: 1.4 }}>
                <Badge
                  label={row.password_change_required ? "Obrigatoria" : "Nao"}
                  variant={row.password_change_required ? "warning" : "default"}
                />
              </View>

              <View className="flex-row items-center justify-end" style={{ width: 90 }}>
                <TouchableOpacity onPress={() => navigate("users-form", { userId: row.id })} className="p-2" activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={18} color="#6366F1" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteId(row.id)} className="p-2" activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>

      <View className="mt-4">
        <Pagination
          currentPage={meta.current_page}
          lastPage={meta.last_page}
          total={meta.total}
          perPage={meta.per_page}
          onPageChange={setPage}
        />
      </View>

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover usuario"
        message="Deseja realmente remover este usuario? Esta acao nao pode ser desfeita."
        onCancel={() => setDeleteId(null)}
        onConfirm={remove}
        loading={deleting}
      />
    </ScrollView>
  );
}
