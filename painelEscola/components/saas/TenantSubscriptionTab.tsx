import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import FormInput from "../ui/FormInput";
import FormSelect from "../ui/FormSelect";
import DefinitionRows from "../ui/DefinitionRows";
import { color } from "../../constants/theme";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import {
  cycleLabel,
  fetchPlans,
  fetchTenantSubscription,
  fmtBrl,
  fmtIsoDate,
  setSubscriptionDiscount,
  subscriptionAction,
  SUBSCRIPTION_STATUS,
  type SaasPlan,
  type Subscription,
  type SubscriptionEvent,
} from "../../services/saas";

type Props = {
  tenantId: number;
  isMobile: boolean;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
  /** Avisa a tela para recarregar abas que dependem do plano (funcionalidades, consumo). */
  onChanged?: () => void;
};

type Mode = "subscribe" | "change" | "renew" | "cancel" | "reactivate" | "trial" | "discount";

const EVENT_LABEL: Record<string, string> = {
  created: "Assinatura contratada",
  plan_changed: "Plano alterado",
  renewed: "Renovação registrada",
  canceled: "Cancelada",
  reactivated: "Reativada",
  trial_extended: "Teste estendido",
  trial_expired: "Teste expirado",
  past_due: "Vencimento em atraso",
  discount_changed: "Desconto alterado",
};

const CYCLE_OPTIONS = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

const MODE_TITLE: Record<Mode, string> = {
  subscribe: "Contratar assinatura",
  change: "Trocar plano",
  renew: "Registrar renovação",
  cancel: "Cancelar assinatura",
  reactivate: "Reativar assinatura",
  trial: "Estender período de teste",
  discount: "Alterar desconto",
};

function eventDetail(e: SubscriptionEvent): string {
  const d = e.data ?? {};
  if (e.type === "plan_changed") return `${e.from_plan ?? "—"} → ${e.to_plan ?? "—"} (${d.direction === "downgrade" ? "downgrade" : "upgrade"}, ${cycleLabel(d.billing_cycle).toLowerCase()})`;
  if (e.type === "created") return `${e.to_plan ?? ""} · ${cycleLabel(d.billing_cycle).toLowerCase()}${d.trial_days ? ` · teste de ${d.trial_days} dias` : ""}`;
  if (e.type === "canceled") return d.reason ?? "";
  if (e.type === "trial_extended") return `+${d.days} dias, até ${fmtIsoDate(d.trial_ends_at)}`;
  if (e.type === "renewed") return `Vencimento em ${fmtIsoDate(d.current_period_end)}`;
  if (e.type === "discount_changed") return `${d.from}% → ${d.to}%`;
  return "";
}

/** Aba Assinatura do detalhe do tenant: contratar, trocar plano, renovar, cancelar, reativar, teste e desconto. */
export default function TenantSubscriptionTab({ tenantId, isMobile, setToast, onChanged }: Props) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState({ plan: "", cycle: "monthly", trial: "", discount: "", days: "7", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sub, catalog] = await Promise.all([fetchTenantSubscription(tenantId), fetchPlans()]);
      setSubscription(sub.subscription);
      setEvents(sub.events);
      setPlans(catalog.plans);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a assinatura."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const activePlans = plans.filter((p) => p.status === "active");
  const planOptions = [{ value: "", label: "Selecione o plano" }, ...activePlans.map((p) => ({ value: String(p.id), label: `${p.name} · ${fmtBrl(p.price_monthly)}/mês` }))];

  const open = (next: Mode) => {
    setErrors({});
    setForm({
      plan: next === "change" ? String(subscription?.plan?.id ?? "") : "",
      cycle: subscription?.billing_cycle ?? "monthly",
      trial: "",
      discount: subscription ? String(Number(subscription.discount_percent)) : "",
      days: "7",
      reason: "",
    });
    setMode(next);
  };

  const submit = async () => {
    if (!mode) return;
    const local: Record<string, string> = {};
    if ((mode === "subscribe" || mode === "change") && !form.plan) local.saas_plan_id = "Selecione o plano.";
    if (mode === "cancel" && form.reason.trim().length < 3) local.reason = "Informe o motivo do cancelamento.";
    if (mode === "trial" && !Number(form.days)) local.days = "Informe quantos dias.";
    if (Object.keys(local).length) {
      setErrors(local);
      setToast({ visible: true, type: "error", message: Object.values(local)[0] });
      return;
    }

    setSaving(true);
    try {
      const response =
        mode === "subscribe"
          ? await subscriptionAction(tenantId, "", {
              saas_plan_id: Number(form.plan),
              billing_cycle: form.cycle,
              trial_days: form.trial === "" ? undefined : Number(form.trial),
              discount_percent: form.discount === "" ? 0 : Number(form.discount.replace(",", ".")),
            })
          : mode === "change"
            ? await subscriptionAction(tenantId, "change-plan", { saas_plan_id: Number(form.plan), billing_cycle: form.cycle })
            : mode === "cancel"
              ? await subscriptionAction(tenantId, "cancel", { reason: form.reason.trim() })
              : mode === "trial"
                ? await subscriptionAction(tenantId, "extend-trial", { days: Number(form.days) })
                : mode === "discount"
                  ? await setSubscriptionDiscount(tenantId, Number(form.discount.replace(",", ".") || 0))
                  : await subscriptionAction(tenantId, mode);
      showApiToast(setToast, response.data, "Assinatura atualizada.");
      setMode(null);
      load();
      onChanged?.();
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível atualizar a assinatura.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ padding: 40, alignItems: "center" }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  if (error) {
    return (
      <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
        <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
        <Button size="sm" label="Tentar novamente" onPress={load} />
      </View>
    );
  }

  const s = subscription;
  const status = SUBSCRIPTION_STATUS[s?.status ?? "legacy"];
  const open_ = s && ["trialing", "active", "past_due"].includes(s.status);
  const selectedPlan = activePlans.find((p) => String(p.id) === form.plan);

  return (
    <View style={{ gap: 16 }}>
      {!s ? (
        <Panel title="Sem assinatura" description="Instituição legada: todas as funcionalidades liberadas e sem limites. Ao contratar, passam a valer o plano e os limites dele.">
          {activePlans.length ? (
            <Button variant="primary" label="Contratar assinatura" onPress={() => open("subscribe")} style={{ alignSelf: "flex-start" }} />
          ) : (
            <Text className="text-sm text-ink-muted">Cadastre um plano ativo em Comercial › Planos SaaS para contratar.</Text>
          )}
        </Panel>
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: 16 }}>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 340 }}>
            <Panel title={s.plan?.name ?? "Plano"} actions={<Badge label={status.label} tone={status.tone} dot />}>
              <DefinitionRows
                rows={[
                  { label: "Ciclo", value: cycleLabel(s.billing_cycle), text: true },
                  { label: "Valor contratado", value: fmtBrl(s.price) },
                  { label: "Desconto", value: Number(s.discount_percent) ? `${Number(s.discount_percent)}%` : "Sem desconto", muted: !Number(s.discount_percent) },
                  { label: "Receita mensal (MRR)", value: fmtBrl(s.monthly_revenue) },
                  { label: "Início", value: fmtIsoDate(s.started_at) },
                  { label: "Teste até", value: s.trial_ends_at ? fmtIsoDate(s.trial_ends_at) : "Sem teste", muted: !s.trial_ends_at },
                  { label: "Próximo vencimento", value: fmtIsoDate(s.current_period_end) },
                  ...(s.cancel_reason ? [{ label: "Motivo do cancelamento", value: s.cancel_reason, text: true }] : []),
                ]}
                total={{ label: "Valor por ciclo", value: fmtBrl(s.net_price) }}
              />
            </Panel>
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 280 }}>
            <Panel title="Ações" description="Ainda sem cobrança automática: o vencimento serve para acompanhamento e MRR.">
              <View style={{ gap: 8 }}>
                {open_ ? <Button label="Trocar plano (upgrade/downgrade)" onPress={() => open("change")} fullWidth /> : null}
                {open_ ? <Button label="Registrar renovação" onPress={() => open("renew")} fullWidth /> : null}
                {s.status === "trialing" || s.status === "expired" ? <Button label="Estender período de teste" onPress={() => open("trial")} fullWidth /> : null}
                <Button label="Alterar desconto" onPress={() => open("discount")} fullWidth />
                {s.status === "canceled" || s.status === "expired" ? <Button variant="primary" label="Reativar assinatura" onPress={() => open("reactivate")} fullWidth /> : null}
                {open_ ? <Button variant="danger" label="Cancelar assinatura" onPress={() => open("cancel")} fullWidth /> : null}
              </View>
            </Panel>
          </View>
        </View>
      )}

      <Panel title="Histórico da assinatura" flush>
        {events.length === 0 ? (
          <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhuma alteração registrada.</Text>
        ) : (
          events.map((e, i) => (
            <View key={e.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 4 : 16 }}>
              <Text className="text-xs font-mono text-ink-muted" style={{ width: isMobile ? undefined : 130 }}>{new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
              <View style={{ flex: 1 }}>
                <Text className="text-sm text-ink">{EVENT_LABEL[e.type] ?? e.type}</Text>
                {eventDetail(e) ? <Text className="text-xs text-ink-muted">{eventDetail(e)}</Text> : null}
              </View>
              <Text className="text-xs text-ink-muted">{e.user ?? "Sistema"}</Text>
            </View>
          ))
        )}
      </Panel>

      <Modal
        visible={!!mode}
        title={mode ? MODE_TITLE[mode] : ""}
        onClose={() => setMode(null)}
        size="md"
        compact
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Voltar" onPress={() => setMode(null)} disabled={saving} />
            <Button variant={mode === "cancel" ? "danger" : "primary"} label={mode === "cancel" ? "Cancelar assinatura" : "Confirmar"} onPress={submit} loading={saving} />
          </View>
        }
      >
        <View style={{ gap: 10 }}>
          {mode === "subscribe" || mode === "change" ? (
            <>
              <FormSelect label="Plano" required value={form.plan} options={planOptions} onChange={(v) => setForm({ ...form, plan: v })} error={errors.saas_plan_id} />
              <FormSelect label="Ciclo de cobrança" value={form.cycle} options={CYCLE_OPTIONS} onChange={(v) => setForm({ ...form, cycle: v })} />
              {selectedPlan ? (
                <Text className="text-xs text-ink-muted">
                  {`Valor do ciclo: ${fmtBrl(form.cycle === "yearly" ? (selectedPlan.price_yearly ?? Number(selectedPlan.price_monthly) * 12) : selectedPlan.price_monthly)}`}
                  {mode === "change" ? " · vale a partir de agora. Downgrade é recusado se o uso atual passar dos novos limites." : ""}
                </Text>
              ) : null}
            </>
          ) : null}
          {mode === "subscribe" ? (
            <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <FormInput label="Dias de teste" valueFormat="integer" maxDigits={3} value={form.trial} onChangeText={(v) => setForm({ ...form, trial: v })} placeholder={selectedPlan ? `Padrão do plano: ${selectedPlan.trial_days}` : "Padrão do plano"} error={errors.trial_days} />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <FormInput label="Desconto (%)" valueFormat="decimal" value={form.discount} onChangeText={(v) => setForm({ ...form, discount: v })} placeholder="0" error={errors.discount_percent} />
              </View>
            </View>
          ) : null}
          {mode === "discount" ? <FormInput label="Desconto (%)" valueFormat="decimal" value={form.discount} onChangeText={(v) => setForm({ ...form, discount: v })} error={errors.discount_percent} /> : null}
          {mode === "trial" ? <FormInput label="Dias a mais" valueFormat="integer" maxDigits={3} value={form.days} onChangeText={(v) => setForm({ ...form, days: v })} error={errors.days} /> : null}
          {mode === "cancel" ? (
            <>
              <FormInput label="Motivo" required value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} error={errors.reason} placeholder="Ex.: troca de fornecedor, preço, fechamento" multiline />
              <Text className="text-xs text-ink-muted">A instituição mantém os dados. Para bloquear o uso, suspenda a instituição.</Text>
            </>
          ) : null}
          {mode === "renew" ? <Text className="text-sm text-ink">{`Avança o vencimento em um ciclo (${cycleLabel(s?.billing_cycle ?? "monthly").toLowerCase()}) e encerra o teste, se houver.`}</Text> : null}
          {mode === "reactivate" ? <Text className="text-sm text-ink">A assinatura volta a ficar ativa, com novo vencimento a partir de hoje.</Text> : null}
        </View>
      </Modal>
    </View>
  );
}
