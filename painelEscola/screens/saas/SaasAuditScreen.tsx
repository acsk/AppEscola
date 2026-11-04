import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Pagination from "../../components/ui/Pagination";
import Icon from "../../components/ui/Icon";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { displayToISO } from "../../utils/masks";
import { fetchGlobalAudit, fmtDateTime, type GlobalAuditItem } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const GROUPS: { value: string; label: string }[] = [
  { value: "", label: "Todas as ações" },
  { value: "tenant", label: "Instituições (status)" },
  { value: "subscription", label: "Assinaturas" },
  { value: "plan", label: "Planos" },
  { value: "feature", label: "Funcionalidades" },
  { value: "quota", label: "Limites" },
  { value: "admin", label: "Administradores globais" },
];

const groupLabel = (action: string) => GROUPS.find((g) => g.value && action.startsWith(`${g.value}.`))?.label ?? action;

/** Plataforma › Administração › Auditoria: ações administrativas de toda a plataforma, com autor, data e IP. */
export default function SaasAuditScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [items, setItems] = useState<GlobalAuditItem[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 30, total: 0 });
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchGlobalAudit({
        group: group || undefined,
        search: search.trim() || undefined,
        date_from: displayToISO(from) || undefined,
        date_to: displayToISO(to) || undefined,
        page,
      });
      setItems(data.items);
      setMeta(data.meta);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a auditoria."));
    } finally {
      setLoading(false);
    }
  }, [group, search, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Administração" }, { label: "Auditoria" }]}
        title="Auditoria"
        description="Ações administrativas da plataforma: status das instituições, planos, assinaturas, funcionalidades, limites e administradores. Acessos assistidos ficam no detalhe de cada instituição."
      />

      <View className="flex-row flex-wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <View className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3 mb-2" style={{ height: 32, flex: 1, minWidth: isMobile ? "100%" : 220, maxWidth: isMobile ? undefined : 320, gap: 8 }}>
          <Icon icon={Search} color={color["ink-subtle"]} />
          <TextInput value={search} onChangeText={resetPage(setSearch)} placeholder="Buscar na descrição" placeholderTextColor={color["ink-subtle"]} aria-label="Buscar na descrição" style={{ flex: 1, fontSize: 14, color: color.ink, height: "100%" }} />
        </View>
        <View style={{ width: isMobile ? "100%" : 220 }}>
          <FormSelect label="Tipo de ação" dense value={group} options={GROUPS} onChange={resetPage(setGroup)} />
        </View>
        <View style={{ width: isMobile ? "100%" : 170 }}>
          <DatePickerInput label="De" value={from} onChangeText={resetPage(setFrom)} compact />
        </View>
        <View style={{ width: isMobile ? "100%" : 170 }}>
          <DatePickerInput label="Até" value={to} onChangeText={resetPage(setTo)} compact />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      <View className="bg-surface border border-border rounded-ds-md">
        {loading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator color={color.brand} />
          </View>
        ) : items.length === 0 ? (
          <Text className="text-sm text-ink-subtle" style={{ padding: 32, textAlign: "center" }}>Nenhuma ação registrada para os filtros escolhidos.</Text>
        ) : (
          items.map((item, i) => (
            <View key={item.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 4 : 16 }}>
              <Text className="text-xs font-mono text-ink-muted" style={{ width: isMobile ? undefined : 130 }}>{fmtDateTime(item.created_at)}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text className="text-sm text-ink">{item.description}</Text>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Badge label={groupLabel(item.action)} tone="neutral" />
                  {item.tenant ? (
                    <TouchableOpacity onPress={() => navigate("tenants-detail", { tenantId: item.tenant!.id, tab: "audit" })} role="link">
                      <Text className="text-xs text-brand font-medium">{item.tenant.name}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <Text className="text-xs text-ink-muted" style={{ width: isMobile ? undefined : 200, textAlign: isMobile ? "left" : "right" }}>
                {[item.user ?? "Sistema", item.ip].filter(Boolean).join(" · ")}
              </Text>
            </View>
          ))
        )}
      </View>
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
    </ScrollView>
  );
}
