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
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CONTAINER,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { roleLabel } from "../../utils/permissions";

type UserRow = {
  id: number;
  tenant_id: number | null;
  is_tenant_owner: boolean;
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

type RoleOption = {
  value: string;
  label: string;
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
  const [roles, setRoles] = useState<RoleOption[]>([]);
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
        setErrorMessage(e.response?.data?.message || "Não foi possível carregar os usuários.");
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
          isSuperAdmin
            ? nextRoles
            : nextRoles.filter((opt) => opt.value !== "super_admin")
        );
      } catch {
        setRoles([]);
      }
    };

    loadRoles();
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
        setErrorMessage(e.response?.data?.message || "Não foi possível remover este usuário.");
      } else {
        setErrorMessage("Não foi possível remover este usuário.");
      }
    }

    setDeleting(false);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Usuários</Text>
          <Text className="text-sm text-ink-muted">Gestão de acesso e perfis da plataforma</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("users-form", { userId: null })}
          className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium text-sm ml-1.5">Novo usuário</Text>
        </TouchableOpacity>
      </View>

      {!!successMessage && (
        <View className="mb-4 rounded-ds-md border border-success bg-success-tint px-4 py-3 flex-row items-start gap-2">
          <Ionicons name="checkmark-circle-outline" size={16} color="var(--ds-success)" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text className="text-sm text-success">{successMessage}</Text>
          </View>
          <TouchableOpacity onPress={() => setSuccessMessage("")}>
            <Ionicons name="close" size={16} color="var(--ds-success)" />
          </TouchableOpacity>
        </View>
      )}

      {forbidden && (
        <View className="mb-4 rounded-ds-md border border-warning bg-warning-tint px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="shield-outline" size={16} color="var(--ds-warning)" />
          <Text className="text-sm text-warning">Seu perfil não possui permissão para gerenciar usuários.</Text>
        </View>
      )}

      {!!errorMessage && (
        <View className="mb-4 rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="alert-circle-outline" size={16} color="var(--ds-danger)" />
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage("")}>
            <Ionicons name="close" size={16} color="var(--ds-danger)" />
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row gap-3 mb-4" style={{ flexWrap: "wrap" as any }}>
        <View className="flex-row items-center bg-surface border border-border rounded-ds-md px-4" style={{ height: 44, minWidth: isMobile ? "100%" : 280, flexGrow: 1 }}>
          <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome ou e-mail..."
            placeholderTextColor="var(--ds-ink-subtle)"
            className="flex-1 ml-2 text-sm text-ink"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
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
              border: "1px solid #D9DDE3",
              borderRadius: 4,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--ds-ink)",
              backgroundColor: "var(--ds-surface)",
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
            border: "1px solid #D9DDE3",
            borderRadius: 4,
            padding: "0 14px",
            fontSize: 14,
            color: "var(--ds-ink)",
            backgroundColor: "var(--ds-surface)",
            height: 44,
            minWidth: isMobile ? "100%" : 170,
          }}
        >
          <option value="">Todos os perfis</option>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e: any) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            border: "1px solid #D9DDE3",
            borderRadius: 4,
            padding: "0 14px",
            fontSize: 14,
            color: "var(--ds-ink)",
            backgroundColor: "var(--ds-surface)",
            height: 44,
            minWidth: isMobile ? "100%" : 150,
          }}
        >
          <option value="">Todos os status</option>
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
      <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: tableMinWidth, }}>
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>Usuário</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.6 }}>Tenant</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.3 }}>Perfil</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Status</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4 }}>Primeiro acesso</Text>
          <View style={{ width: 90 }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
            <Text className="text-sm text-ink-muted mt-3">Carregando usuários...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center">
            <Ionicons name="people-outline" size={28} color="var(--ds-ink-subtle)" />
            <Text className="text-sm text-ink-muted mt-2">Nenhum usuário encontrado.</Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <DataTableRow key={row.id} index={i}>
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-semibold text-ink">{row.name}</Text>
                <Text className="text-xs text-ink-muted">{row.email}</Text>
              </View>

              <View style={{ flex: 1.6 }}>
                <Text className="text-sm text-ink">
                  {row.role === "super_admin"
                    ? "Global"
                    : row.tenant_id
                    ? tenantNameById.get(row.tenant_id) || `Tenant #${row.tenant_id}`
                    : "-"}
                </Text>
              </View>

              <View style={{ flex: 1.3 }}>
                <Text className="text-sm text-ink">{roleLabel(row.role)}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Badge label={statusLabel(row.status)} slug={row.status} />
              </View>

              <View style={{ flex: 1.4 }}>
                <Badge
                  label={row.password_change_required ? "Obrigatória" : "Não"}
                  variant={row.password_change_required ? "warning" : "default"}
                />
              </View>

              <View className="flex-row items-center justify-end" style={{ width: 90 }}>
                <TouchableOpacity onPress={() => navigate("users-form", { userId: row.id })} className="p-2" activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={18} color="var(--ds-brand)" />
                </TouchableOpacity>
                {!row.is_tenant_owner && (
                  <TouchableOpacity onPress={() => setDeleteId(row.id)} className="p-2 bg-danger rounded-ds-md" activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color="var(--ds-on-danger)" />
                  </TouchableOpacity>
                )}
              </View>
            </DataTableRow>
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
        title="Remover usuário"
        message="Deseja realmente remover este usuário? Esta acao não pode ser desfeita."
        onCancel={() => setDeleteId(null)}
        onConfirm={remove}
        loading={deleting}
      />
    </ScrollView>
  );
}
