import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Send, ShieldCheck, Trash2 } from "lucide-react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import FormInput from "../ui/FormInput";
import FormSelect from "../ui/FormSelect";
import ConfirmModal from "../ui/ConfirmModal";
import Pagination from "../ui/Pagination";
import SegmentedControl from "../banco-questoes/SegmentedControl";
import {
  deleteEmailSettings,
  DOMAIN_STATUS,
  fetchEmailLogs,
  fetchEmailSettings,
  saveEmailSettings,
  sendTestEmail,
  verifyEmailSettings,
  type EmailLogItem,
  type EmailSettings,
} from "../../services/emailSettings";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { color } from "../../constants/theme";

type Props = {
  /** null = escola do usuário logado (admin); número = escolhida pelo super admin. */
  tenantId?: number | null;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

type Draft = { provider: string; api_key: string; from_email: string; from_name: string; reply_to: string; active: boolean };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * E-mail de envio da escola (Resend): chave, remetente, verificação do domínio, e-mail de teste e histórico.
 * A chave fica criptografada na API e nunca volta para o painel.
 */
export default function EmailSettingsEditor({ tenantId = null, setToast }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<null | "save" | "verify" | "test" | "delete">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [logMeta, setLogMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [logPage, setLogPage] = useState(1);

  const apply = (s: EmailSettings) => {
    setSettings(s);
    setDraft({ provider: s.provider, api_key: "", from_email: s.from_email ?? "", from_name: s.from_name ?? "", reply_to: s.reply_to ?? "", active: s.configured ? s.active : true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      apply(await fetchEmailSettings(tenantId));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Não foi possível carregar a configuração de e-mail."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await fetchEmailLogs(logPage, tenantId);
      setLogs(data.items);
      setLogMeta(data.meta);
    } catch {
      setLogs([]);
    }
  }, [logPage, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const save = async () => {
    if (!draft || !settings) return;
    const local: Record<string, string> = {};
    if (!settings.configured && !draft.api_key.trim()) local.api_key = "Informe a chave de API do Resend.";
    if (!draft.from_email.trim()) local.from_email = "Informe o e-mail do remetente.";
    if (Object.keys(local).length) {
      setErrors(local);
      setToast({ visible: true, type: "error", message: Object.values(local)[0] });
      return;
    }
    setBusy("save");
    try {
      const { data } = await saveEmailSettings(
        {
          provider: draft.provider,
          ...(draft.api_key.trim() ? { api_key: draft.api_key.trim() } : {}),
          from_email: draft.from_email.trim(),
          from_name: draft.from_name.trim() || null,
          reply_to: draft.reply_to.trim() || null,
          active: draft.active,
        },
        tenantId
      );
      apply(data.body);
      setErrors({});
      showApiToast(setToast, data, "Configuração de e-mail salva.");
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível salvar a configuração de e-mail.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy("verify");
    try {
      const { data } = await verifyEmailSettings(tenantId);
      showApiToast(setToast, data, "Domínio verificado.");
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível verificar o domínio.");
    } finally {
      setBusy(null);
      void load();
    }
  };

  const test = async () => {
    if (!testTo.trim()) {
      setErrors({ to: "Informe para qual e-mail enviar o teste." });
      setToast({ visible: true, type: "error", message: "Informe para qual e-mail enviar o teste." });
      return;
    }
    setBusy("test");
    try {
      const { data } = await sendTestEmail(testTo.trim(), tenantId);
      showApiToast(setToast, data, "E-mail de teste enviado.");
      setErrors({});
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível enviar o e-mail de teste.");
    } finally {
      setBusy(null);
      setLogPage(1);
      void loadLogs();
      void load();
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      const { data } = await deleteEmailSettings(tenantId);
      showApiToast(setToast, data, "Configuração de e-mail removida.");
      setConfirmDelete(false);
      void load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível remover a configuração.");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !settings) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  if (!settings || !draft) {
    return (
      <View className="py-12 items-center" style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted text-center">{loadError || "Não foi possível carregar a configuração de e-mail."}</Text>
        <Button label="Tentar novamente" onPress={() => void load()} />
      </View>
    );
  }

  const domain = settings.domain_status ? DOMAIN_STATUS[settings.domain_status] : null;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
        <Panel
          title="Provedor de envio"
          description="Crie a chave em resend.com → API Keys e cadastre o domínio do remetente em Domains (registros DNS)."
          actions={
            !settings.configured ? (
              <Badge label="Não configurado" tone="neutral" />
            ) : settings.active ? (
              <Badge label="Ativo" tone="success" />
            ) : (
              <Badge label="Inativo" tone="warning" />
            )
          }
          style={{ flex: 1.3, width: isMobile ? "100%" : undefined, minWidth: 0 }}
          footer={
            <>
              {settings.configured ? <Button variant="danger" icon={Trash2} label="Remover" onPress={() => setConfirmDelete(true)} disabled={busy !== null} /> : null}
              {settings.configured ? <Button icon={ShieldCheck} label="Verificar domínio" onPress={() => void verify()} loading={busy === "verify"} disabled={busy !== null && busy !== "verify"} /> : null}
              <Button variant="primary" label="Salvar" onPress={() => void save()} loading={busy === "save"} disabled={busy !== null && busy !== "save"} />
            </>
          }
        >
          {settings.configured ? (
            <View className="flex-row flex-wrap" style={{ gap: 16, marginBottom: 16 }}>
              <View>
                <Text className="text-xs text-ink-subtle">Chave atual</Text>
                <Text className="text-sm font-mono text-ink">••••{settings.key_hint}</Text>
              </View>
              <View>
                <Text className="text-xs text-ink-subtle">Atualizada em</Text>
                <Text className="text-sm font-mono text-ink">{fmt(settings.configured_at)}</Text>
              </View>
              {domain ? (
                <View style={{ gap: 2 }}>
                  <Text className="text-xs text-ink-subtle">Domínio</Text>
                  <Badge label={domain.label} tone={domain.tone} dot />
                </View>
              ) : null}
            </View>
          ) : null}
          {settings.last_error ? (
            <View className="rounded-ds-md border border-warning bg-warning-tint px-3 py-2" style={{ marginBottom: 12 }}>
              <Text className="text-xs text-warning">{settings.last_error}</Text>
            </View>
          ) : null}
          {settings.providers.length > 1 ? (
            <FormSelect label="Provedor" value={draft.provider} options={settings.providers.map((p) => ({ value: p.key, label: p.label }))} onChange={(v) => setDraft({ ...draft, provider: v })} />
          ) : null}
          <FormInput
            label={settings.configured ? "Nova chave de API" : "Chave de API do Resend"}
            required={!settings.configured}
            value={draft.api_key}
            onChangeText={(v) => setDraft({ ...draft, api_key: v })}
            error={errors.api_key}
            secureTextEntry
            autoComplete="off"
            autoCorrect={false}
            placeholder={settings.configured ? "Deixe em branco para manter a atual" : "re_…"}
          />
          <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <FormInput label="Nome do remetente" value={draft.from_name} onChangeText={(v) => setDraft({ ...draft, from_name: v })} error={errors.from_name} placeholder="Ex.: Cursinho Exemplo" />
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <FormInput
                label="E-mail do remetente"
                required
                value={draft.from_email}
                onChangeText={(v) => setDraft({ ...draft, from_email: v })}
                error={errors.from_email}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="contato@seudominio.com.br"
              />
            </View>
          </View>
          <FormInput
            label="Responder para (opcional)"
            value={draft.reply_to}
            onChangeText={(v) => setDraft({ ...draft, reply_to: v })}
            error={errors.reply_to}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="secretaria@seudominio.com.br"
          />
          <SegmentedControl<"on" | "off">
            label="Situação"
            allowClear={false}
            options={[
              { value: "on", label: "Ativo" },
              { value: "off", label: "Inativo" },
            ]}
            value={draft.active ? "on" : "off"}
            onChange={(v) => setDraft({ ...draft, active: v === "on" })}
          />
        </Panel>

        <Panel title="Enviar teste" description="Confirma chave, remetente e domínio com um envio real." style={{ flex: 1, width: isMobile ? "100%" : undefined, minWidth: 0 }}>
          <View style={{ gap: 12 }}>
            <FormInput label="Enviar para" value={testTo} onChangeText={setTestTo} error={errors.to} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" />
            <Button icon={Send} label="Enviar e-mail de teste" onPress={() => void test()} loading={busy === "test"} disabled={!settings.configured || (busy !== null && busy !== "test")} />
            <View className="flex-row" style={{ gap: 16 }}>
              <View>
                <Text className="text-xs text-ink-subtle">Enviados no mês</Text>
                <Text className="text-lg font-semibold text-ink">{settings.month.sent.toLocaleString("pt-BR")}</Text>
              </View>
              <View>
                <Text className="text-xs text-ink-subtle">Falhas no mês</Text>
                <Text className={`text-lg font-semibold ${settings.month.failed ? "text-danger" : "text-ink"}`}>{settings.month.failed.toLocaleString("pt-BR")}</Text>
              </View>
            </View>
          </View>
        </Panel>
      </View>

      <Panel title="Histórico de envios" description="Cada e-mail enviado por esta escola, com o resultado do provedor." flush>
        {logs.length === 0 ? (
          <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhum e-mail enviado ainda.</Text>
        ) : (
          logs.map((log, i) => (
            <View key={log.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 10, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 4 : 16 }}>
              <Text className="text-xs font-mono text-ink-muted" style={{ width: isMobile ? undefined : 130 }}>{fmt(log.created_at)}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text className="text-sm text-ink" numberOfLines={1}>{log.subject}</Text>
                <Text className="text-xs text-ink-muted" numberOfLines={1}>{`Para ${log.to} · ${log.category}${log.user ? ` · por ${log.user}` : ""}`}</Text>
                {log.error ? <Text className="text-xs text-danger" numberOfLines={2}>{log.error}</Text> : null}
              </View>
              <View style={{ alignItems: isMobile ? "flex-start" : "flex-end" }}>
                <Badge label={log.status === "sent" ? "Enviado" : "Falhou"} tone={log.status === "sent" ? "success" : "danger"} dot />
              </View>
            </View>
          ))
        )}
      </Panel>
      {logMeta.total > logMeta.per_page ? <Pagination currentPage={logMeta.current_page} lastPage={logMeta.last_page} total={logMeta.total} perPage={logMeta.per_page} onPageChange={setLogPage} /> : null}

      <ConfirmModal
        visible={confirmDelete}
        title="Remover configuração de e-mail"
        message="A escola deixa de enviar e-mails até uma nova configuração. O histórico de envios é mantido."
        confirmLabel="Remover"
        loading={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

