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
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Tenants</Text>
          <Text className="text-sm text-gray-500">Gestão de clientes e dados institucionais</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("tenants-form", { tenantId: null })}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Novo Tenant</Text>
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
          <Text className="text-sm text-amber-700">
            Acesso permitido apenas para super admin.
          </Text>
        </View>
      )}

      <View className="flex-row gap-3 mb-4">
        <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4" style={{ height: 44, maxWidth: 380 }}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome, slug ou CNPJ..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 ml-2 text-sm text-gray-800"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
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
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: "0 14px",
            fontSize: 14,
            color: "#374151",
            backgroundColor: "white",
            height: 44,
            minWidth: 160,
          }}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </View>

      <View className="bg-white rounded-2xl overflow-hidden" style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2.2 }}>Tenant</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1.5 }}>Slug</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1.5 }}>Contato</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Status</Text>
          <View style={{ width: 90 }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-sm text-gray-500 mt-3">Carregando tenants...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center">
            <Ionicons name="business-outline" size={28} color="#9CA3AF" />
            <Text className="text-sm text-gray-500 mt-2">Nenhum tenant encontrado.</Text>
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} className="flex-row items-center border-b border-gray-100 px-4 py-3">
              <View style={{ flex: 2.2 }}>
                <Text className="text-sm font-semibold text-gray-800">{row.name}</Text>
                {!!row.corporate_name && (
                  <Text className="text-xs text-gray-500">{row.corporate_name}</Text>
                )}
                {!!row.cnpj && (
                  <Text className="text-xs text-gray-400 mt-0.5">CNPJ: {row.cnpj}</Text>
                )}
              </View>

              <View style={{ flex: 1.5 }}>
                <Text className="text-sm text-gray-700">{row.slug}</Text>
              </View>

              <View style={{ flex: 1.5 }}>
                <Text className="text-sm text-gray-700">{row.email || "—"}</Text>
                <Text className="text-xs text-gray-500">{row.phone || row.whatsapp || "Sem telefone"}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Badge
                  label={statusLabel(row.status)}
                  slug={row.status === "active" ? "active" : "inactive"}
                />
              </View>

              <View className="flex-row items-center justify-end" style={{ width: 90 }}>
                <TouchableOpacity onPress={() => navigate("tenants-form", { tenantId: row.id })} className="p-2" activeOpacity={0.7}>
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