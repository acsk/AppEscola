import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Clock, Ellipsis, FileText, Info, Plus, Receipt } from "lucide-react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Icon from "../ui/Icon";
import DataTableRow from "../ui/DataTableRow";
import {
  TABLE_CELL_MONO,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_CONTAINER,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../ui/dataTableStyles";
import { color } from "../../constants/theme";
import type { InvoiceListItem } from "../../types/matriculas";
import {
  INVOICE_DISPLAY,
  type InvoiceFilter,
  countByFilter,
  filterInvoices,
  invoiceDisplayStatus,
  summarizeInvoices,
} from "../../utils/enrollmentInvoices";

const FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendentes", label: "Pendentes" },
  { key: "pagas", label: "Pagas" },
  { key: "vencidas", label: "Vencidas" },
];

type Props = {
  invoices: InvoiceListItem[];
  /** Tabela (largura suficiente) ou cartões (mobile/tablet). */
  compact: boolean;
  typeLabels: Record<string, string>;
  money: (value: string | null) => string;
  formatDate: (iso: string | null) => string;
  batchGeneratedLabel?: string | null;
  onNewInvoice: () => void;
  onContract: () => void;
  onAllSlips: () => void;
  onOpenActions: (invoice: InvoiceListItem) => void;
  onPay: (invoice: InvoiceListItem) => void;
  onReceipt: (invoice: InvoiceListItem) => void;
  onAudit: (invoice: InvoiceListItem) => void;
  renderCard: (invoice: InvoiceListItem) => React.ReactNode;
};

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Painel "Cobranças" do detalhe da matrícula: totais, filtros por situação e lista. */
export default function EnrollmentInvoicesPanel({
  invoices,
  compact,
  typeLabels,
  money,
  formatDate,
  batchGeneratedLabel,
  onNewInvoice,
  onContract,
  onAllSlips,
  onOpenActions,
  onPay,
  onReceipt,
  onAudit,
  renderCard,
}: Props) {
  const [filter, setFilter] = useState<InvoiceFilter>("todas");
  const counts = useMemo(() => countByFilter(invoices), [invoices]);
  const totals = useMemo(() => summarizeInvoices(invoices), [invoices]);
  const shown = useMemo(() => filterInvoices(invoices, filter), [invoices, filter]);

  const description =
    invoices.length === 0
      ? "Nenhuma cobrança vinculada."
      : `${invoices.length} cobrança${invoices.length === 1 ? "" : "s"}${counts.pagas ? ` · ${counts.pagas} paga${counts.pagas === 1 ? "" : "s"}` : ""}.`;

  const rowActions = (item: InvoiceListItem) => {
    const status = invoiceDisplayStatus(item);
    return (
      <View className="flex-row items-center justify-end" style={{ gap: 4 }}>
        {status === "paid" ? (
          <Button size="sm" icon={Receipt} label="Recibo" onPress={() => onReceipt(item)} />
        ) : status !== "cancelled" ? (
          <Button size="sm" label="Pagamento" onPress={() => onPay(item)} />
        ) : null}
        <Button size="sm" variant="ghost" iconOnly icon={Info} accessibilityLabel={`Histórico da cobrança #${item.id}`} onPress={() => onAudit(item)} />
        <Button size="sm" variant="ghost" iconOnly icon={Ellipsis} accessibilityLabel={`Mais ações da cobrança #${item.id}`} onPress={() => onOpenActions(item)} />
      </View>
    );
  };

  return (
    <Panel
      title="Cobranças"
      description={description}
      flush
      actions={
        <View className="flex-row flex-wrap justify-end" style={{ gap: 4 }}>
          <Button size="sm" variant="ghost" icon={FileText} label="Contrato" onPress={onContract} />
          <Button size="sm" variant="ghost" label="Boletos" onPress={onAllSlips} />
          <Button size="sm" variant="primary" icon={Plus} label="Nova cobrança" onPress={onNewInvoice} />
        </View>
      }
    >
      {/* Totais */}
      <View className="flex-row flex-wrap border-b border-border" style={{ paddingVertical: 16, paddingHorizontal: 20, columnGap: 24, rowGap: 12 }}>
        {[
          ["Em aberto", totals.open],
          ["Pago", totals.paid],
          ["Vencido", totals.overdue],
          ["Total do contrato", totals.total],
        ].map(([label, value]) => (
          <View key={label as string}>
            <Text className="text-xs text-ink-subtle">{label as string}</Text>
            <Text
              className={`font-mono font-semibold ${label === "Vencido" && (value as number) > 0 ? "text-danger" : "text-ink"}`}
              style={{ fontSize: 16, lineHeight: 22, marginTop: 4 }}
            >
              {brl(value as number)}
            </Text>
          </View>
        ))}
      </View>

      {/* Filtros por situação */}
      <View role="group" aria-label="Filtrar cobranças" className="flex-row flex-wrap" style={{ gap: 2, paddingTop: 12, paddingHorizontal: 20 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              aria-pressed={active}
              className={`flex-row items-center rounded-ds-md ${active ? "bg-brand-tint" : ""}`}
              style={{ height: 30, paddingHorizontal: 12, gap: 6 }}
            >
              <Text className={`text-sm font-medium ${active ? "text-brand" : "text-ink-muted"}`}>{f.label}</Text>
              <Text className={`text-xs font-mono ${active ? "text-brand" : "text-ink-subtle"}`}>{counts[f.key]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Lista */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}>
        {shown.length === 0 ? (
          <Text className="text-sm text-ink-muted text-center" style={{ paddingVertical: 24 }}>
            {invoices.length === 0 ? "Nenhuma cobrança vinculada a esta matrícula." : "Nenhuma cobrança neste filtro."}
          </Text>
        ) : compact ? (
          <View style={{ gap: 12 }}>{shown.map((item) => <React.Fragment key={item.id}>{renderCard(item)}</React.Fragment>)}</View>
        ) : (
          <View className={TABLE_CONTAINER} style={{ width: "100%" }}>
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 2.4 }}>Cobrança</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Vencimento</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1, textAlign: "right", paddingRight: 16 }}>Valor</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>Status</Text>
              <View style={{ width: 190 }} />
            </View>
            {shown.map((item, i) => {
              const status = INVOICE_DISPLAY[invoiceDisplayStatus(item)];
              return (
                <DataTableRow key={item.id} index={i} onPress={() => onOpenActions(item)}>
                  <View style={{ flex: 2.4, paddingRight: 8, minWidth: 0 }}>
                    <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>{item.description}</Text>
                    <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                      {[item.type ? typeLabels[item.type] ?? item.type : null, `#${item.id}`, item.cora?.charge_id ? `Cora ${item.cora.charge_id}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Text className={TABLE_CELL_MONO} style={{ flex: 1 }}>{formatDate(item.due_date)}</Text>
                  <Text className={TABLE_CELL_MONO} style={{ flex: 1, textAlign: "right", paddingRight: 16 }}>{money(item.amount)}</Text>
                  <View style={{ flex: 1, alignItems: "flex-start" }}>
                    <Badge tone={status.tone} dot label={status.label} />
                  </View>
                  <View style={{ width: 190 }}>{rowActions(item)}</View>
                </DataTableRow>
              );
            })}
          </View>
        )}
      </View>

      {batchGeneratedLabel ? (
        <View
          className="flex-row items-center"
          style={{ gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderStyle: "dashed", borderColor: color.border }}
        >
          <Icon icon={Clock} color={color["ink-subtle"]} />
          <Text className="text-sm text-ink-subtle">{batchGeneratedLabel}</Text>
        </View>
      ) : null}
    </Panel>
  );
}
