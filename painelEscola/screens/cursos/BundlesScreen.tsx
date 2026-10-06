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
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";

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
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <ScreenBreadcrumb items={[{ label: "Cursos", onPress: () => navigate("cursos") }, { label: "Pacotes" }]} />
          <View>
            <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Pacotes</Text>
            <Text className="text-sm text-ink-muted">
              Pacotes de cursos com cobrança unificada
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigate("pacotes-form")}
          className="flex-row items-center bg-brand px-5 py-2.5 rounded-ds-md"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo pacote
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View
          className="flex-1 flex-row items-center bg-surface border border-border rounded-ds-md px-4"
          style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
        >
          <Ionicons name="search-outline" size={16} color="#5F6878" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar pacote..."
            placeholderTextColor="#5F6878"
            className="flex-1 ml-2 text-sm text-ink"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#5F6878" />
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
            color: "#111722",
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
          <ActivityIndicator size="large" color="#1C3D63" />
        </View>
      ) : rows.length === 0 ? (
        <View
          className="bg-surface rounded-ds-md items-center justify-center py-16 border border-border"
          style={{ }}
        >
          <Ionicons name="albums-outline" size={40} color="#D9DDE3" />
          <Text className="text-ink-subtle mt-3 text-sm">
            Nenhum pacote encontrado
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {rows.map((bundle) => (
            <View
              key={bundle.id}
              className="bg-surface rounded-ds-md p-5 border border-border"
              style={{
              }}
            >
              <View style={{ flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <View style={{ flex: 1, marginRight: isMobile ? 0 : 16, alignSelf: "stretch" }}>
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-base font-semibold text-ink">
                      {bundle.name}
                    </Text>
                    <Badge
                      slug={bundle.status}
                      label={bundle.status === "active" ? "Ativo" : "Inativo"}
                    />
                  </View>
                  {bundle.description && (
                    <Text className="text-sm text-ink-muted mb-2">
                      {bundle.description}
                    </Text>
                  )}

                  {/* Cursos do pacote */}
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {bundle.courses.map((c) => (
                      <View
                        key={c.id}
                        className="bg-brand-tint border border-border rounded-full px-2.5 py-0.5"
                      >
                        <Text className="text-xs text-brand font-medium">
                          {c.name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Preço */}
                  <View className="flex-row items-center gap-3">
                    <View className="bg-surface-sunken rounded-ds-md px-3 py-1.5">
                      <Text className="text-xs text-ink-muted">
                        {bundle.cycle_label}
                      </Text>
                      <Text className="text-sm font-semibold text-ink">
                        {fmtBRL(bundle.price)}
                      </Text>
                    </View>
                    <View className="bg-brand-tint rounded-ds-md px-3 py-1.5">
                      <Text className="text-xs text-brand">
                        Equivalente
                      </Text>
                      <Text className="text-sm font-semibold text-brand">
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
                    className="p-2 bg-brand-tint rounded-ds-md"
                  >
                    <Ionicons name="pencil-outline" size={16} color="#1C3D63" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDeleteId(bundle.id)}
                    className="p-2 bg-danger-tint rounded-ds-md"
                  >
                    <Ionicons name="trash-outline" size={16} color="#B0261B" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {meta.total > 0 && (
        <View className="bg-surface rounded-ds-md mt-4 px-4 border border-border">
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
        title="Excluir pacote"
        message="Este pacote será removido permanentemente."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
