import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { LogIn, Pencil, RefreshCw } from "lucide-react-native";
import api from "../../services/api";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Tabs from "../../components/ui/Tabs";
import Badge from "../../components/ui/Badge";
import StatTile from "../../components/ui/StatTile";
import DefinitionRows from "../../components/ui/DefinitionRows";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import SupportAccessModal from "../../components/tenants/SupportAccessModal";
import SupportAccessHistory from "../../components/tenants/SupportAccessHistory";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { fetchTenantOverview, fmtInt, TENANT_STATUS_LABEL, tenantStatusTone, type TenantOverview } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  tenantId: number;
};

type TabId = "overview" | "users" | "integrations" | "audit";

type Tenant = {
  id: number;
  name: string;
  corporate_name: string;
  slug: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  address: { city: string | null; state: string | null };
  created_at: string | null;
};

type TenantUser = { id: number; name: string; email: string; role: string; status: string; is_tenant_owner: boolean };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordenador: "Coordenação",
  professor: "Professor",
  secretaria: "Secretaria",
  financeiro: "Financeiro",
  aluno: "Aluno",
};

const fmtDate = (iso?: string | null, withTime = false) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime
    ? date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR");
};

/** Plataforma › Instituições › detalhe: dados, uso, usuários, integrações e auditoria de um tenant. */
export default function TenantDetailScreen({ navigate, tenantId }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [tab, setTab] = useState<TabId>("overview");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [overview, setOverview] = useState<TenantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });
  const [statusTarget, setStatusTarget] = useState<"active" | "suspended" | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data }, ov] = await Promise.all([api.get(`/tenants/${tenantId}`), fetchTenantOverview(tenantId)]);
      setTenant(data.data ?? data.body ?? data);
      setOverview(ov);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a instituição."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async () => {
    if (!statusTarget) return;
    setSavingStatus(true);
    try {
      const { data } = await api.put(`/tenants/${tenantId}`, { status: statusTarget });
      showApiToast(setToast, data, statusTarget === "suspended" ? "Instituição suspensa." : "Instituição reativada.");
      setStatusTarget(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível alterar o status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const breadcrumb = [{ label: "Instituições", onPress: () => navigate("tenants") }, { label: tenant?.name ?? "Instituição" }];

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
        <PageHeader
          breadcrumb={breadcrumb}
          title={tenant?.name ?? "Instituição"}
          titleAddon={tenant ? <Badge label={TENANT_STATUS_LABEL[tenant.status] ?? tenant.status} tone={tenantStatusTone(tenant.status)} dot /> : null}
          description={tenant ? [tenant.corporate_name, tenant.cnpj ? `CNPJ ${tenant.cnpj}` : null].filter(Boolean).join(" · ") : undefined}
          actions={
            tenant ? (
              <>
                <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
                {tenant.status === "active" ? <Button icon={LogIn} label="Acesso assistido" onPress={() => setAccessOpen(true)} /> : null}
                {tenant.status === "suspended" ? (
                  <Button label="Reativar" onPress={() => setStatusTarget("active")} />
                ) : tenant.status === "active" ? (
                  <Button variant="danger" label="Suspender" onPress={() => setStatusTarget("suspended")} />
                ) : null}
                <Button variant="primary" icon={Pencil} label="Editar dados" onPress={() => navigate("tenants-form", { tenantId })} />
              </>
            ) : null
          }
        />

        {error ? (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={load} />
          </View>
        ) : null}

        {loading && !tenant ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={color.brand} />
          </View>
        ) : tenant && overview ? (
          <>
            <Tabs<TabId>
              accessibilityLabel="Seções da instituição"
              value={tab}
              onChange={setTab}
              items={[
                { id: "overview", label: "Visão geral" },
                { id: "users", label: "Usuários", count: overview.counts.users },
                {
                  id: "integrations",
                  label: "Integrações",
                  alert: overview.integrations.some((i) => i.recent_failures > 0 || i.last_sync?.status === "failed") ? "falhas recentes" : null,
                },
                { id: "audit", label: "Auditoria" },
              ]}
            />

            {tab === "overview" ? <OverviewTab tenant={tenant} overview={overview} isMobile={isMobile} /> : null}
            {tab === "users" ? <UsersTab tenantId={tenantId} isMobile={isMobile} setToast={setToast} /> : null}
            {tab === "integrations" ? <IntegrationsTab overview={overview} /> : null}
            {tab === "audit" ? <SupportAccessHistory tenantId={tenantId} /> : null}
          </>
        ) : null}
      </ScrollView>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />

      <SupportAccessModal tenant={accessOpen && tenant ? { id: tenant.id, name: tenant.name } : null} onClose={() => setAccessOpen(false)} />

      <ConfirmModal
        visible={statusTarget !== null}
        title={statusTarget === "suspended" ? "Suspender instituição" : "Reativar instituição"}
        message={
          statusTarget === "suspended"
            ? `${tenant?.name} ficará com status Suspenso e não poderá receber acesso assistido. Os dados são preservados.`
            : `${tenant?.name} volta ao status Ativo.`
        }
        confirmLabel={statusTarget === "suspended" ? "Suspender" : "Reativar"}
        tone={statusTarget === "suspended" ? "danger" : "primary"}
        onCancel={() => setStatusTarget(null)}
        onConfirm={changeStatus}
        loading={savingStatus}
      />
    </>
  );
}

function OverviewTab({ tenant, overview, isMobile }: { tenant: Tenant; overview: TenantOverview; isMobile: boolean }) {
  const { counts, usage_30d: usage } = overview;
  const place = [tenant.address?.city, tenant.address?.state].filter(Boolean).join(" / ");

  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {[
          <StatTile key="s" label="Alunos" value={fmtInt(counts.students)} hint={`${fmtInt(usage.active_students)} ativos em 30 dias`} />,
          <StatTile key="u" label="Usuários" value={fmtInt(counts.users)} hint={`${fmtInt(counts.users_active)} com acesso ativo`} />,
          <StatTile key="c" label="Turmas e cursos" value={`${fmtInt(counts.classes)} · ${fmtInt(counts.courses)}`} />,
          <StatTile key="q" label="Questões em 30 dias" value={fmtInt(usage.practice_answers)} hint={`${fmtInt(usage.exam_attempts)} simulados concluídos`} />,
        ].map((tile, i) => (
          <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
            {tile}
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 320 }}>
          <Panel title="Dados da instituição">
            <DefinitionRows
              rows={[
                { label: "Nome fantasia", value: tenant.name, text: true },
                { label: "Razão social", value: tenant.corporate_name || "—", text: true, muted: !tenant.corporate_name },
                { label: "CNPJ", value: tenant.cnpj || "Não informado", muted: !tenant.cnpj },
                { label: "Identificador (slug)", value: tenant.slug },
                { label: "E-mail", value: tenant.email || "Não informado", text: true, muted: !tenant.email },
                { label: "Telefone", value: tenant.phone || tenant.whatsapp || "Não informado", muted: !(tenant.phone || tenant.whatsapp) },
                { label: "Cidade", value: place || "Não informada", text: true, muted: !place },
              ]}
            />
          </Panel>
        </View>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 320 }}>
          <Panel title="Conta">
            <DefinitionRows
              rows={[
                { label: "Administrador principal", value: overview.owner?.name ?? "Sem administrador", text: true, muted: !overview.owner },
                { label: "E-mail do administrador", value: overview.owner?.email ?? "—", text: true, muted: !overview.owner },
                { label: "Criado em", value: fmtDate(tenant.created_at) },
                { label: "Última atividade", value: overview.last_activity_at ? fmtDate(overview.last_activity_at, true) : "Sem registro", muted: !overview.last_activity_at },
                { label: "Plano e assinatura", value: "Disponível com as assinaturas SaaS", text: true, muted: true },
              ]}
            />
          </Panel>
        </View>
      </View>
    </View>
  );
}

function UsersTab({ tenantId, isMobile, setToast }: { tenantId: number; isMobile: boolean; setToast: React.Dispatch<React.SetStateAction<ApiToastState>> }) {
  const [rows, setRows] = useState<TenantUser[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<TenantUser | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/users", { params: { tenant_id: tenantId, page } });
      setRows(Array.isArray(data.data) ? data.data : []);
      if (data.meta) setMeta({ current_page: data.meta.current_page, last_page: data.meta.last_page, per_page: data.meta.per_page, total: data.meta.total });
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os usuários."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/users/${target.id}`, { status: target.status === "active" ? "inactive" : "active" });
      showApiToast(setToast, data, "Acesso do usuário atualizado.");
      setTarget(null);
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível alterar o acesso.");
    } finally {
      setSaving(false);
    }
  };

  const blocking = target?.status === "active";

  return (
    <View>
      <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
        <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 640 : undefined }}>
          <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2.4, minWidth: 200 }}>Usuário</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 110 }}>Perfil</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 90 }}>Acesso</Text>
            <View style={{ width: 120 }} />
          </View>
          {loading ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ActivityIndicator color={color.brand} />
            </View>
          ) : error ? (
            <Text className="text-sm text-danger" style={{ padding: 16 }}>{error}</Text>
          ) : rows.length === 0 ? (
            <Text className="text-sm text-ink-muted" style={{ padding: 24, textAlign: "center" }}>Nenhum usuário vinculado.</Text>
          ) : (
            rows.map((u, i) => (
              <DataTableRow key={u.id} index={i}>
                <View style={{ flex: 2.4, minWidth: 200 }}>
                  <Text className="text-sm font-medium text-ink" numberOfLines={1}>{u.name}</Text>
                  <Text className="text-xs text-ink-subtle" numberOfLines={1}>{u.email}</Text>
                </View>
                <View style={{ flex: 1.2, minWidth: 110, gap: 4 }}>
                  <Text className="text-sm text-ink">{ROLE_LABEL[u.role] ?? u.role}</Text>
                  {u.is_tenant_owner ? <Badge label="Principal" tone="brand" /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 90 }}>
                  <Badge label={u.status === "active" ? "Ativo" : "Bloqueado"} tone={u.status === "active" ? "success" : "neutral"} />
                </View>
                <View style={{ width: 120, alignItems: "flex-end" }}>
                  {u.is_tenant_owner ? null : (
                    <Button size="sm" label={u.status === "active" ? "Bloquear" : "Desbloquear"} onPress={() => setTarget(u)} />
                  )}
                </View>
              </DataTableRow>
            ))
          )}
        </View>
      </ScrollView>
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />

      <ConfirmModal
        visible={target !== null}
        title={blocking ? "Bloquear acesso" : "Desbloquear acesso"}
        message={blocking ? `${target?.name} não conseguirá mais entrar no sistema.` : `${target?.name} volta a poder entrar no sistema.`}
        confirmLabel={blocking ? "Bloquear" : "Desbloquear"}
        tone={blocking ? "danger" : "primary"}
        onCancel={() => setTarget(null)}
        onConfirm={toggle}
        loading={saving}
      />
    </View>
  );
}

function IntegrationsTab({ overview }: { overview: TenantOverview }) {
  return (
    <Panel title="Integrações" description="Situação de cada integração. Chaves e certificados nunca são exibidos; só o final da chave, quando houver." flush>
      {overview.integrations.map((item, index) => {
        const failed = item.recent_failures > 0 || item.last_sync?.status === "failed";
        const badge = !item.configured
          ? { label: "Não configurada", tone: "neutral" as const }
          : failed
            ? { label: "Com falhas", tone: "danger" as const }
            : item.active
              ? { label: "Ativa", tone: "success" as const }
              : { label: "Inativa", tone: "neutral" as const };
        const details = [
          item.environment ? `Ambiente/modelo: ${item.environment}` : null,
          item.hint ? `Chave ${item.hint}` : null,
          item.configured_at ? `Configurada em ${fmtDate(item.configured_at)}` : null,
          item.last_sync ? `Última sincronização: ${fmtDate(item.last_sync.at, true)} (${item.last_sync.status === "success" ? "ok" : item.last_sync.status === "failed" ? "falhou" : "em andamento"})` : null,
          item.recent_failures ? `${item.recent_failures} webhook(s) com falha em 7 dias` : null,
        ].filter(Boolean);

        return (
          <View key={item.key} className={index > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 14, flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text className="text-sm font-medium text-ink">{item.name}</Text>
              <Text className="text-xs text-ink-muted">{details.length ? details.join(" · ") : "Sem configuração para esta instituição."}</Text>
            </View>
            <Badge label={badge.label} tone={badge.tone} dot />
          </View>
        );
      })}
    </Panel>
  );
}
