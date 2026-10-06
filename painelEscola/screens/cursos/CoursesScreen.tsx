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
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";

type Course = {
  id: number;
  name: string;
  description: string | null;
  status: string;
};

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

export default function CoursesScreen({ navigate }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Course[]>([]);
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

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/courses", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/courses/${deleteId}`);
      setDeleteId(null);
      fetchCourses();
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
      <View
        className="mb-6"
        style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}
      >
        <View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Cursos</Text>
          <Text className="text-sm text-ink-muted">
            Cursos oferecidos pelo cursinho
          </Text>
        </View>
        <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          <TouchableOpacity
            onPress={() => navigate("pacotes")}
            className="flex-row items-center bg-surface border border-border-strong px-4 rounded-ds-md py-2 min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            <Ionicons name="albums-outline" size={16} color="var(--ds-brand)" />
            <Text className="text-brand font-semibold text-sm ml-1.5">
              Pacotes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigate("cursos-form")}
            className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
            <Text className="text-on-brand font-medium text-sm ml-1.5">
              Novo curso
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View
          className="flex-1 flex-row items-center bg-surface border border-border rounded-ds-md px-4"
          style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
        >
          <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar curso..."
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

      {/* Tabela */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View
        className="bg-surface rounded-ds-md overflow-hidden border border-border"
        style={{
          width: "100%",
          minWidth: tableMinWidth,
        }}
      >
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
            Nome
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 3 }}>
            Descrição
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>
            Status
          </Text>
          <View style={{ width: 72 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="book-outline" size={40} color="var(--ds-border)" />
            <Text className="text-ink-subtle mt-3 text-sm">
              Nenhum curso encontrado
            </Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <DataTableRow key={item.id} index={i}>
              <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 2 }}>
                {item.name}
              </Text>
              <Text className={TABLE_CELL_MUTED} style={{ flex: 3 }} numberOfLines={1}>
                {item.description ?? "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Badge
                  slug={item.status}
                  label={item.status === "active" ? "Ativo" : "Inativo"}
                />
              </View>
              <View
                style={{ width: 72 }}
                className="flex-row justify-end gap-2"
              >
                <TouchableOpacity
                  onPress={() =>
                    navigate("cursos-form", { courseId: item.id })
                  }
                  className="p-1.5 bg-brand-tint rounded-ds-md"
                >
                  <Ionicons name="pencil-outline" size={15} color="var(--ds-brand)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(item.id)}
                  className="p-1.5 bg-danger rounded-ds-md"
                >
                  <Ionicons name="trash-outline" size={15} color="var(--ds-on-danger)" />
                </TouchableOpacity>
              </View>
            </DataTableRow>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-border">
            <Pagination
              currentPage={meta.current_page}
              lastPage={meta.last_page}
              total={meta.total}
              perPage={meta.per_page}
              onPageChange={setPage}
            />
          </View>
        )}
      </View>
      </ScrollView>

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir curso"
        message="Esta ação não pode ser desfeita. O curso e todos os seus planos serão removidos."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
