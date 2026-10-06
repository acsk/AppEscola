import React, { useCallback, useEffect, useState } from "react";
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
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

type Tenant = {
  id: number;
  corporate_name: string;
  trade_name: string | null;
  name: string;
  slug: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  created_at: string;
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

export default function TenantsScreen({ navigate, flashMessage }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [successMessage, setSuccessMessage] = useState(flashMessage ?? "");
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<Meta>({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const { data } = await api.get("/tenants", { params });
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
      }
    }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (flashMessage) setSuccessMessage(flashMessage);
  }, [flashMessage]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/tenants/${deleteId}`);
      setDeleteId(null);
      fetchTenants();
    } catch (e: any) {
      if (e.response?.status === 403) setForbidden(true);
    }
    setDeleting(false);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Tenants</Text>
          <Text className="text-sm text-ink-muted">Gestão de clientes e dados institucionais</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("tenants-form", { tenantId: null })}
          className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium text-sm ml-1.5">Novo tenant</Text>
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
          <Text className="text-sm text-warning">
            Acesso permitido apenas para super admin.
          </Text>
        </View>
      )}

      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View className="flex-1 flex-row items-center bg-surface border border-border rounded-ds-md px-4" style={{ height: 44, maxWidth: isMobile ? undefined : 380 }}>
          <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome, slug ou CNPJ..."
            placeholderTextColor="var(--ds-ink-subtle)"
            className="flex-1 ml-2 text-sm text-ink"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
            </TouchableOpacity>
          )}
        </View>

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
            minWidth: isMobile ? "100%" : 160,
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
          <Text className={TABLE_HEADER_CELL} style={{ flex: 2.2 }}>Tenant</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.5 }}>Slug</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.5 }}>Contato</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Status</Text>
          <View style={{ width: 90 }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
            <Text className="text-sm text-ink-muted mt-3">Carregando tenants...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center">
            <Ionicons name="business-outline" size={28} color="var(--ds-ink-subtle)" />
            <Text className="text-sm text-ink-muted mt-2">Nenhum tenant encontrado.</Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <DataTableRow key={row.id} index={i}>
              <View style={{ flex: 2.2 }}>
                <Text className="text-sm font-semibold text-ink">{row.name}</Text>
                {!!row.corporate_name && (
                  <Text className="text-xs text-ink-muted">{row.corporate_name}</Text>
                )}
                {!!row.cnpj && (
                  <Text className="text-xs text-ink-subtle mt-0.5">CNPJ: {row.cnpj}</Text>
                )}
              </View>

              <View style={{ flex: 1.5 }}>
                <Text className="text-sm text-ink">{row.slug}</Text>
              </View>

              <View style={{ flex: 1.5 }}>
                <Text className="text-sm text-ink">{row.email || "—"}</Text>
                <Text className="text-xs text-ink-muted">{row.phone || row.whatsapp || "Sem telefone"}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Badge
                  label={statusLabel(row.status)}
                  slug={row.status === "active" ? "active" : "inactive"}
                />
              </View>

              <View className="flex-row items-center justify-end" style={{ width: 90 }}>
                <TouchableOpacity onPress={() => navigate("tenants-form", { tenantId: row.id })} className="p-2" activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={18} color="var(--ds-brand)" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteId(row.id)} className="p-2 bg-danger rounded-ds-md" activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color="var(--ds-on-danger)" />
                </TouchableOpacity>
              </View>
            </DataTableRow>
          ))
        )}
      </View>
      </ScrollView>

      <Pagination
        currentPage={meta.current_page}
        lastPage={meta.last_page}
        total={meta.total}
        perPage={meta.per_page}
        onPageChange={setPage}
      />

      <ConfirmModal
        visible={deleteId !== null}
        title="Excluir tenant"
        message="Essa ação remove o tenant. Deseja continuar?"
        onCancel={() => setDeleteId(null)}
        onConfirm={remove}
        loading={deleting}
      />
    </ScrollView>
  );
}
