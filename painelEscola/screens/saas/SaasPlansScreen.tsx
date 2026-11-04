import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Check, Pencil, Plus } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import DeleteIconButton from "../../components/ui/DeleteIconButton";
import ToastBanner from "../../components/ui/ToastBanner";
import DataTableRow from "../../components/ui/DataTableRow";
import Icon from "../../components/ui/Icon";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { currencyToFloat, floatToCurrency } from "../../utils/masks";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { deletePlan, fetchPlans, fmtBrl, savePlan, type QuotaResource, type SaasFeature, type SaasPlan } from "../../services/saas";

type Form = {
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  trial_days: string;
  status: "active" | "inactive";
  order: string;
  limits: Record<string, string>;
  features: string[];
};

const emptyForm = (resources: QuotaResource[]): Form => ({
  name: "",
  description: "",
  price_monthly: "",
  price_yearly: "",
  trial_days: "14",
  status: "active",
  order: "0",
  limits: Object.fromEntries(resources.map((r) => [r.key, ""])),
  features: [],
});

const toForm = (plan: SaasPlan, resources: QuotaResource[]): Form => ({
  name: plan.name,
  description: plan.description ?? "",
  price_monthly: floatToCurrency(plan.price_monthly),
  price_yearly: plan.price_yearly ? floatToCurrency(plan.price_yearly) : "",
  trial_days: String(plan.trial_days),
  status: plan.status,
  order: String(plan.order ?? 0),
  limits: Object.fromEntries(resources.map((r) => [r.key, plan.limits?.[r.key] == null ? "" : String(plan.limits[r.key])])),
  features: plan.features ?? [],
});

/** Plataforma › Comercial › Planos SaaS: nomes, preços, teste, limites e funcionalidades configuráveis. */
export default function SaasPlansScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [features, setFeatures] = useState<SaasFeature[]>([]);
  const [resources, setResources] = useState<QuotaResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SaasPlan | null | "new">(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<SaasPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPlans();
      setPlans(data.plans);
      setFeatures(data.features);
      setResources(data.resources);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os planos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (plan: SaasPlan | "new") => {
    setEditing(plan);
    setErrors({});
    setForm(plan === "new" ? emptyForm(resources) : toForm(plan, resources));
  };

  const close = () => {
    setEditing(null);
    setForm(null);
  };

  const submit = async () => {
    if (!form) return;
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Informe o nome do plano.";
    if (form.price_monthly === "") local.price_monthly = "Informe o preço mensal (pode ser 0,00).";
    if (Object.keys(local).length) {
      setErrors(local);
      setToast({ visible: true, type: "error", message: Object.values(local)[0] });
      return;
    }
    setSaving(true);
    try {
      const { data } = await savePlan(editing && editing !== "new" ? editing.id : null, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_monthly: currencyToFloat(form.price_monthly),
        price_yearly: form.price_yearly ? currencyToFloat(form.price_yearly) : null,
        trial_days: Number(form.trial_days || 0),
        status: form.status,
        order: Number(form.order || 0),
        limits: Object.fromEntries(Object.entries(form.limits).map(([k, v]) => [k, v === "" ? null : Number(v)])),
        features: form.features,
      });
      showApiToast(setToast, data, "Plano salvo com sucesso.");
      close();
      load();
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível salvar o plano.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const { data } = await deletePlan(toDelete.id);
      showApiToast(setToast, data, "Plano excluído.");
      setToDelete(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível excluir o plano.");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleFeature = (key: string) =>
    setForm((f) => (f ? { ...f, features: f.features.includes(key) ? f.features.filter((k) => k !== key) : [...f.features, key] } : f));

  const limitSummary = (plan: SaasPlan) => {
    const students = plan.limits?.students;
    return students == null ? "Alunos ilimitados" : `Até ${students.toLocaleString("pt-BR")} alunos`;
  };

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
        <PageHeader
          breadcrumb={[{ label: "Comercial" }, { label: "Planos SaaS" }]}
          title="Planos SaaS"
          description="Planos oferecidos às instituições: preço, teste, limites e funcionalidades incluídas."
          actions={<Button variant="primary" icon={Plus} label="Novo plano" onPress={() => open("new")} disabled={loading} />}
        />

        {error ? (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={load} />
          </View>
        ) : null}

        <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
          <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 720 : undefined }}>
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 2.2, minWidth: 180 }}>Plano</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>Mensal</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>Anual</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8, minWidth: 70, textAlign: "right" }}>Teste</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 90, paddingLeft: 16 }}>Status</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.9, minWidth: 80, textAlign: "right" }}>Assinantes</Text>
              <View style={{ width: 96 }} />
            </View>
            {loading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color={color.brand} />
              </View>
            ) : plans.length === 0 ? (
              <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
                <Text className="text-sm text-ink">Nenhum plano cadastrado.</Text>
                <Text className="text-xs text-ink-muted" style={{ textAlign: "center" }}>
                  Sem assinatura, as instituições continuam com tudo liberado e sem limites.
                </Text>
              </View>
            ) : (
              plans.map((plan, i) => (
                <DataTableRow key={plan.id} index={i}>
                  <View style={{ flex: 2.2, minWidth: 180 }}>
                    <Text className="text-sm font-medium text-ink" numberOfLines={1}>{plan.name}</Text>
                    <Text className="text-xs text-ink-subtle" numberOfLines={1}>{`${limitSummary(plan)} · ${(plan.features ?? []).length} funcionalidades`}</Text>
                  </View>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>{fmtBrl(plan.price_monthly)}</Text>
                  <Text className="text-sm font-mono text-ink-muted" style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>{plan.price_yearly ? fmtBrl(plan.price_yearly) : "12× mensal"}</Text>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 0.8, minWidth: 70, textAlign: "right" }}>{plan.trial_days ? `${plan.trial_days} d` : "—"}</Text>
                  <View style={{ flex: 1, minWidth: 90, paddingLeft: 16 }}>
                    <Badge label={plan.status === "active" ? "Ativo" : "Inativo"} tone={plan.status === "active" ? "success" : "neutral"} />
                  </View>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 0.9, minWidth: 80, textAlign: "right" }}>{plan.subscriptions_count}</Text>
                  <View className="flex-row justify-end" style={{ width: 96, gap: 4 }}>
                    <Button size="sm" variant="ghost" icon={Pencil} iconOnly accessibilityLabel={`Editar ${plan.name}`} onPress={() => open(plan)} />
                    <DeleteIconButton onPress={() => setToDelete(plan)} label={`Excluir ${plan.name}`} />
                  </View>
                </DataTableRow>
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />

      <Modal
        visible={!!form}
        title={editing === "new" ? "Novo plano" : "Editar plano"}
        onClose={close}
        size="lg"
        compact
        maxHeight="88%"
        showScrollIndicator
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Cancelar" onPress={close} disabled={saving} />
            <Button variant="primary" label="Salvar plano" onPress={submit} loading={saving} />
          </View>
        }
      >
        {form ? (
          <View style={{ gap: 10 }}>
            <FormInput label="Nome" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Ex.: Profissional" />
            <FormInput label="Descrição" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline placeholder="O que o plano oferece" />
            <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <FormInput label="Preço mensal (R$)" required valueFormat="currency" value={form.price_monthly} onChangeText={(v) => setForm({ ...form, price_monthly: v })} error={errors.price_monthly} placeholder="0,00" />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <FormInput label="Preço anual (R$)" valueFormat="currency" value={form.price_yearly} onChangeText={(v) => setForm({ ...form, price_yearly: v })} error={errors.price_yearly} placeholder="Vazio = 12× o mensal" />
              </View>
            </View>
            <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <FormInput label="Dias de teste" valueFormat="integer" maxDigits={3} value={form.trial_days} onChangeText={(v) => setForm({ ...form, trial_days: v })} error={errors.trial_days} />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <FormSelect label="Status" value={form.status} options={[{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo (sem novas contratações)" }]} onChange={(v) => setForm({ ...form, status: v as Form["status"] })} />
              </View>
              <View style={{ flex: 1, minWidth: 100 }}>
                <FormInput label="Ordem" valueFormat="integer" maxDigits={3} value={form.order} onChangeText={(v) => setForm({ ...form, order: v })} />
              </View>
            </View>

            <Text className="text-sm font-semibold text-ink" style={{ marginTop: 8 }}>Limites</Text>
            <Text className="text-xs text-ink-muted">Deixe em branco para ilimitado. Ao atingir o limite, só o cadastro de novos itens é bloqueado.</Text>
            <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
              {resources.map((r) => (
                <View key={r.key} style={{ width: isMobile ? "100%" : "31%" }}>
                  <FormInput
                    label={r.label}
                    valueFormat="integer"
                    maxDigits={8}
                    value={form.limits[r.key] ?? ""}
                    onChangeText={(v) => setForm({ ...form, limits: { ...form.limits, [r.key]: v } })}
                    placeholder="Ilimitado"
                    error={errors[`limits.${r.key}`]}
                    dense
                  />
                </View>
              ))}
            </View>

            <Text className="text-sm font-semibold text-ink" style={{ marginTop: 8 }}>Funcionalidades incluídas</Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {features.map((f) => {
                const checked = form.features.includes(f.key);
                return (
                  <Pressable
                    key={f.key}
                    role="checkbox"
                    aria-checked={checked}
                    onPress={() => toggleFeature(f.key)}
                    className={`flex-row items-center border rounded-ds-md ${checked ? "border-brand bg-brand-tint" : "border-border bg-surface"}`}
                    style={{ paddingHorizontal: 10, height: 34, gap: 6, width: isMobile ? "100%" : "48.5%" }}
                  >
                    <View className={`items-center justify-center border rounded-ds-sm ${checked ? "bg-brand border-brand" : "border-border-strong"}`} style={{ width: 16, height: 16 }}>
                      {checked ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : null}
                    </View>
                    <Text className="text-sm text-ink" numberOfLines={1} style={{ flex: 1 }}>{f.name}</Text>
                    {f.global_status !== "enabled" ? <Badge label={f.global_status === "beta" ? "Beta" : "Desabilitada"} tone={f.global_status === "beta" ? "warning" : "neutral"} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </Modal>

      <ConfirmModal
        visible={!!toDelete}
        title="Excluir plano"
        message={`Excluir o plano ${toDelete?.name}? Planos com assinaturas não podem ser excluídos: inative-os.`}
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
      />
    </>
  );
}
