import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw, RotateCcw, Search } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import FormInput from "../../components/ui/FormInput";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fmtMoney } from "../../components/financeiro/format";
import {
  CORA_STAGE_LABEL,
  CORA_STAGE_TONE,
  coraEventDetail,
  coraEventTypeLabel,
  fmtDateTime,
} from "../../components/finance/cora/coraEvents";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import {
  consultCoraInvoice,
  fetchCoraIntegrationOverview,
  fetchCoraWebhookEvents,
  retryCoraWebhookEvent,
  type CoraEventStage,
  type CoraEventsPage,
  type CoraIntegrationOverview,
  type CoraWebhookEventItem,
} from "../../services/coraIntegration";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type TabId = "all" | CoraEventStage;

const SETTLE = "finance.invoices.settle";
const EMPTY_PAGE: CoraEventsPage = { items: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 } };

/**
 * Financeiro › Integração Cora: situação da integração (sem segredos), avisos do webhook e ações
 * manuais. A baixa nunca vem do aviso: sempre da consulta na Cora, feita pelo servidor.
 */
export default function CoraIntegrationScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [overview, setOverview] = useState<CoraIntegrationOverview | null>(null);
  const [events, setEvents] = useState<CoraEventsPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const canSettle = !!overview?.permissions.includes(SETTLE);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchCoraIntegrationOverview());
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a integração Cora."));
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEvents(
        await fetchCoraWebhookEvents({
          stage: tab === "all" ? "" : tab,
          search: search.trim(),
          date_from: dateFrom,
          date_to: dateTo,
          page,
        })
      );
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os avisos da Cora."));
      setEvents(EMPTY_PAGE);
    } finally {
      setLoading(false);
    }
  }, [tab, search, dateFrom, dateTo, page]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const timer = setTimeout(loadEvents, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadEvents, search]);

  const refresh = () => {
    setFeedback(null);
    loadOverview();
    loadEvents();
  };

  const runAction = async (key: string, action: () => Promise<string>) => {
    setBusyKey(key);
    setFeedback(null);
    try {
      setFeedback({ tone: "success", text: await action() });
      loadOverview();
      loadEvents();
    } catch (err: any) {
      setFeedback({ tone: "danger", text: getApiResponseMessage(err?.response?.data, "Não foi possível concluir a ação.") });
    } finally {
      setBusyKey(null);
    }
  };

  const retry = (item: CoraWebhookEventItem) =>
    runAction(`retry-${item.id}`, async () => {
      const { event, message } = await retryCoraWebhookEvent(item.id);
      return `${message} Situação: ${CORA_STAGE_LABEL[event.stage].toLowerCase()}.`;
    });

  const consult = (item: CoraWebhookEventItem) =>
    item.invoice
      ? runAction(`consult-${item.id}`, async () => (await consultCoraInvoice(item.invoice!.id)).message)
      : undefined;

  const changeTab = (next: TabId) => {
    setTab(next);
    setPage(1);
  };

  const hasFilters = !!(search || dateFrom || dateTo);
  const counts = overview?.counts;
  const tabs: { id: TabId; label: string; count?: number | null; alert?: string | null }[] = [
    { id: "all", label: "Todos" },
    { id: "waiting", label: CORA_STAGE_LABEL.waiting, count: counts?.waiting },
    { id: "confirmed", label: CORA_STAGE_LABEL.confirmed },
    { id: "received", label: CORA_STAGE_LABEL.received },
    { id: "review", label: CORA_STAGE_LABEL.review, count: counts?.review, alert: counts?.review ? "Há avisos para revisar" : null },
    { id: "failed", label: CORA_STAGE_LABEL.failed, count: counts?.failed, alert: counts?.failed ? "Há avisos com falha" : null },
    { id: "cancelled", label: CORA_STAGE_LABEL.cancelled },
    { id: "ignored", label: CORA_STAGE_LABEL.ignored },
  ];

  const actions = (item: CoraWebhookEventItem) => {
    if (!canSettle) return null;
    return (
      <View className="flex-row flex-wrap" style={{ gap: 6, justifyContent: isMobile ? "flex-start" : "flex-end" }}>
        {item.can_retry ? (
          <Button
            size="sm"
            icon={RotateCcw}
            label="Reprocessar"
            loading={busyKey === `retry-${item.id}`}
            disabled={!!busyKey}
            onPress={() => retry(item)}
          />
        ) : null}
        {item.invoice ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Search}
            label="Consultar na Cora"
            loading={busyKey === `consult-${item.id}`}
            disabled={!!busyKey}
            onPress={() => consult(item)}
          />
        ) : null}
      </View>
    );
  };

  const invoiceCell = (item: CoraWebhookEventItem) =>
    item.invoice ? (
      <>
        <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
          {item.invoice.student?.name ?? "Aluno não informado"}
        </Text>
        <Text className={`${TABLE_CELL_SUBLINE} font-mono`} numberOfLines={1}>
          {`#${item.invoice.id} · ${fmtMoney(item.invoice.amount)}`}
        </Text>
      </>
    ) : (
      <Text className={TABLE_CELL_SUBLINE} numberOfLines={2}>
        Sem cobrança vinculada
      </Text>
    );

  const stageCell = (item: CoraWebhookEventItem) => (
    <View style={{ gap: 4, alignItems: "flex-start" }}>
      <Badge label={CORA_STAGE_LABEL[item.stage]} tone={CORA_STAGE_TONE[item.stage]} dot />
      <Text className={TABLE_CELL_SUBLINE} numberOfLines={3}>
        {coraEventDetail(item)}
      </Text>
    </View>
  );

  const listState = () => {
    if (loading) {
      return (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      );
    }
    if (events.items.length === 0) {
      return (
        <View className="items-center justify-center py-16" style={{ paddingHorizontal: 16 }}>
          <Text className="text-ink-subtle text-sm" style={{ textAlign: "center" }}>
            {hasFilters || tab !== "all" ? "Nenhum aviso com esses filtros." : "Nenhum aviso da Cora recebido ainda."}
          </Text>
        </View>
      );
    }
    return null;
  };

  const pagination =
    events.meta.total > 0 ? (
      <Pagination
        currentPage={events.meta.current_page}
        lastPage={events.meta.last_page}
        total={events.meta.total}
        perPage={events.meta.per_page}
        onPageChange={setPage}
      />
    ) : null;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Integração Cora" }]}
        title="Integração Cora"
        description="Avisos de pagamento enviados pela Cora. A baixa só acontece depois que o sistema consulta a cobrança na Cora."
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            <Button label="Contas a receber" onPress={() => navigate("cobrancas")} />
            <Button icon={RefreshCw} label="Atualizar" onPress={refresh} loading={loading} />
          </View>
        }
      />

      <StatusBar overview={overview} />

      {feedback ? (
        <View
          className={`rounded-ds-md border px-4 py-3 ${feedback.tone === "success" ? "border-success bg-success-tint" : "border-danger bg-danger-tint"}`}
          aria-live="polite"
        >
          <Text className={`text-sm ${feedback.tone === "success" ? "text-success" : "text-danger"}`}>{feedback.text}</Text>
        </View>
      ) : null}

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      <View style={{ gap: 16 }}>
        <Tabs accessibilityLabel="Situação dos avisos" items={tabs} value={tab} onChange={changeTab} />

        <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 8 }}>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 2, minWidth: isMobile ? "100%" : 260 }}>
              <FormInput
                label="Buscar"
                value={search}
                onChangeText={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Nº da cobrança (#123), ID da cobrança ou do evento na Cora"
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}>
              <DatePickerInput
                label="Recebido de"
                value={dateFrom ? isoToDisplay(dateFrom) : ""}
                onChangeText={(v) => {
                  setDateFrom(displayToISO(v));
                  setPage(1);
                }}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}>
              <DatePickerInput
                label="Recebido até"
                value={dateTo ? isoToDisplay(dateTo) : ""}
                onChangeText={(v) => {
                  setDateTo(displayToISO(v));
                  setPage(1);
                }}
              />
            </View>
          </View>
          {hasFilters ? (
            <Text
              className="text-sm font-medium text-brand underline self-start"
              role="button"
              onPress={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
            >
              Limpar filtros
            </Text>
          ) : null}
        </View>

        {isMobile ? (
          <View style={{ gap: 12 }}>
            {listState() ??
              events.items.map((item) => (
                <View key={item.id} className="bg-surface rounded-ds-md border border-border-strong px-3 py-3" style={{ gap: 10 }}>
                  <View className="flex-row justify-between" style={{ gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{invoiceCell(item)}</View>
                    <Text className="text-xs font-mono text-ink-muted">{fmtDateTime(item.received_at)}</Text>
                  </View>
                  <Text className="text-xs text-ink-muted" numberOfLines={1}>
                    {`${coraEventTypeLabel(item.event_type)} · ${item.resource_id}`}
                  </Text>
                  {stageCell(item)}
                  {actions(item)}
                </View>
              ))}
            {pagination ? <View className="bg-surface rounded-ds-md border border-border px-3">{pagination}</View> : null}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ width: "100%" }}>
            <View className="bg-surface rounded-ds-md overflow-hidden border border-border" style={{ width: "100%", minWidth: 1000 }}>
              <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8, minWidth: 120 }}>
                  Recebido em
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1.1, minWidth: 160 }}>
                  Aviso
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1.3, minWidth: 180 }}>
                  Cobrança
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1.5, minWidth: 220 }}>
                  Situação
                </Text>
                <View style={{ width: canSettle ? 290 : 0 }} />
              </View>

              {listState() ??
                events.items.map((item, i) => (
                  <DataTableRow key={item.id} index={i}>
                    <View style={{ flex: 0.8, minWidth: 120, paddingRight: 10 }}>
                      <Text className={`${TABLE_CELL} font-mono`}>{fmtDateTime(item.received_at)}</Text>
                      {item.environment === "stage" ? <Text className={TABLE_CELL_SUBLINE}>homologação</Text> : null}
                    </View>
                    <View style={{ flex: 1.1, minWidth: 160, paddingRight: 10 }}>
                      <Text className={TABLE_CELL} numberOfLines={1}>
                        {coraEventTypeLabel(item.event_type)}
                      </Text>
                      <Text className={`${TABLE_CELL_SUBLINE} font-mono`} numberOfLines={1}>
                        {item.resource_id}
                      </Text>
                    </View>
                    <View style={{ flex: 1.3, minWidth: 180, paddingRight: 10 }}>{invoiceCell(item)}</View>
                    <View style={{ flex: 1.5, minWidth: 220, paddingRight: 10 }}>{stageCell(item)}</View>
                    <View style={{ width: canSettle ? 290 : 0 }}>{actions(item)}</View>
                  </DataTableRow>
                ))}

              {pagination ? <View className="px-4 border-t border-border">{pagination}</View> : null}
            </View>
          </ScrollView>
        )}
      </View>
    </ScrollView>
  );
}

/** Faixa de situação da integração: credenciais e assinatura por ambiente, sem nenhum segredo. */
function StatusBar({ overview }: { overview: CoraIntegrationOverview | null }) {
  const { isMobile } = useResponsiveLayout();
  if (!overview) return null;

  const { environments, counts } = overview;
  const envLine = (key: "prod" | "stage", label: string) => {
    const env = environments[key];
    const parts = [
      env.credentials.configured ? (env.credentials.active ? "credenciais ativas" : "credenciais inativas") : "sem credenciais",
      env.webhook.registered ? "webhook assinado" : "webhook não assinado",
    ];
    return { label, ok: env.credentials.configured && env.credentials.active && env.webhook.registered, text: parts.join(" · ") };
  };
  const items = [
    envLine("prod", "Produção"),
    envLine("stage", "Homologação"),
  ];

  const cells: { label: string; value: string; tone?: "danger" | "warning" }[] = [
    { label: "Último aviso recebido", value: fmtDateTime(overview.last_received_at) },
    { label: "Último processamento", value: fmtDateTime(overview.last_processed_at) },
    {
      label: "Pendências",
      value: `${counts.waiting} aguardando · ${counts.review} revisão · ${counts.failed} falha${counts.failed === 1 ? "" : "s"}`,
      tone: counts.failed > 0 ? "danger" : counts.review > 0 ? "warning" : undefined,
    },
    {
      label: "Reentregas",
      value: `${counts.duplicates} repetido${counts.duplicates === 1 ? "" : "s"}${counts.anomalies ? ` · ${counts.anomalies} divergente${counts.anomalies === 1 ? "" : "s"}` : ""}`,
      tone: counts.anomalies > 0 ? "warning" : undefined,
    },
  ];

  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 16 }}>
      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        {items.map((item) => (
          <View key={item.label} className="flex-row items-start" style={{ gap: 8, flex: 1, minWidth: isMobile ? "100%" : 260 }}>
            <View style={{ width: 8, height: 8, marginTop: 6, backgroundColor: item.ok ? color.success : color["ink-subtle"] }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-sm font-semibold text-ink">{item.label}</Text>
              <Text className="text-xs text-ink-muted">{item.text}</Text>
            </View>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap border-t border-border" style={{ paddingTop: 12, rowGap: 12 }}>
        {cells.map((cell) => (
          <View key={cell.label} style={{ width: isMobile ? "100%" : "25%", paddingRight: 12 }}>
            <Text className="text-xs text-ink-muted">{cell.label}</Text>
            <Text
              className={`text-sm font-mono ${cell.tone === "danger" ? "text-danger" : cell.tone === "warning" ? "text-warning" : "text-ink"}`}
            >
              {cell.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
