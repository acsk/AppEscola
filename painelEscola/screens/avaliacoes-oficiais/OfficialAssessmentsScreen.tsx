import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import SearchableSelect from "../../components/ui/SearchableSelect";
import FormInput from "../../components/ui/FormInput";
import Pagination from "../../components/ui/Pagination";
import type { OfficialAssessmentListItem, OfficialAssessmentsScreenProps } from "../../types/avaliacoesOficiais";

const kindLabel = (kind: string) =>
  ({
    presencial_bimestral: "Bimestral",
    presencial_recuperacao: "Recuperação",
    presencial_diagnostico: "Diagnóstico",
    presencial_final: "Final",
    outro: "Outro",
  }[kind] ?? kind);

export default function OfficialAssessmentsScreen({ navigate }: OfficialAssessmentsScreenProps) {
  const { contentPadding } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OfficialAssessmentListItem[]>([]);
  const [classOptions, setClassOptions] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const statusOptions = [
    { value: "draft", label: "Rascunho" },
    { value: "published", label: "Publicada" },
  ];

  const loadClassOptions = useCallback(async () => {
    try {
      const { data } = await api.get("/school-classes", { params: { per_page: 200 } });
      const list = Array.isArray(data?.data) ? data.data : [];
      setClassOptions(
        list.map((c: any) => ({
          value: String(c.id),
          label: String(c.name ?? `Turma #${c.id}`),
        }))
      );
    } catch {
      setClassOptions([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (classFilter) params.school_class_id = classFilter;
      if (dateFrom.trim()) params.assessment_date_from = dateFrom.trim();
      if (dateTo.trim()) params.assessment_date_to = dateTo.trim();

      const { data } = await api.get("/official-assessments", { params });
      const list = Array.isArray(data?.data) ? data.data : [];
      setRows(list);
      setMeta({
        current_page: Number(data?.meta?.current_page ?? 1),
        last_page: Number(data?.meta?.last_page ?? 1),
        per_page: Number(data?.meta?.per_page ?? 20),
        total: Number(data?.meta?.total ?? list.length),
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || "Não foi possível carregar as avaliações.");
      setRows([]);
      setMeta({
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, classFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadClassOptions();
  }, [loadClassOptions]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, classFilter, dateFrom, dateTo]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: contentPadding }}>
      <View className="bg-white rounded-2xl border border-gray-100 p-5">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-xl font-bold text-gray-900">Avaliações presenciais</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Lançamento de notas oficiais para boletim.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigate("avaliacoes-oficiais-form", { assessmentId: null })}
            className="px-4 py-2 rounded-xl bg-violet-600"
            activeOpacity={0.85}
          >
            <Text className="text-sm font-semibold text-white">Nova avaliação</Text>
          </TouchableOpacity>
        </View>

        <View className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <SearchableSelect
            label="Status"
            value={statusFilter}
            options={statusOptions}
            onChange={setStatusFilter}
            placeholder="Todos"
            showSelectedPreview={false}
          />
          <SearchableSelect
            label="Turma"
            value={classFilter}
            options={classOptions}
            onChange={setClassFilter}
            placeholder="Todas"
            showSelectedPreview={false}
          />
          <FormInput
            label="Data inicial (YYYY-MM-DD)"
            value={dateFrom}
            onChangeText={setDateFrom}
            placeholder="2026-01-01"
          />
          <FormInput
            label="Data final (YYYY-MM-DD)"
            value={dateTo}
            onChangeText={setDateTo}
            placeholder="2026-12-31"
          />
        </View>

        {loading ? (
          <View className="py-14 items-center">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : error ? (
          <Text className="text-sm text-red-600">{error}</Text>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-gray-500">Nenhuma avaliação oficial cadastrada.</Text>
        ) : (
          <View className="gap-3">
            {rows.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => navigate("avaliacoes-oficiais-form", { assessmentId: row.id })}
                className="rounded-xl border border-gray-200 bg-white p-4"
                activeOpacity={0.8}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">{row.title}</Text>
                    <Text className="text-xs text-gray-500 mt-1">
                      Turma: {row.school_class?.name ?? "-"} • Tipo: {kindLabel(row.kind)}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">
                      Data: {row.assessment_date} • Notas lançadas: {row.grades_count ?? 0}
                    </Text>
                  </View>
                  <View
                    className={`px-2.5 py-1 rounded-full ${
                      row.status === "published" ? "bg-emerald-100" : "bg-amber-100"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        row.status === "published" ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {row.status === "published" ? "Publicada" : "Rascunho"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && rows.length > 0 && (
          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onPageChange={setPage}
          />
        )}

        <TouchableOpacity onPress={load} className="mt-3 self-start flex-row items-center" activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={16} color="#6B7280" />
          <Text className="text-sm text-gray-600 ml-1">Atualizar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
