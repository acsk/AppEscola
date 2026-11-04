import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import StatTile from "../../components/ui/StatTile";
import Modal from "../../components/ui/Modal";
import {
  TABLE_CELL,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fmtMoney } from "../../components/financeiro/format";
import { fmtDateTime } from "../../components/finance/cora/coraEvents";
import ReconcilePanel from "../../components/finance/reconciliation/ReconcilePanel";
import {
  RECONCILIATION_ORIGIN_OPTIONS,
  RECONCILIATION_STATUS_LABEL,
  RECONCILIATION_STATUS_TONE,
  RECONCILIATION_TYPE_OPTIONS,
  entryDetail,
  transactionTypeLabel,
} from "../../components/finance/reconciliation/reconciliationLabels";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import {
  fetchBankEntries,
  fetchReconciliationSummary,
  syncBankStatement,
  type BankEntriesPage,
  type BankEntry,
  type ReconciliationOrigin,
  type ReconciliationStatus,
  type ReconciliationSummary,
  type ReconciliationType,
} from "../../services/bankReconciliation";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type TabId = ReconciliationStatus | "all";

const SETTLE = "finance.invoices.settle";
const EMPTY_PAGE: BankEntriesPage = { items: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 } };
/** A partir desta largura o painel de decisão fica ao lado da lista; abaixo, abre em janela. */
const SIDE_PANEL_MIN_WIDTH = 1280;

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
};

/**
 * Financeiro › Conciliação bancária: movimentações do extrato Cora comparadas com as cobranças.
 * O servidor só concilia sozinho quando a movimentação cita o ID da cobrança e o valor é igual;
 * o resto é decidido aqui, sempre com justificativa.
 */
export default function BankReconciliationScreen({ navigate }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const sidePanel = width >= SIDE_PANEL_MIN_WIDTH;

  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [entries, setEntries] = useState<BankEntriesPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [selected, setSelected] = useState<BankEntry | null>(null);

  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ReconciliationType | "">("");
  const [origin, setOrigin] = useState<ReconciliationOrigin | "">("app");
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));
  const [page, setPage] = useState(1);

  const canSettle = !!summary?.permissions.includes(SETTLE);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchReconciliationSummary({ search: search.trim(), type, origin, date_from: dateFrom, date_to: dateTo }));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o resumo da conciliação."));
    }
  }, [search, type, origin, dateFrom, dateTo]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchBankEntries({
        status: tab === "all" ? "" : tab,
        search: search.trim(),
        type,
        origin,
        date_from: dateFrom,
        date_to: dateTo,
        page,
      });
      setEntries(result);
      setSelected((current) => (current ? result.items.find((e) => e.id === current.id) ?? current : null));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as movimentações."));
      setEntries(EMPTY_PAGE);
    } finally {
      setLoading(false);
    }
  }, [tab, search, type, origin, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = setTimeout(loadSummary, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadSummary, search]);

  useEffect(() => {
    const timer = setTimeout(loadEntries, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadEntries, search]);

  const reload = () => {
    loadSummary();
    loadEntries();
  };

  const sync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      setFeedback({ tone: "success", text: await syncBankStatement({ date_from: dateFrom, date_to: dateTo }) });
      reload();
    } catch (err: any) {
      setFeedback({ tone: "danger", text: getApiResponseMessage(err?.response?.data, "Não foi possível sincronizar o extrato.") });
      loadSummary();
    } finally {
      setSyncing(false);
    }
  };

  const onDecided = (message: string, entry: BankEntry) => {
    setFeedback({ tone: "success", text: message });
    setSelected(sidePanel ? entry : null);
    reload();
  };

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const counts = summary?.counts;
  const tabs: { id: TabId; label: string; count?: number | null; alert?: string | null }[] = [
    { id: "pending", label: "Pendentes", count: counts?.pending },
    { id: "divergent", label: "Divergências", count: counts?.divergent, alert: counts?.divergent ? "Há divergências" : null },
    { id: "reconciled", label: "Conciliadas", count: counts?.reconciled },
    { id: "ignored", label: "Ignoradas", count: counts?.ignored },
    { id: "all", label: "Todas" },
  ];

  const amountText = (entry: BankEntry) => `${entry.direction === "credit" ? "+" : "−"} ${fmtMoney(entry.amount)}`;

  const statusCell = (entry: BankEntry) => (
    <View style={{ gap: 4, alignItems: "flex-start" }}>
      <Badge
        label={
          entry.status === "reconciled"
            ? `Conciliada ${entry.match_type === "auto" ? "auto." : "man."}`
            : RECONCILIATION_STATUS_LABEL[entry.status]
        }
        tone={RECONCILIATION_STATUS_TONE[entry.status]}
        dot
      />
      <Text className={TABLE_CELL_SUBLINE} numberOfLines={3}>
        {entryDetail(entry)}
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
    if (entries.items.length === 0) {
      return (
        <View className="items-center justify-center py-16" style={{ paddingHorizontal: 16 }}>
          <Text className="text-ink-subtle text-sm" style={{ textAlign: "center" }}>
            {summary?.last_sync
              ? "Nenhuma movimentação com esses filtros."
              : "Nenhuma movimentação importada ainda. Use “Sincronizar agora” para trazer o extrato da Cora."}
          </Text>
        </View>
      );
    }
    return null;
  };

  const pagination =
    entries.meta.total > 0 ? (
      <Pagination
        currentPage={entries.meta.current_page}
        lastPage={entries.meta.last_page}
        total={entries.meta.total}
        perPage={entries.meta.per_page}
        onPageChange={setPage}
      />
    ) : null;

  const list = isMobile ? (
    <View style={{ gap: 12 }}>
      {listState() ??
        entries.items.map((entry) => (
          <View key={entry.id} className="bg-surface rounded-ds-md border border-border-strong px-3 py-3" style={{ gap: 8 }}>
            <View className="flex-row justify-between" style={{ gap: 8 }}>
              <Text className={`${TABLE_CELL_SEMIBOLD}`} style={{ flex: 1 }} numberOfLines={2}>
                {entry.description ?? transactionTypeLabel(entry.transaction_type)}
              </Text>
              <Text className={`text-sm font-mono ${entry.direction === "credit" ? "text-ink" : "text-danger"}`}>{amountText(entry)}</Text>
            </View>
            <Text className="text-xs text-ink-muted font-mono" numberOfLines={1}>
              {`${fmtDateTime(entry.occurred_at)} · ${transactionTypeLabel(entry.transaction_type)}${entry.counterparty_name ? ` · ${entry.counterparty_name}` : ""}`}
            </Text>
            {statusCell(entry)}
            <Button size="sm" variant="secondary" label={canSettle ? "Abrir" : "Detalhes"} onPress={() => setSelected(entry)} />
          </View>
        ))}
      {pagination ? <View className="bg-surface rounded-ds-md border border-border px-3">{pagination}</View> : null}
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ width: "100%" }}>
      <View className="bg-surface rounded-ds-md overflow-hidden border border-border" style={{ width: "100%", minWidth: sidePanel ? 600 : 760 }}>
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ width: 110 }}>
            Data
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4, minWidth: 180 }}>
            Movimentação
          </Text>
          {sidePanel ? null : (
            <Text className={TABLE_HEADER_CELL} style={{ width: 110 }}>
              Tipo
            </Text>
          )}
          <Text className={TABLE_HEADER_CELL} style={{ width: 130, textAlign: "right", paddingRight: 16 }}>
            Valor
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 180 }}>
            Situação
          </Text>
        </View>

        {listState() ??
          entries.items.map((entry, i) => {
            const active = selected?.id === entry.id;
            return (
              <DataTableRow
                key={entry.id}
                index={i}
                onPress={() => setSelected(entry)}
                style={active ? { backgroundColor: color["brand-tint"], borderLeftWidth: 3, borderLeftColor: color.brand } : undefined}
              >
                <Text className={`${TABLE_CELL} font-mono`} style={{ width: 110, paddingRight: 8 }}>
                  {fmtDateTime(entry.occurred_at)}
                </Text>
                <View style={{ flex: 1.4, minWidth: 180, paddingRight: 10 }}>
                  <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={2}>
                    {[entry.description, entry.counterparty_name].filter(Boolean).join(" · ") || "—"}
                  </Text>
                  <Text className={`${TABLE_CELL_SUBLINE} font-mono`} numberOfLines={1}>
                    {`${sidePanel ? `${transactionTypeLabel(entry.transaction_type)} · ` : ""}${entry.cited_charge_ids[0] ?? entry.external_id}`}
                  </Text>
                </View>
                {sidePanel ? null : (
                  <Text className={TABLE_CELL} style={{ width: 110, paddingRight: 8 }}>
                    {transactionTypeLabel(entry.transaction_type)}
                  </Text>
                )}
                <Text
                  className={`${TABLE_CELL} font-mono ${entry.direction === "credit" ? "" : "text-danger"}`}
                  style={{ width: 130, textAlign: "right", paddingRight: 16 }}
                >
                  {amountText(entry)}
                </Text>
                <View style={{ flex: 1.2, minWidth: 180, paddingRight: 10 }}>{statusCell(entry)}</View>
              </DataTableRow>
            );
          })}

        {pagination ? <View className="px-4 border-t border-border">{pagination}</View> : null}
      </View>
    </ScrollView>
  );

  const panel = selected ? <ReconcilePanel entry={selected} canSettle={canSettle} onDecided={onDecided} /> : null;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Conciliação bancária" }]}
        title="Conciliação bancária"
        description="Movimentações da conta Cora comparadas com as cobranças do sistema."
        actions={
          <>
            <Button label="Integração Cora" onPress={() => navigate("financeiro-cora")} />
            <Button icon={RefreshCw} label="Atualizar" onPress={reload} loading={loading} />
            {canSettle ? <Button variant="primary" label="Sincronizar agora" onPress={sync} loading={syncing} disabled={syncing} /> : null}
          </>
        }
      />

      <ConnectionStrip summary={summary} />

      {summary ? (
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {[
            { label: "Entradas no período", value: fmtMoney(summary.credits.amount), hint: `${summary.credits.count} movimentações` },
            { label: "Saídas no período", value: fmtMoney(summary.debits.amount), hint: `${summary.debits.count} movimentações` },
            {
              label: "Conciliado",
              value: summary.reconciled.percent === null ? "—" : summary.reconciled.percent.toLocaleString("pt-BR"),
              unit: summary.reconciled.percent === null ? undefined : "%",
              hint: `${fmtMoney(summary.reconciled.amount)} de ${fmtMoney(summary.reconciled.of_amount)}`,
            },
            { label: "Pendente", value: fmtMoney(summary.pending.amount), hint: `${summary.pending.count} movimentações` },
            { label: "Divergências", value: String(summary.counts.divergent), hint: "precisam de decisão" },
          ].map((tile) => (
            <View key={tile.label} style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
              <StatTile label={tile.label} value={tile.value} unit={tile.unit} hint={tile.hint} />
            </View>
          ))}
        </View>
      ) : null}

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
        <Tabs
          accessibilityLabel="Situação das movimentações"
          items={tabs}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPage(1);
          }}
        />

        <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16 }}>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 2, minWidth: isMobile ? "100%" : 240 }}>
              <FormInput label="Buscar" value={search} onChangeText={resetPage(setSearch)} placeholder="Descrição, pagador, ID ou valor" />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 190 }}>
              <FormSelect
                label="Origem"
                value={origin}
                options={RECONCILIATION_ORIGIN_OPTIONS}
                onChange={(v) => resetPage(setOrigin)(v as ReconciliationOrigin | "")}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 160 }}>
              <FormSelect
                label="Tipo"
                value={type}
                options={RECONCILIATION_TYPE_OPTIONS}
                onChange={(v) => resetPage(setType)(v as ReconciliationType | "")}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <DatePickerInput label="De" value={dateFrom ? isoToDisplay(dateFrom) : ""} onChangeText={(v) => resetPage(setDateFrom)(displayToISO(v))} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <DatePickerInput label="Até" value={dateTo ? isoToDisplay(dateTo) : ""} onChangeText={(v) => resetPage(setDateTo)(displayToISO(v))} />
            </View>
          </View>
        </View>

        {sidePanel ? (
          <View className="flex-row items-start" style={{ gap: 16 }}>
            <View style={{ flex: 1.7, minWidth: 0 }}>{list}</View>
            <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1, minWidth: 380, maxWidth: 480, padding: 20 }}>
              {panel ?? (
                <Text className="text-sm text-ink-muted">Selecione uma movimentação para ver os critérios e decidir.</Text>
              )}
            </View>
          </View>
        ) : (
          <>
            {list}
            <Modal visible={!!selected} title="Movimentação" onClose={() => setSelected(null)} size="md">
              {panel}
            </Modal>
          </>
        )}
      </View>
    </ScrollView>
  );
}

/** Faixa do banco: ambiente, credenciais e última busca do extrato. Nenhum dado da conta aparece aqui. */
function ConnectionStrip({ summary }: { summary: ReconciliationSummary | null }) {
  const { isMobile } = useResponsiveLayout();
  if (!summary) return null;

  const last = summary.last_sync;
  const envLabel = summary.environment === "prod" ? "produção" : "homologação";
  const lastText = !last
    ? "Nenhuma sincronização ainda"
    : last.status === "failed"
      ? `Falhou em ${fmtDateTime(last.finished_at)}`
      : last.status === "running"
        ? `Em andamento desde ${fmtDateTime(last.started_at)}`
        : `${fmtDateTime(last.finished_at)} · ${last.created} nova(s), ${last.auto_reconciled} conciliada(s) auto.`;

  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 8 }}>
      <View className="flex-row flex-wrap items-center" style={{ gap: isMobile ? 8 : 24 }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View className="border border-border-strong rounded-ds-sm px-2 py-1">
            <Text className="text-sm font-semibold text-ink">Banco Cora</Text>
          </View>
          <View style={{ width: 8, height: 8, backgroundColor: summary.credentials_active ? color.success : color["ink-subtle"] }} />
          <Text className="text-sm text-ink">{`${summary.credentials_active ? "Credenciais ativas" : "Sem credenciais ativas"} · ${envLabel}`}</Text>
        </View>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text className="text-xs text-ink-muted">Operação com a Cora desde</Text>
          <Text className="text-sm font-mono text-ink">
            {summary.operating_since ? summary.operating_since.split("-").reverse().join("/") : "Nenhuma cobrança gerada ainda"}
          </Text>
        </View>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text className="text-xs text-ink-muted">Última sincronização</Text>
          <Text className={`text-sm font-mono ${last?.status === "failed" ? "text-danger" : "text-ink"}`}>{lastText}</Text>
        </View>
      </View>
      {last?.status === "failed" && last.error ? <Text className="text-sm text-danger">{last.error}</Text> : null}
      <Text className="text-xs text-ink-muted">
        Pagamentos de cobranças geradas pela aplicação são conciliados automaticamente pelo ID do pagamento na Cora. Boletos
        emitidos direto na Cora, tarifas e transferências aparecem em “Fora da aplicação”.
      </Text>
    </View>
  );
}
