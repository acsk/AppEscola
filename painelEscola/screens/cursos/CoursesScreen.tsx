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
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Cursos</Text>
          <Text className="text-sm text-gray-500">
            Cursos oferecidos pelo cursinho
          </Text>
        </View>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => navigate("pacotes")}
            className="flex-row items-center bg-white border border-violet-200 px-4 py-2.5 rounded-xl"
            activeOpacity={0.85}
          >
            <Ionicons name="albums-outline" size={16} color="#7C3AED" />
            <Text className="text-violet-600 font-semibold text-sm ml-1.5">
              Pacotes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigate("cursos-form")}
            className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="white" />
            <Text className="text-white font-semibold text-sm ml-1.5">
              Novo Curso
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filtros */}
      <View className="flex-row gap-3 mb-4">
        <View
          className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
          style={{ height: 44, maxWidth: 360 }}
        >
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar curso..."
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

      {/* Tabela */}
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Nome
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 3 }}
          >
            Descrição
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Status
          </Text>
          <View style={{ width: 104 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="book-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">
              Nenhum curso encontrado
            </Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${
                i % 2 === 1 ? "bg-gray-50/40" : ""
              }`}
            >
              <Text
                className="text-sm font-medium text-gray-800"
                style={{ flex: 2 }}
              >
                {item.name}
              </Text>
              <Text
                className="text-sm text-gray-600"
                style={{ flex: 3 }}
                numberOfLines={1}
              >
                {item.description ?? "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Badge
                  slug={item.status}
                  label={item.status === "active" ? "Ativo" : "Inativo"}
                />
              </View>
              <View
                style={{ width: 104 }}
                className="flex-row justify-end gap-2"
              >
                <TouchableOpacity
                  onPress={() =>
                    navigate("cursos-form", { courseId: item.id })
                  }
                  className="flex-row items-center px-2.5 py-1.5 bg-violet-50 rounded-lg gap-1"
                >
                  <Ionicons name="list-outline" size={14} color="#7C3AED" />
                  <Text className="text-xs font-semibold text-violet-600">
                    Planos
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(item.id)}
                  className="p-1.5 bg-red-50 rounded-lg"
                >
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-gray-100">
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

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Curso"
        message="Esta ação não pode ser desfeita. O curso e todos os seus planos serão removidos."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
