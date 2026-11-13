import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Download, Link, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Pagination from "../../components/ui/Pagination";
import ReconciliationTable from "../../components/finance/reconciliation/ReconciliationTable";
import ToastBanner from "../../components/ui/ToastBanner";
import Modal from "../../components/ui/Modal";
import {
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
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

type TabId = ReconciliationStatus | "all" | "outside";

const SETTLE = "finance.invoices.settle";
const EMPTY_PAGE: BankEntriesPage = { items: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 } };

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
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [tableWidth, setTableWidth] = useState(0);

  const compactList = isMobile || (tableWidth > 0 && tableWidth < 780);

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
  const [perPage, setPerPage] = useState(100);
  const [exporting, setExporting] = useState(false);
  const effectiveOrigin = tab === "outside" ? "other" : origin;
  const invalidPeriod = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const canSettle = !!summary?.permissions.includes(SETTLE);

  const loadSummary = useCallback(async () => {
    if (invalidPeriod) return;
    try {
      setSummary(await fetchReconciliationSummary({ search: search.trim(), type, origin: effectiveOrigin, date_from: dateFrom, date_to: dateTo }));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o resumo da conciliação."));
    }
  }, [search, type, effectiveOrigin, dateFrom, dateTo, invalidPeriod]);

  const loadEntries = useCallback(async () => {
    if (invalidPeriod) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchBankEntries({
        status: tab === "all" || tab === "outside" ? "" : tab,
        search: search.trim(),
        type,
        origin: effectiveOrigin,
        date_from: dateFrom,
        date_to: dateTo,
        page,
        per_page: perPage,
      });
      setEntries(result);
      setSelected((current) => (current ? result.items.find((e) => e.id === current.id) ?? null : null));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as movimentações."));
      setEntries(EMPTY_PAGE);
    } finally {
      setLoading(false);
    }
  }, [tab, search, type, effectiveOrigin, dateFrom, dateTo, page, perPage, invalidPeriod]);

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
      // Busca tudo o que ainda não foi importado; o filtro de datas só muda o que é exibido.
      setFeedback({ tone: "success", text: await syncBankStatement({}) });
      reload();
    } catch (err: any) {
      setFeedback({ tone: "danger", text: getApiResponseMessage(err?.response?.data, "Não foi possível sincronizar o extrato.") });
      loadSummary();
    } finally {
      setSyncing(false);
    }
  };

  const onDecided = (message: string) => {
    setFeedback({ tone: "success", text: message });
    setSelected(null);
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
    { id: "all", label: "Todas", count: counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null },
    { id: "outside", label: "Fora da aplicação" },
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

  const list = compactList ? (
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
    <ReconciliationTable entries={entries.items} selectedId={selected?.id} width={tableWidth}
      onSelect={setSelected} state={listState()} />
  );

  const exportEntries = async () => {
    if (invalidPeriod) return;
    setExporting(true);
    try {
      const rows: BankEntry[] = [];
      let currentPage = 1;
      let lastPage = 1;
      do {
        const result = await fetchBankEntries({
          status: tab === "all" || tab === "outside" ? "" : tab,
          origin: effectiveOrigin, search: search.trim(), type, date_from: dateFrom, date_to: dateTo,
          page: currentPage, per_page: 100,
        });
        rows.push(...result.items);
        lastPage = result.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      // Protege células de texto contra fórmulas ao abrir o CSV em uma planilha.
      const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '\"\"')}"`;
      const csv = [
        ["Data", "Movimentação", "Pagador", "Tipo", "ID externo", "Valor", "Situação", "Vínculo"],
        ...rows.map((entry) => [fmtDateTime(entry.occurred_at), entry.description ?? "", entry.counterparty_name ?? "",
          transactionTypeLabel(entry.transaction_type), entry.external_id,
          `${entry.direction === "debit" ? "-" : ""}${Number(entry.amount).toFixed(2).replace(".", ",")}`,
          RECONCILIATION_STATUS_LABEL[entry.status], entry.invoice ? `Cobrança #${entry.invoice.id}` : entry.expense?.code ?? ""]),
      ].map((row) => row.map(cell).join(";")).join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "conciliacao-bancaria.csv";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setFeedback({ tone: "danger", text: getApiResponseMessage(err?.response?.data, "Não foi possível exportar as movimentações.") });
    } finally {
      setExporting(false);
    }
  };

  const selectedIndex = entries.items.findIndex((entry) => entry.id === selected?.id);
  const panel = selected ? <ReconcilePanel key={selected.id} entry={selected} canSettle={canSettle} onDecided={onDecided} /> : null;

  return (
    <>
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 14 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Conciliação bancária" }]}
        title="Conciliação bancária"
        description="Movimentações da conta Cora comparadas com as cobranças do sistema."
        actions={
          <>
            <Button size="sm" variant="secondary" icon={Link} label="Integração Cora" onPress={() => navigate("financeiro-cora")} />
            <Button size="sm" variant="secondary" icon={Download} label="Exportar" onPress={exportEntries} loading={exporting} disabled={invalidPeriod || loading} />
            {canSettle ? <Button size="sm" icon={RefreshCw} variant="primary" label="Sincronizar agora" onPress={sync} loading={syncing} disabled={syncing} /> : null}
          </>
        }
      />

      <ConnectionStrip summary={summary} onRefresh={reload} loading={loading} />

      {summary ? (
        <View className="bg-surface border border-border rounded-ds-md overflow-hidden" style={{ flexDirection: "row", flexWrap: "wrap" }}>
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
            { label: "Divergências", value: String(summary.counts.divergent), hint: summary.counts.divergent ? "precisam de decisão" : "nenhuma decisão pendente" },
          ].map((tile, i) => (
            <View key={tile.label} className="border-border" style={{ flex: 1, minWidth: compactList ? "50%" : 0, paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: i > 0 && !compactList ? 1 : 0, borderBottomWidth: compactList ? 1 : 0 }}>
              <Text className="text-ink-muted font-medium" style={{ fontSize: 11, lineHeight: 16 }}>{tile.label}</Text>
              <Text className="font-mono font-semibold text-ink" style={{ fontSize: 18, lineHeight: 26 }}>{tile.value}{tile.unit}</Text>
              <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 16 }}>{tile.hint}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {summary?.last_sync?.status === "success" ? (
        <View className="border border-success bg-success-tint rounded-ds-md" style={{ paddingHorizontal: 14, paddingVertical: 8 }} role="status">
          <Text className="text-xs text-ink">
            <Text className="text-success font-semibold">✓ </Text>
            Extrato sincronizado{summary.last_sync.period_start ? ` de ${isoToDisplay(summary.last_sync.period_start.slice(0, 10))}` : ""}{summary.last_sync.period_end ? ` até ${isoToDisplay(summary.last_sync.period_end.slice(0, 10))}` : ""}: {summary.last_sync.created} movimentações novas, {summary.last_sync.auto_reconciled} conciliadas automaticamente.
          </Text>
        </View>
      ) : null}


      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3" style={{ gap: 8 }}>
          <Text className="text-sm text-danger">{error}</Text>
          <Button size="sm" variant="secondary" label="Tentar novamente" onPress={reload} disabled={invalidPeriod} />
        </View>
      ) : null}

      <View className="bg-surface border border-border rounded-ds-md overflow-hidden" onLayout={(event) => setTableWidth(event.nativeEvent.layout.width)}>
        <View style={{ paddingHorizontal: 12 }}>
        <Tabs
          accessibilityLabel="Situação das movimentações"
          items={tabs}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPage(1);
          }}
        />
        </View>

        <View className="border-b border-border" style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 2, minWidth: isMobile ? "100%" : 240 }}>
              <FormInput dense label="Buscar" value={search} onChangeText={resetPage(setSearch)} placeholder="Descrição, pagador, ID ou valor" />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 190 }}>
              <FormSelect
                dense
                disabled={tab === "outside"}
                label="Origem"
                value={effectiveOrigin}
                options={RECONCILIATION_ORIGIN_OPTIONS}
                onChange={(v) => resetPage(setOrigin)(v as ReconciliationOrigin | "")}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 160 }}>
              <FormSelect
                dense
                label="Tipo"
                value={type}
                options={RECONCILIATION_TYPE_OPTIONS}
                onChange={(v) => resetPage(setType)(v as ReconciliationType | "")}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <DatePickerInput compact label="De" value={dateFrom ? isoToDisplay(dateFrom) : ""} onChangeText={(v) => resetPage(setDateFrom)(displayToISO(v))} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <DatePickerInput compact error={invalidPeriod ? "A data final deve ser igual ou posterior à inicial." : undefined} label="Até" value={dateTo ? isoToDisplay(dateTo) : ""} onChangeText={(v) => resetPage(setDateTo)(displayToISO(v))} />
            </View>
          </View>
        </View>

        <View className="flex-row items-center justify-between flex-wrap border-b border-border" style={{ gap: 8, padding: 10 }}>
          <Text className="text-xs text-ink-subtle">{entries.meta.total} movimentações · Total da página <Text className="font-mono text-ink">{fmtMoney(entries.items.reduce((total, entry) => total + (entry.direction === "credit" ? 1 : -1) * Number(entry.amount), 0))}</Text></Text>
          <View style={{ width: 150 }}>
            <FormSelect label="Itens por página" hideLabel dense value={perPage} options={[25, 50, 100].map((value) => ({ value, label: `${value} por página` }))} onChange={(value) => resetPage(setPerPage)(Number(value))} />
          </View>
        </View>
        {list}
        {!compactList && pagination ? <View style={{ paddingHorizontal: 12 }}>{pagination}</View> : null}
      </View>
    </ScrollView>
    <ToastBanner visible={!!feedback} type={feedback?.tone === "success" ? "success" : "error"} message={feedback?.text ?? ""} onClose={() => setFeedback(null)} />
    <Modal visible={!!selected} title="Detalhes da movimentação" onClose={() => setSelected(null)} size="lg" compact showScrollIndicator
      headerContent={selected ? (
        <View className="flex-row items-center" style={{ gap: 8, marginTop: 6 }}>
          <Text className="font-mono text-xs text-ink-subtle" style={{ flex: 1 }}>{selectedIndex + 1} de {entries.items.length} nesta página</Text>
          <Button size="sm" variant="ghost" icon={ChevronLeft} label="Anterior" disabled={selectedIndex <= 0} onPress={() => setSelected(entries.items[selectedIndex - 1])} />
          <Button size="sm" variant="ghost" icon={ChevronRight} label="Próxima" disabled={selectedIndex < 0 || selectedIndex >= entries.items.length - 1} onPress={() => setSelected(entries.items[selectedIndex + 1])} />
        </View>
      ) : null}
      footer={<Button size="sm" label="Fechar" onPress={() => setSelected(null)} />}>
      {panel}
    </Modal>
    </>
  );
}

/** Faixa do banco: ambiente, credenciais e última busca do extrato. */
function ConnectionStrip({ summary, onRefresh, loading }: { summary: ReconciliationSummary | null; onRefresh: () => void; loading: boolean }) {
  if (!summary) return null;
  const last = summary.last_sync;
  const lastText = !last ? "Nenhuma sincronização" : last.status === "running"
    ? `Em andamento desde ${fmtDateTime(last.started_at)}` : fmtDateTime(last.finished_at);
  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}>
      <View className="flex-row flex-wrap items-center" style={{ gap: 14 }}>
        <View className="border border-border-strong rounded-ds-sm" style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text className="text-xs font-semibold text-ink">Banco Cora</Text>
        </View>
        <Text className={`text-xs font-medium ${summary.credentials_active ? "text-success" : "text-ink-subtle"}`}>
          {`${summary.credentials_active ? "● Credenciais ativas" : "Sem credenciais ativas"} · ${summary.environment === "prod" ? "produção" : "homologação"}`}
        </Text>
        <Text className="text-xs text-ink-muted">Operação desde <Text className="font-mono text-ink">{summary.operating_since ? isoToDisplay(summary.operating_since) : "—"}</Text></Text>
        <Text className="text-xs text-ink-muted">Última sincronização <Text className={`font-mono ${last?.status === "failed" ? "text-danger" : "text-ink"}`}>{lastText}</Text></Text>
        <View style={{ marginLeft: "auto" }}>
          <Button size="sm" variant="ghost" icon={RefreshCw} label="Atualizar" onPress={onRefresh} loading={loading} />
        </View>
      </View>
      {last?.status === "failed" && last.error ? <Text className="text-xs text-danger">{last.error}</Text> : null}
    </View>
  );
}
