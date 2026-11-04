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
import SupportAccessModal from "../../components/tenants/SupportAccessModal";
import SupportAccessHistory from "../../components/tenants/SupportAccessHistory";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Pagination from "../../components/ui/Pagination";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import { TENANT_STATUS_LABEL, tenantStatusTone, fmtInt } from "../../services/saas";
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
  students_count?: number;
  users_count?: number;
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

/** DD/MM/AAAA → AAAA-MM-DD (vazio se incompleta). */
const toIsoDate = (value: string) => {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export default function TenantsScreen({ navigate, flashMessage }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [successMessage, setSuccessMessage] = useState(flashMessage ?? "");
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<Meta>({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [accessTenant, setAccessTenant] = useState<{ id: number; name: string } | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (toIsoDate(createdFrom)) params.created_from = toIsoDate(createdFrom);
      if (toIsoDate(createdTo)) params.created_to = toIsoDate(createdTo);

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
  }, [page, search, statusFilter, createdFrom, createdTo]);

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
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Instituições</Text>
          <Text className="text-sm text-ink-muted">Tenants da plataforma: dados, uso, usuários e acesso assistido</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("tenants-form", { tenantId: null })}
          className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium text-sm ml-1.5">Nova instituição</Text>
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

      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end", flexWrap: "wrap", gap: 12 }}>
        <View className="flex-1 flex-row items-center bg-surface border border-border rounded-ds-md px-4 mb-2" style={{ height: 38, minWidth: isMobile ? undefined : 260, maxWidth: isMobile ? undefined : 380 }}>
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

        <View style={{ width: isMobile ? "100%" : 180 }}>
          <FormSelect
            label="Status"
            value={statusFilter}
            dense
            options={[
              { value: "", label: "Todos os status" },
              { value: "active", label: "Ativo" },
              { value: "suspended", label: "Suspenso" },
              { value: "inactive", label: "Inativo" },
            ]}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 170 }}>
          <DatePickerInput label="Criado de" value={createdFrom} compact onChangeText={(v) => { setCreatedFrom(v); setPage(1); }} />
        </View>
        <View style={{ width: isMobile ? "100%" : 170 }}>
          <DatePickerInput label="Criado até" value={createdTo} compact onChangeText={(v) => { setCreatedTo(v); setPage(1); }} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: tableMinWidth, }}>
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 2.2 }}>Instituição</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.5 }}>Contato</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8, textAlign: "right" }}>Alunos</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8, textAlign: "right" }}>Usuários</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1, paddingLeft: 16 }}>Status</Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 0.9 }}>Criado em</Text>
          <View style={{ width: 190 }} />
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
              <TouchableOpacity style={{ flex: 2.2 }} onPress={() => navigate("tenants-detail", { tenantId: row.id })} role="link" activeOpacity={0.7}>
                <Text className="text-sm font-semibold text-brand">{row.name}</Text>
                {!!row.corporate_name && (
                  <Text className="text-xs text-ink-muted">{row.corporate_name}</Text>
                )}
                <Text className="text-xs text-ink-subtle mt-0.5">{row.cnpj ? `CNPJ ${row.cnpj} · ${row.slug}` : row.slug}</Text>
              </TouchableOpacity>

              <View style={{ flex: 1.5 }}>
                <Text className="text-sm text-ink">{row.email || "—"}</Text>
                <Text className="text-xs text-ink-muted">{row.phone || row.whatsapp || "Sem telefone"}</Text>
              </View>

              <Text className="text-sm font-mono text-ink" style={{ flex: 0.8, textAlign: "right" }}>{fmtInt(row.students_count ?? 0)}</Text>
              <Text className="text-sm font-mono text-ink" style={{ flex: 0.8, textAlign: "right" }}>{fmtInt(row.users_count ?? 0)}</Text>

              <View style={{ flex: 1, paddingLeft: 16 }}>
                <Badge label={TENANT_STATUS_LABEL[row.status] ?? row.status} tone={tenantStatusTone(row.status)} />
              </View>

              <Text className="text-sm font-mono text-ink-muted" style={{ flex: 0.9 }}>{fmtDate(row.created_at)}</Text>

              <View className="flex-row items-center justify-end" style={{ width: 190, gap: 4 }}>
                {row.status === "active" && (
                  <TouchableOpacity
                    onPress={() => setAccessTenant({ id: row.id, name: row.name })}
                    aria-label={`Acessar ${row.name}`}
                    className="flex-row items-center border border-brand rounded-ds-md px-3 py-1.5 mr-1"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="log-in-outline" size={16} color="var(--ds-brand)" />
                    <Text className="text-brand font-medium text-sm ml-1.5">Acessar</Text>
                  </TouchableOpacity>
                )}
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

      <SupportAccessHistory />

      <SupportAccessModal tenant={accessTenant} onClose={() => setAccessTenant(null)} />

      <ConfirmModal
        visible={deleteId !== null}
        title="Excluir instituição"
        message="Essa ação remove a instituição (exclusão lógica). Para interromper o uso sem excluir, prefira Suspender no detalhe. Deseja continuar?"
        onCancel={() => setDeleteId(null)}
        onConfirm={remove}
        loading={deleting}
      />
    </ScrollView>
  );
}
