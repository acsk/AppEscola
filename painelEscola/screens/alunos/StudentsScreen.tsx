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
import { maskPhone, maskCPF, isoToDisplay } from "../../utils/masks";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

type Student = {
  id: number;
  enrollment_number: string | null;
  name: string;
  birth_date: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  is_minor: boolean;
  status: string;
};

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

export default function StudentsScreen({ navigate }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Student[]>([]);
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

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/students", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${deleteId}`);
      setDeleteId(null);
      fetchStudents();
    } catch {}
    setDeleting(false);
  };

  const fmtDate = (iso: string | null) => (iso ? isoToDisplay(iso) : "—");

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      {/* Cabeçalho */}
      <View
        className="mb-6"
        style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-800">Alunos</Text>
          <Text className="text-sm text-gray-500">
            Gerencie os alunos do cursinho
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("alunos-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo Aluno
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View
        className="mb-4"
        style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}
      >
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
            placeholder="Buscar por nome..."
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

      {/* Tabela */}
      <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          minWidth: tableMinWidth,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ width: 112 }}
          >
            Matrícula
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Nome / CPF
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            E-mail
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Telefone
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Nascimento
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Status
          </Text>
          <View style={{ width: 72 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="people-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">
              Nenhum aluno encontrado
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
              <Text style={{ width: 112 }} className="text-xs font-mono text-violet-600 font-semibold">
                {item.enrollment_number ?? "—"}
              </Text>
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-medium text-gray-800">
                  {item.name}
                </Text>
                {item.document && (
                  <Text className="text-xs text-gray-400">
                    {maskCPF(item.document)}
                  </Text>
                )}
              </View>
              <Text className="text-sm text-gray-600" style={{ flex: 2 }}>
                {item.email ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {item.phone ? maskPhone(item.phone) : "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {fmtDate(item.birth_date)}
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
                    navigate("alunos-form", { studentId: item.id })
                  }
                  className="p-1.5 bg-violet-50 rounded-lg"
                >
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
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
      </ScrollView>

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Aluno"
        message="Esta ação não pode ser desfeita. O aluno será removido permanentemente."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
