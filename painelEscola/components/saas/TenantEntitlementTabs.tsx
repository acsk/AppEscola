import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import FormInput from "../ui/FormInput";
import SupportAccessHistory from "../tenants/SupportAccessHistory";
import { color } from "../../constants/theme";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import {
  clearTenantFeature,
  clearTenantQuota,
  fetchTenantAudit,
  fetchTenantFeatures,
  fetchTenantQuotas,
  fmtInt,
  setTenantFeature,
  setTenantQuota,
  type AuditItem,
  type QuotaRow,
  type TenantFeatureRow,
} from "../../services/saas";

type TabProps = {
  tenantId: number;
  isMobile: boolean;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

const SOURCE_LABEL: Record<TenantFeatureRow["source"], string> = {
  plan: "pelo plano",
  legacy: "sem assinatura (legado)",
  override: "exceção desta instituição",
  beta: "em beta, sem liberação",
  global_disabled: "desabilitada para toda a plataforma",
};

const LEVEL: Record<QuotaRow["level"], { label: string; tone: "success" | "warning" | "danger"; bar: string }> = {
  ok: { label: "Normal", tone: "success", bar: color.brand },
  warning: { label: "Acima de 80%", tone: "warning", bar: color.warning },
  critical: { label: "Acima de 95%", tone: "danger", bar: color.danger },
  reached: { label: "Limite atingido", tone: "danger", bar: color.danger },
};

function useLoader<T>(fetcher: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetcher());
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  }, [fetcher]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, load };
}

function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) {
    return (
      <View style={{ padding: 40, alignItems: "center" }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  return (
    <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
      <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
      <Button size="sm" label="Tentar novamente" onPress={onRetry} />
    </View>
  );
}

/** Funcionalidades efetivas da instituição, com exceções (liberar/bloquear) por cima do plano. */
export function TenantFeaturesTab({ tenantId, isMobile, setToast }: TabProps) {
  const fetcher = useCallback(() => fetchTenantFeatures(tenantId), [tenantId]);
  const { data, error, loading, load } = useLoader(fetcher, "Não foi possível carregar as funcionalidades.");
  const [pending, setPending] = useState<{ feature: TenantFeatureRow; enabled: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const save = async () => {
    if (!pending) return;
    setSaving(pending.feature.key);
    try {
      const { data: res } = await setTenantFeature(tenantId, pending.feature.key, pending.enabled, reason.trim());
      showApiToast(setToast, res, "Exceção salva.");
      setPending(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível salvar a exceção.");
    } finally {
      setSaving(null);
    }
  };

  const clear = async (feature: TenantFeatureRow) => {
    setSaving(feature.key);
    try {
      const { data: res } = await clearTenantFeature(tenantId, feature.key);
      showApiToast(setToast, res, "Voltou a seguir o plano.");
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível remover a exceção.");
    } finally {
      setSaving(null);
    }
  };

  if (!data) return <LoadState loading={loading} error={error} onRetry={load} />;

  return (
    <>
      <Panel
        title="Funcionalidades"
        description={data.legacy ? "Sem assinatura: tudo liberado, exceto o que estiver desabilitado ou em beta na plataforma." : `Plano ${data.plan?.name ?? ""}. Exceções valem só para esta instituição.`}
        flush
      >
        {data.features.map((f, i) => (
          <View key={f.key} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
                <Text className="text-sm font-medium text-ink">{f.name}</Text>
                <Badge label={f.enabled ? "Liberada" : "Bloqueada"} tone={f.enabled ? "success" : "neutral"} dot />
              </View>
              <Text className="text-xs text-ink-muted">
                {SOURCE_LABEL[f.source]}
                {f.override?.reason ? ` · ${f.override.reason}` : ""}
              </Text>
            </View>
            {f.source === "global_disabled" ? null : (
              <View className="flex-row" style={{ gap: 8 }}>
                {f.override ? <Button size="sm" variant="ghost" label="Seguir o plano" onPress={() => clear(f)} loading={saving === f.key} /> : null}
                <Button size="sm" label={f.enabled ? "Bloquear" : "Liberar"} onPress={() => { setReason(""); setPending({ feature: f, enabled: !f.enabled }); }} disabled={saving === f.key} />
              </View>
            )}
          </View>
        ))}
      </Panel>

      <Modal
        visible={!!pending}
        title={pending ? `${pending.enabled ? "Liberar" : "Bloquear"} ${pending.feature.name}` : ""}
        onClose={() => setPending(null)}
        size="sm"
        compact
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Cancelar" onPress={() => setPending(null)} />
            <Button variant={pending?.enabled ? "primary" : "danger"} label={pending?.enabled ? "Liberar" : "Bloquear"} onPress={save} loading={!!saving} />
          </View>
        }
      >
        <FormInput label="Motivo (opcional)" value={reason} onChangeText={setReason} placeholder="Ex.: piloto do BI, cortesia comercial" />
        <Text className="text-xs text-ink-muted">A exceção vale só para esta instituição e fica registrada na auditoria.</Text>
      </Modal>
    </>
  );
}

/** Consumo × limite por recurso, com ajuste de limite pela instituição. */
export function TenantQuotasTab({ tenantId, isMobile, setToast }: TabProps) {
  const fetcher = useCallback(() => fetchTenantQuotas(tenantId), [tenantId]);
  const { data, error, loading, load } = useLoader(fetcher, "Não foi possível carregar o consumo.");
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [limit, setLimit] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { data: res } = await setTenantQuota(tenantId, editing.resource, limit === "" ? null : Number(limit), reason.trim());
      showApiToast(setToast, res, "Limite atualizado.");
      setEditing(null);
      load();
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível salvar o limite.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async (row: QuotaRow) => {
    try {
      const { data: res } = await clearTenantQuota(tenantId, row.resource);
      showApiToast(setToast, res, "Voltou ao limite do plano.");
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível remover o ajuste.");
    }
  };

  if (!data) return <LoadState loading={loading} error={error} onRetry={load} />;

  return (
    <>
      <Panel
        title="Consumo e limites"
        description={data.legacy ? "Sem assinatura: sem limites, salvo ajustes feitos aqui." : "Alerta em 80% e 95%. No limite, só o cadastro de novos itens é bloqueado; os dados existentes continuam acessíveis."}
        flush
      >
        {data.items.map((row, i) => {
          const level = LEVEL[row.level];
          const pct = row.percent == null ? 0 : Math.min(100, row.percent);
          return (
            <View key={row.resource} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <View className="flex-row items-center justify-between flex-wrap" style={{ gap: 8 }}>
                  <Text className="text-sm font-medium text-ink">{row.label}</Text>
                  <Text className="text-sm font-mono text-ink">
                    {row.limit == null ? `${fmtInt(row.usage)} · ilimitado` : `${fmtInt(row.usage)} de ${fmtInt(row.limit)}${row.percent != null ? ` · ${row.percent.toLocaleString("pt-BR")}%` : ""}`}
                  </Text>
                </View>
                {row.limit != null ? (
                  <View className="bg-surface-sunken" style={{ height: 6 }} aria-label={`${row.label}: ${row.usage} de ${row.limit}`}>
                    <View style={{ height: 6, width: `${pct}%`, backgroundColor: level.bar }} />
                  </View>
                ) : null}
                <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
                  {row.limit != null ? <Badge label={level.label} tone={level.tone} /> : null}
                  {row.override ? <Text className="text-xs text-ink-muted">{`Ajustado para esta instituição${row.override.reason ? `: ${row.override.reason}` : ""}`}</Text> : null}
                </View>
              </View>
              <View className="flex-row" style={{ gap: 8 }}>
                {row.override ? <Button size="sm" variant="ghost" label="Voltar ao plano" onPress={() => reset(row)} /> : null}
                <Button size="sm" label="Ajustar limite" onPress={() => { setErrors({}); setLimit(row.limit == null ? "" : String(row.limit)); setReason(""); setEditing(row); }} />
              </View>
            </View>
          );
        })}
      </Panel>

      <Modal
        visible={!!editing}
        title={editing ? `Limite de ${editing.label.toLowerCase()}` : ""}
        onClose={() => setEditing(null)}
        size="sm"
        compact
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Cancelar" onPress={() => setEditing(null)} />
            <Button variant="primary" label="Salvar limite" onPress={save} loading={saving} />
          </View>
        }
      >
        <View style={{ gap: 10 }}>
          <FormInput label="Novo limite" valueFormat="integer" maxDigits={8} value={limit} onChangeText={setLimit} placeholder="Vazio = ilimitado" error={errors.limit} />
          <FormInput label="Motivo (opcional)" value={reason} onChangeText={setReason} placeholder="Ex.: aumento negociado" />
          {editing ? <Text className="text-xs text-ink-muted">{`Uso atual: ${fmtInt(editing.usage)} ${editing.unit}.`}</Text> : null}
        </View>
      </Modal>
    </>
  );
}

/** Alterações administrativas (plano, limites, flags, status) + acessos assistidos. */
export function TenantAuditTab({ tenantId, isMobile }: Omit<TabProps, "setToast">) {
  const fetcher = useCallback(() => fetchTenantAudit(tenantId), [tenantId]);
  const { data, error, loading, load } = useLoader<AuditItem[]>(fetcher, "Não foi possível carregar a auditoria.");

  return (
    <View style={{ gap: 16 }}>
      {!data ? (
        <LoadState loading={loading} error={error} onRetry={load} />
      ) : (
        <Panel title="Alterações administrativas" description="Plano, assinatura, limites, funcionalidades e status, com autor, data e IP." flush>
          {data.length === 0 ? (
            <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhuma alteração registrada.</Text>
          ) : (
            data.map((item, i) => (
              <View key={item.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 4 : 16 }}>
                <Text className="text-xs font-mono text-ink-muted" style={{ width: isMobile ? undefined : 130 }}>
                  {new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text className="text-sm text-ink" style={{ flex: 1 }}>{item.description}</Text>
                <Text className="text-xs text-ink-muted">{[item.user ?? "Sistema", item.ip].filter(Boolean).join(" · ")}</Text>
              </View>
            ))
          )}
        </Panel>
      )}
      <SupportAccessHistory tenantId={tenantId} />
    </View>
  );
}
