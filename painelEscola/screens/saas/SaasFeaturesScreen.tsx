import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import DataTableRow from "../../components/ui/DataTableRow";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { FEATURE_STATUS, fetchFeatureCatalog, setFeatureGlobalStatus, type SaasFeature } from "../../services/saas";

type Feature = Awaited<ReturnType<typeof fetchFeatureCatalog>>[number];

const STATUS_OPTIONS = [
  { value: "enabled", label: "Habilitada (segue o plano)" },
  { value: "beta", label: "Beta (só instituições liberadas)" },
  { value: "disabled", label: "Desabilitada para todos" },
];

/**
 * Plataforma › Funcionalidades › Feature flags. Status global → exceção da instituição → plano.
 * O backend valida cada rota do módulo; esconder o menu é só conveniência.
 */
export default function SaasFeaturesScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [items, setItems] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ feature: Feature; status: SaasFeature["global_status"] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchFeatureCatalog());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar as funcionalidades."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const { data } = await setFeatureGlobalStatus(pending.feature.key, pending.status);
      showApiToast(setToast, data, "Status atualizado.");
      setPending(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível alterar o status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
        <PageHeader
          breadcrumb={[{ label: "Funcionalidades" }, { label: "Feature flags" }]}
          title="Feature flags"
          description="Liga, desliga ou coloca em beta cada módulo para toda a plataforma. Exceções por instituição ficam no detalhe da instituição."
        />

        {error ? (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={load} />
          </View>
        ) : null}

        <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
          <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 820 : undefined }}>
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 2.4, minWidth: 220 }}>Funcionalidade</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.8, minWidth: 180 }}>Incluída nos planos</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 120 }}>Exceções</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.8, minWidth: 220 }}>Status global</Text>
            </View>
            {loading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color={color.brand} />
              </View>
            ) : (
              items.map((f, i) => (
                <DataTableRow key={f.key} index={i}>
                  <View style={{ flex: 2.4, minWidth: 220, paddingRight: 12 }}>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Text className="text-sm font-medium text-ink">{f.name}</Text>
                      <Badge label={FEATURE_STATUS[f.global_status].label} tone={FEATURE_STATUS[f.global_status].tone} />
                    </View>
                    <Text className="text-xs text-ink-subtle" numberOfLines={2}>{f.description}</Text>
                  </View>
                  <Text className="text-sm text-ink-muted" style={{ flex: 1.8, minWidth: 180 }} numberOfLines={2}>
                    {f.plans.length ? f.plans.map((p) => p.name).join(", ") : "Nenhum plano"}
                  </Text>
                  <Text className="text-sm text-ink-muted" style={{ flex: 1.2, minWidth: 120 }}>
                    {f.overrides.enabled || f.overrides.disabled ? `${f.overrides.enabled} liberadas · ${f.overrides.disabled} bloqueadas` : "—"}
                  </Text>
                  <View style={{ flex: 1.8, minWidth: 220 }}>
                    <FormSelect
                      label={`Status global de ${f.name}`}
                      hideLabel
                      dense
                      value={f.global_status}
                      options={STATUS_OPTIONS}
                      onChange={(v) => v !== f.global_status && setPending({ feature: f, status: v as SaasFeature["global_status"] })}
                    />
                  </View>
                </DataTableRow>
              ))
            )}
          </View>
        </ScrollView>

        <Text className="text-xs text-ink-subtle">
          Instituições sem assinatura (legado) têm tudo liberado, exceto funcionalidades desabilitadas ou em beta.
        </Text>
      </ScrollView>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />

      <ConfirmModal
        visible={!!pending}
        title="Alterar status global"
        message={
          pending?.status === "disabled"
            ? `${pending.feature.name} ficará indisponível para todas as instituições, inclusive as que têm exceção.`
            : pending?.status === "beta"
              ? `${pending?.feature.name} ficará disponível só para instituições com exceção liberada.`
              : `${pending?.feature.name} volta a seguir o plano de cada instituição.`
        }
        confirmLabel="Alterar"
        tone={pending?.status === "disabled" ? "danger" : "primary"}
        onCancel={() => setPending(null)}
        onConfirm={apply}
        loading={saving}
      />
    </>
  );
}
