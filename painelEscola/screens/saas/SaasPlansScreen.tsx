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
import PriceScheduleFields, { scheduleDateToIso, scheduleTierInvalid, type PriceTierForm } from "../../components/saas/PriceScheduleFields";

type Form = {
  name: string;
  description: string;
  billing_basis: "flat" | "per_student";
  price_monthly: string;
  price_yearly: string;
  offer_gestao: boolean;
  gestao_price: string;
  schedule: PriceTierForm[];
  trial_days: string;
  status: "active" | "inactive";
  order: string;
  limits: Record<string, string>;
  features: string[];
};

const emptyForm = (resources: QuotaResource[]): Form => ({
  name: "",
  description: "",
  billing_basis: "flat",
  price_monthly: "",
  price_yearly: "",
  offer_gestao: false,
  gestao_price: "",
  schedule: [],
  trial_days: "14",
  status: "active",
  order: "0",
  limits: Object.fromEntries(resources.map((r) => [r.key, ""])),
  features: [],
});

const toForm = (plan: SaasPlan, resources: QuotaResource[]): Form => ({
  name: plan.name,
  description: plan.description ?? "",
  billing_basis: plan.billing_basis === "per_student" ? "per_student" : "flat",
  price_monthly: floatToCurrency(plan.price_monthly),
  price_yearly: plan.price_yearly ? floatToCurrency(plan.price_yearly) : "",
  offer_gestao: plan.gestao_price_monthly != null,
  gestao_price: plan.gestao_price_monthly != null ? floatToCurrency(plan.gestao_price_monthly) : "",
  schedule: (plan.price_schedule ?? []).map((tier) => ({
    from: tier.from,
    until: tier.until ?? "",
    price: floatToCurrency(tier.price),
  })),
  trial_days: String(plan.trial_days),
  status: plan.status,
  order: String(plan.order ?? 0),
  limits: Object.fromEntries(resources.map((r) => [r.key, plan.limits?.[r.key] == null ? "" : String(plan.limits[r.key])])),
  features: plan.features ?? [],
});

const BILLING_OPTIONS: { value: Form["billing_basis"]; label: string }[] = [
  { value: "flat", label: "Valor fixo por mês" },
  { value: "per_student", label: "Por aluno ativo" },
];

function PlanEditor({
  form,
  setForm,
  errors,
  features,
  resources,
  isMobile,
  simStudents,
  setSimStudents,
  toggleFeature,
}: {
  form: Form;
  setForm: (next: Form) => void;
  errors: Record<string, string>;
  features: SaasFeature[];
  resources: QuotaResource[];
  isMobile: boolean;
  simStudents: string;
  setSimStudents: (value: string) => void;
  toggleFeature: (key: string) => void;
}) {
  const perStudent = form.billing_basis === "per_student";
  const unit = currencyToFloat(form.price_monthly || "0");
  const students = Number(simStudents || 0);
  const gestao = form.offer_gestao ? currencyToFloat(form.gestao_price || "0") : 0;
  const base = perStudent ? students * unit : unit;
  const total = base + gestao;
  const selected = form.features.length;

  return (
    <View className={isMobile ? "" : "flex-row"} style={{ gap: 16, alignItems: "flex-start" }}>
      <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">Dados do plano</Text>
          <FormInput label="Nome" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Ex.: Conectivo Reforço" />
          <FormInput label="Descrição" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline placeholder="O que o plano oferece" />
          <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <FormSelect label="Status" value={form.status} options={[{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }]} onChange={(v) => setForm({ ...form, status: v as Form["status"] })} />
            </View>
            <View style={{ width: 100 }}>
              <FormInput label="Ordem" valueFormat="integer" maxDigits={3} value={form.order} onChangeText={(v) => setForm({ ...form, order: v })} />
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">Preço e período de teste</Text>
          <Text className="text-xs font-medium text-ink">Cobrança</Text>
          <View className="flex-row border border-border rounded-ds-md overflow-hidden">
            {BILLING_OPTIONS.map((option) => {
              const on = form.billing_basis === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setForm({ ...form, billing_basis: option.value })}
                  className={on ? "bg-brand" : "bg-surface"}
                  style={{ flex: 1, height: 38, alignItems: "center", justifyContent: "center" }}
                >
                  <Text className="text-sm" style={{ color: on ? color["on-brand"] : color.ink, fontWeight: on ? "600" : "400" }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-xs text-ink-muted">O painel administrativo não é cobrado.</Text>
          <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <FormInput
                label={perStudent ? "Preço por aluno" : "Preço mensal"}
                required
                valueFormat="currency"
                value={form.price_monthly}
                onChangeText={(v) => setForm({ ...form, price_monthly: v })}
                error={errors.price_monthly}
                placeholder="0,00"
              />
            </View>
            {perStudent ? null : (
              <View style={{ flex: 1, minWidth: 160 }}>
                <FormInput label="Preço anual" valueFormat="currency" value={form.price_yearly} onChangeText={(v) => setForm({ ...form, price_yearly: v })} error={errors.price_yearly} placeholder="Vazio = 12× o mensal" />
              </View>
            )}
            <View style={{ width: 140 }}>
              <FormInput label="Dias de teste" valueFormat="integer" maxDigits={3} value={form.trial_days} onChangeText={(v) => setForm({ ...form, trial_days: v })} error={errors.trial_days} />
            </View>
          </View>
          <Pressable
            role="switch"
            aria-checked={form.offer_gestao}
            onPress={() => setForm({ ...form, offer_gestao: !form.offer_gestao })}
            className="flex-row items-center border border-border rounded-ds-md bg-surface"
            style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}
          >
            <View className={`rounded-full ${form.offer_gestao ? "bg-brand" : "bg-border"}`} style={{ width: 36, height: 20, padding: 2, alignItems: form.offer_gestao ? "flex-end" : "flex-start" }}>
              <View className="bg-surface rounded-full" style={{ width: 16, height: 16 }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-sm text-ink">Oferecer módulo gestão</Text>
              <Text className="text-xs text-ink-muted">{form.offer_gestao ? "Incluído no contrato. 0,00 entra grátis." : "Desligado: a gestão não entra no contrato."}</Text>
            </View>
          </Pressable>
          {form.offer_gestao ? (
            <FormInput label="Valor mensal da gestão" valueFormat="currency" value={form.gestao_price} onChangeText={(v) => setForm({ ...form, gestao_price: v })} error={errors.gestao_price_monthly} placeholder="0,00 = grátis" />
          ) : null}
          {perStudent ? (
            <PriceScheduleFields tiers={form.schedule} onChange={(schedule) => setForm({ ...form, schedule })} error={errors.price_schedule} />
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">Limites</Text>
          <Text className="text-xs text-ink-muted">Em branco = ilimitado. No limite, só o cadastro de novos itens é bloqueado.</Text>
          <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
            {resources.map((resource) => (
              <View key={resource.key} style={{ width: isMobile ? "100%" : "31%" }}>
                <FormInput
                  label={resource.label}
                  valueFormat="integer"
                  maxDigits={8}
                  value={form.limits[resource.key] ?? ""}
                  onChangeText={(v) => setForm({ ...form, limits: { ...form.limits, [resource.key]: v } })}
                  placeholder="Ilimitado"
                  error={errors[`limits.${resource.key}`]}
                  dense
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">{`Funcionalidades incluídas · ${selected} de ${features.length}`}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {features.map((feature) => {
              const checked = form.features.includes(feature.key);
              return (
                <Pressable
                  key={feature.key}
                  role="checkbox"
                  aria-checked={checked}
                  onPress={() => toggleFeature(feature.key)}
                  className={`flex-row items-center border rounded-ds-md ${checked ? "border-brand bg-brand-tint" : "border-border bg-surface"}`}
                  style={{ paddingHorizontal: 10, height: 34, gap: 6, width: isMobile ? "100%" : "48.5%" }}
                >
                  <View className={`items-center justify-center border rounded-ds-sm ${checked ? "bg-brand border-brand" : "border-border-strong"}`} style={{ width: 16, height: 16 }}>
                    {checked ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : null}
                  </View>
                  <Text className="text-sm text-ink" numberOfLines={1} style={{ flex: 1 }}>{feature.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={{ width: isMobile ? "100%" : 280, gap: 12 }}>
        <View className="border border-border rounded-ds-md bg-surface" style={{ padding: 14, gap: 6 }}>
          <Text className="text-xs font-medium text-ink-muted">Como o cliente vê</Text>
          <Text className="text-base font-semibold text-ink">{form.name.trim() || "Nome do plano"}</Text>
          <Text className="text-2xl font-mono text-ink">
            {fmtBrl(unit)}
            <Text className="text-sm text-ink-muted">{perStudent ? " /aluno/mês" : " /mês"}</Text>
          </Text>
          <Text className="text-xs text-ink-muted">{form.trial_days && form.trial_days !== "0" ? `${form.trial_days} dias grátis para testar` : "Sem período de teste"}</Text>
          <Text className="text-xs text-ink-muted">Painel incluso, sem cobrança</Text>
          <Text className="text-xs text-ink-muted">{form.offer_gestao ? `Gestão ${gestao === 0 ? "grátis" : `${fmtBrl(gestao)}/mês`}` : "Gestão não inclusa"}</Text>
          <Text className="text-xs text-ink-subtle">{`${selected} funcionalidades`}</Text>
        </View>

        <View className="border border-border rounded-ds-md bg-surface-sunken" style={{ padding: 14, gap: 8 }}>
          <Text className="text-xs font-medium text-ink-muted">Simular cobrança mensal de um cliente</Text>
          {perStudent ? (
            <FormInput label="Alunos com acesso ao app" valueFormat="integer" maxDigits={6} value={simStudents} onChangeText={setSimStudents} dense />
          ) : (
            <Text className="text-xs text-ink-muted">O valor fixo não muda com a quantidade de alunos.</Text>
          )}
          <SimLine label={perStudent ? `${students.toLocaleString("pt-BR")} alunos × ${fmtBrl(unit)}` : "Plano"} value={fmtBrl(base)} />
          <SimLine label="Módulo gestão" value={form.offer_gestao ? fmtBrl(gestao) : "não contratada"} />
          <SimLine label="Painel" value="R$ 0,00" />
          <View className="flex-row justify-between border-t border-border" style={{ paddingTop: 8 }}>
            <Text className="text-sm font-semibold text-ink">Fatura do mês</Text>
            <Text className="text-sm font-mono font-semibold text-ink">{fmtBrl(total)}</Text>
          </View>
          {perStudent ? <Text className="text-xs text-ink-subtle">A faixa de datas da assinatura pode cobrar outro valor no mês.</Text> : null}
        </View>
      </View>
    </View>
  );
}

function SimLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between" style={{ gap: 8 }}>
      <Text className="text-xs text-ink-muted" style={{ flex: 1 }}>{label}</Text>
      <Text className="text-xs font-mono text-ink">{value}</Text>
    </View>
  );
}

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
  const [simStudents, setSimStudents] = useState("10");

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
    if (form.price_monthly === "") local.price_monthly = form.billing_basis === "per_student" ? "Informe o preço por aluno (pode ser 0,00)." : "Informe o preço mensal (pode ser 0,00).";
    if (form.billing_basis === "per_student" && form.schedule.some(scheduleTierInvalid)) {
      local.price_schedule = "Preencha a data inicial no formato DD/MM/AAAA e o valor de cada faixa.";
    }
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
        billing_basis: form.billing_basis,
        price_monthly: currencyToFloat(form.price_monthly),
        price_yearly: form.billing_basis === "per_student" || !form.price_yearly ? null : currencyToFloat(form.price_yearly),
        offer_gestao: form.offer_gestao,
        gestao_price_monthly: form.offer_gestao ? currencyToFloat(form.gestao_price || "0") : null,
        price_schedule: form.billing_basis === "per_student"
          ? form.schedule.filter((tier) => scheduleDateToIso(tier.from) || tier.price).map((tier) => ({
              from: scheduleDateToIso(tier.from),
              until: scheduleDateToIso(tier.until) || null,
              price: currencyToFloat(tier.price),
            }))
          : null,
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
          description="Planos oferecidos às instituições. A cobrança pode ser um valor fixo ou por aluno com acesso ao app. O painel entra sem cobrança. O módulo gestão é opcional: grátis ou com valor à parte."
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
                <DataTableRow key={plan.id} index={i} onPress={() => open(plan)}>
                  <View style={{ flex: 2.2, minWidth: 180 }}>
                    <Text className="text-sm font-medium text-ink" numberOfLines={1}>{plan.name}</Text>
                    <Text className="text-xs text-ink-subtle" numberOfLines={1}>{`${limitSummary(plan)} · ${(plan.features ?? []).length} funcionalidades`}</Text>
                  </View>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>{plan.billing_basis === "per_student" ? `${fmtBrl(plan.price_monthly)}/aluno` : fmtBrl(plan.price_monthly)}</Text>
                  <Text className="text-sm font-mono text-ink-muted" style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>
                    {plan.billing_basis === "per_student" ? (plan.price_schedule?.length ? `${plan.price_schedule.length} faixas` : "Sem faixa") : plan.price_yearly ? fmtBrl(plan.price_yearly) : "12× mensal"}
                  </Text>
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
        size="xl"
        compact
        maxHeight="92%"
        showScrollIndicator
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Cancelar" onPress={close} disabled={saving} />
            <Button variant="primary" label="Salvar plano" onPress={submit} loading={saving} />
          </View>
        }
      >
        {form ? <PlanEditor
          form={form}
          setForm={setForm}
          errors={errors}
          features={features}
          resources={resources}
          isMobile={isMobile}
          simStudents={simStudents}
          setSimStudents={setSimStudents}
          toggleFeature={toggleFeature}
        /> : null}
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
