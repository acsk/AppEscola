import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { KeyRound, MonitorSmartphone, Plus } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import DataTableRow from "../../components/ui/DataTableRow";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import {
  createGlobalAdmin,
  fetchAdminSessions,
  fetchGlobalAdmins,
  fmtDateTime,
  resetGlobalAdminPassword,
  revokeAdminSessions,
  setGlobalAdminStatus,
  type AdminSession,
  type GlobalAdmin,
} from "../../services/saas";

type FormState = { name: string; email: string; password: string; password_confirmation: string };

const emptyForm: FormState = { name: "", email: "", password: "", password_confirmation: "" };

/**
 * Plataforma › Administração › Administradores globais: quem administra a plataforma, sessões abertas,
 * senha provisória e bloqueio. A API impede bloquear a si mesmo e ficar sem administrador ativo.
 */
export default function GlobalAdminsScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const { user } = useAuth();
  const [items, setItems] = useState<GlobalAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });
  const [formMode, setFormMode] = useState<null | "create" | GlobalAdmin>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<GlobalAdmin | null>(null);
  const [sessionsOf, setSessionsOf] = useState<GlobalAdmin | null>(null);
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchGlobalAdmins());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os administradores."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openSessions = async (admin: GlobalAdmin) => {
    setSessionsOf(admin);
    setSessions(null);
    try {
      setSessions(await fetchAdminSessions(admin.id));
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível carregar as sessões.");
      setSessionsOf(null);
    }
  };

  const revoke = async (sessionId?: number) => {
    if (!sessionsOf) return;
    try {
      const { data } = await revokeAdminSessions(sessionsOf.id, sessionId);
      showApiToast(setToast, data, "Sessões encerradas.");
      setSessions(await fetchAdminSessions(sessionsOf.id));
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível encerrar as sessões.");
    }
  };

  const submit = async () => {
    const creating = formMode === "create";
    const local: Record<string, string> = {};
    if (creating && !form.name.trim()) local.name = "Informe o nome.";
    if (creating && !form.email.trim()) local.email = "Informe o e-mail.";
    if (form.password.length < 8) local.password = "A senha provisória precisa de ao menos 8 caracteres.";
    else if (form.password !== form.password_confirmation) local.password_confirmation = "As senhas não conferem.";
    if (Object.keys(local).length) {
      setErrors(local);
      setToast({ visible: true, type: "error", message: Object.values(local)[0] });
      return;
    }
    setSaving(true);
    try {
      const { data } = creating
        ? await createGlobalAdmin({ ...form, name: form.name.trim(), email: form.email.trim() })
        : await resetGlobalAdminPassword((formMode as GlobalAdmin).id, form.password, form.password_confirmation);
      showApiToast(setToast, data, "Operação realizada com sucesso.");
      setFormMode(null);
      load();
    } catch (err) {
      setErrors(getApiValidationErrors(err));
      showApiErrorToast(setToast, err, "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    try {
      const { data } = await setGlobalAdminStatus(statusTarget.id, statusTarget.status === "active" ? "inactive" : "active");
      showApiToast(setToast, data, "Status atualizado.");
      setStatusTarget(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível alterar o status.");
      setStatusTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const blocking = statusTarget?.status === "active";

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
        <PageHeader
          breadcrumb={[{ label: "Administração" }, { label: "Administradores globais" }]}
          title="Administradores globais"
          description="Quem administra a plataforma inteira. Bloquear encerra as sessões na hora; usuários das instituições ficam no detalhe de cada instituição."
          actions={<Button variant="primary" icon={Plus} label="Novo administrador" onPress={() => { setErrors({}); setForm(emptyForm); setFormMode("create"); }} />}
        />

        {error ? (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={load} />
          </View>
        ) : null}

        <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
          <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 760 : undefined }}>
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 2.4, minWidth: 220 }}>Administrador</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.1, minWidth: 110 }}>Acesso</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4, minWidth: 150 }}>Último uso</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8, minWidth: 80, textAlign: "right" }}>Sessões</Text>
              <View style={{ width: 230 }} />
            </View>
            {loading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color={color.brand} />
              </View>
            ) : (
              items.map((a, i) => {
                const isMe = a.id === user?.id;
                return (
                  <DataTableRow key={a.id} index={i}>
                    <View style={{ flex: 2.4, minWidth: 220 }}>
                      <Text className="text-sm font-medium text-ink" numberOfLines={1}>{isMe ? `${a.name} (você)` : a.name}</Text>
                      <Text className="text-xs text-ink-subtle" numberOfLines={1}>{a.email}</Text>
                    </View>
                    <View style={{ flex: 1.1, minWidth: 110, gap: 4 }}>
                      <Badge label={a.status === "active" ? "Ativo" : "Bloqueado"} tone={a.status === "active" ? "success" : "neutral"} />
                      {a.password_change_required ? <Text className="text-xs text-ink-subtle">Senha provisória</Text> : null}
                    </View>
                    <Text className="text-sm font-mono text-ink-muted" style={{ flex: 1.4, minWidth: 150 }}>{fmtDateTime(a.last_used_at)}</Text>
                    <Text className="text-sm font-mono text-ink" style={{ flex: 0.8, minWidth: 80, textAlign: "right" }}>{a.sessions}</Text>
                    <View className="flex-row justify-end" style={{ width: 230, gap: 4 }}>
                      <Button size="sm" variant="ghost" icon={MonitorSmartphone} iconOnly accessibilityLabel={`Sessões de ${a.name}`} onPress={() => openSessions(a)} />
                      {!isMe ? <Button size="sm" variant="ghost" icon={KeyRound} iconOnly accessibilityLabel={`Senha provisória para ${a.name}`} onPress={() => { setErrors({}); setForm(emptyForm); setFormMode(a); }} /> : null}
                      {!isMe ? <Button size="sm" label={a.status === "active" ? "Bloquear" : "Desbloquear"} onPress={() => setStatusTarget(a)} /> : null}
                    </View>
                  </DataTableRow>
                );
              })
            )}
          </View>
        </ScrollView>

        <Text className="text-xs text-ink-subtle">
          Novos administradores entram com senha provisória e precisam trocá-la no primeiro acesso. A autenticação em dois fatores (MFA) ainda não está disponível.
        </Text>
      </ScrollView>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />

      <Modal
        visible={formMode !== null}
        title={formMode === "create" ? "Novo administrador global" : `Senha provisória · ${(formMode as GlobalAdmin | null)?.name ?? ""}`}
        onClose={() => setFormMode(null)}
        size="md"
        compact
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Cancelar" onPress={() => setFormMode(null)} disabled={saving} />
            <Button variant="primary" label={formMode === "create" ? "Criar administrador" : "Definir senha"} onPress={submit} loading={saving} />
          </View>
        }
      >
        <View style={{ gap: 10 }}>
          {formMode === "create" ? (
            <>
              <FormInput label="Nome" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={errors.name} />
              <FormInput label="E-mail" required value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} error={errors.email} autoCapitalize="none" keyboardType="email-address" />
            </>
          ) : (
            <Text className="text-sm text-ink-muted">As sessões abertas desse administrador serão encerradas e ele precisará trocar a senha no próximo acesso.</Text>
          )}
          <FormInput label="Senha provisória" required secureTextEntry value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} error={errors.password} />
          <FormInput label="Confirmar senha" required secureTextEntry value={form.password_confirmation} onChangeText={(v) => setForm({ ...form, password_confirmation: v })} error={errors.password_confirmation} />
        </View>
      </Modal>

      <Modal
        visible={!!sessionsOf}
        title={`Sessões · ${sessionsOf?.name ?? ""}`}
        onClose={() => setSessionsOf(null)}
        size="md"
        compact
        footer={
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="secondary" label="Fechar" onPress={() => setSessionsOf(null)} />
            {sessions?.length ? <Button variant="danger" label="Encerrar todas" onPress={() => revoke()} /> : null}
          </View>
        }
      >
        {sessions === null ? (
          <ActivityIndicator color={color.brand} />
        ) : sessions.length === 0 ? (
          <Text className="text-sm text-ink-muted">Nenhuma sessão aberta.</Text>
        ) : (
          <View>
            {sessions.map((s, i) => (
              <View key={s.id} className={`flex-row items-center ${i > 0 ? "border-t border-border" : ""}`} style={{ paddingVertical: 10, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text className="text-sm text-ink">{s.kind}</Text>
                  <Text className="text-xs font-mono text-ink-muted">{`Início ${fmtDateTime(s.created_at)} · último uso ${fmtDateTime(s.last_used_at)}`}</Text>
                </View>
                <Button size="sm" label="Encerrar" onPress={() => revoke(s.id)} />
              </View>
            ))}
            {sessionsOf?.id === user?.id ? <Text className="text-xs text-ink-subtle" style={{ marginTop: 8 }}>A sessão que você está usando agora não é encerrada.</Text> : null}
          </View>
        )}
      </Modal>

      <ConfirmModal
        visible={!!statusTarget}
        title={blocking ? "Bloquear administrador" : "Desbloquear administrador"}
        message={blocking ? `${statusTarget?.name} perde o acesso agora e todas as sessões dele são encerradas.` : `${statusTarget?.name} volta a poder entrar na plataforma.`}
        confirmLabel={blocking ? "Bloquear" : "Desbloquear"}
        tone={blocking ? "danger" : "primary"}
        onCancel={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        loading={saving}
      />
    </>
  );
}
