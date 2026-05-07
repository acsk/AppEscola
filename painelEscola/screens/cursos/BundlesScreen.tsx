import React, { useState, useEffect, useCallback } from "react";
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
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const fmtBRL = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type BundleCourse = { id: number; name: string; status: string };

type Bundle = {
  id: number;
  name: string;
  description: string | null;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  monthly_equivalent: number;
  status: string;
  courses: BundleCourse[];
};

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

export default function BundlesScreen({ navigate }: Props) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [rows, setRows] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/course-bundles", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/course-bundles/${deleteId}`);
      setDeleteId(null);
      fetchBundles();
    } catch {}
    setDeleting(false);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View className="flex-row items-center gap-3" style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={() => navigate("cursos")}
            className="flex-row items-center gap-1.5"
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color="#7C3AED" />
            <Text className="text-sm font-medium text-violet-600">Cursos</Text>
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
          <View>
            <Text className="text-2xl font-bold text-gray-800">Pacotes</Text>
            <Text className="text-sm text-gray-500">
              Pacotes de cursos com cobrança unificada
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigate("pacotes-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo Pacote
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View
          className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
          style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
        >
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar pacote..."
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
            minWidth: isMobile ? "100%" : 160,
          }}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </View>

      {/* Cards de bundles */}
      {loading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : rows.length === 0 ? (
        <View
          className="bg-white rounded-2xl items-center justify-center py-16"
          style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
        >
          <Ionicons name="albums-outline" size={40} color="#E5E7EB" />
          <Text className="text-gray-400 mt-3 text-sm">
            Nenhum pacote encontrado
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {rows.map((bundle) => (
            <View
              key={bundle.id}
              className="bg-white rounded-2xl p-5"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <View style={{ flex: 1, marginRight: isMobile ? 0 : 16, alignSelf: "stretch" }}>
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-base font-bold text-gray-800">
                      {bundle.name}
                    </Text>
                    <Badge
                      slug={bundle.status}
                      label={bundle.status === "active" ? "Ativo" : "Inativo"}
                    />
                  </View>
                  {bundle.description && (
                    <Text className="text-sm text-gray-500 mb-2">
                      {bundle.description}
                    </Text>
                  )}

                  {/* Cursos do pacote */}
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {bundle.courses.map((c) => (
                      <View
                        key={c.id}
                        className="bg-violet-50 border border-violet-100 rounded-full px-2.5 py-0.5"
                      >
                        <Text className="text-xs text-violet-600 font-medium">
                          {c.name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Preço */}
                  <View className="flex-row items-center gap-3">
                    <View className="bg-gray-50 rounded-lg px-3 py-1.5">
                      <Text className="text-xs text-gray-500">
                        {bundle.cycle_label}
                      </Text>
                      <Text className="text-sm font-bold text-gray-800">
                        {fmtBRL(bundle.price)}
                      </Text>
                    </View>
                    <View className="bg-violet-50 rounded-lg px-3 py-1.5">
                      <Text className="text-xs text-violet-500">
                        Equivalente
                      </Text>
                      <Text className="text-sm font-bold text-violet-700">
                        {fmtBRL(bundle.monthly_equivalent)}/mês
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Ações */}
                <View style={{ flexDirection: isMobile ? "row" : "column", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() =>
                      navigate("pacotes-form", { bundleId: bundle.id })
                    }
                    className="p-2 bg-violet-50 rounded-lg"
                  >
                    <Ionicons name="pencil-outline" size={16} color="#7C3AED" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDeleteId(bundle.id)}
                    className="p-2 bg-red-50 rounded-lg"
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {meta.total > 0 && (
        <View className="bg-white rounded-2xl mt-4 px-4 border border-gray-100">
          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onPageChange={setPage}
          />
        </View>
      )}

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Pacote"
        message="Este pacote será removido permanentemente."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
