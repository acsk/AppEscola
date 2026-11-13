import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import DataTableRow from "../../ui/DataTableRow";
import Badge from "../../ui/Badge";
import { TABLE_HEADER_ROW_STYLE } from "../../ui/dataTableStyles";
import { color } from "../../../constants/theme";
import { fmtMoney } from "../../financeiro/format";
import { fmtDateTime } from "../cora/coraEvents";
import type { BankEntry } from "../../../services/bankReconciliation";
import { RECONCILIATION_STATUS_LABEL, RECONCILIATION_STATUS_TONE, transactionTypeLabel } from "./reconciliationLabels";

type Props = {
  entries: BankEntry[];
  selectedId?: number;
  width: number;
  onSelect: (entry: BankEntry) => void;
  state: React.ReactNode;
};

/** Colunas secundárias se recolhem em telas menores; todos os dados ficam nos detalhes. */
export default function ReconciliationTable({ entries, selectedId, width, onSelect, state }: Props) {
  const showExternalId = width >= 1100;
  const showPayer = width >= 950;
  const columns: { label: string; style: ViewStyle }[] = [
    { label: "Data", style: { width: 126 } },
    { label: "Movimentação", style: { flex: 1, minWidth: 0 } },
    ...(showPayer ? [{ label: "Pagador", style: { width: 125 } }] : []),
    { label: "Tipo", style: { width: 78 } },
    ...(showExternalId ? [{ label: "ID externo", style: { width: 155 } }] : []),
    { label: "Valor", style: { width: 120, alignItems: "flex-end" as const } },
    { label: "Situação", style: { width: 100 } },
    { label: "Vínculo", style: { width: 115 } },
    { label: "Detalhes", style: { width: 58, alignItems: "flex-end" as const } },
  ];
  const cell = (index: number, child: React.ReactNode) => (
    <View key={columns[index].label} style={[columns[index].style, { paddingRight: index === columns.length - 1 ? 0 : 10 }]}>{child}</View>
  );
  const text = (value: string, mono = false, muted = false) => (
    <Text numberOfLines={1} accessibilityLabel={value} className={`${mono ? "font-mono" : ""} ${muted ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: mono ? 11 : 12, lineHeight: 18 }}>{value}</Text>
  );

  return (
    <View>
      <View className="flex-row items-center border-b border-border" style={[TABLE_HEADER_ROW_STYLE, { paddingHorizontal: 12, paddingVertical: 7 }]}>
        {columns.map((column, i) => cell(i, <Text className="font-medium text-ink-muted" style={{ fontSize: 11, lineHeight: 16 }}>{column.label}</Text>))}
      </View>
      {state ?? entries.map((entry, index) => {
        const values = [
          text(fmtDateTime(entry.occurred_at), true),
          <View>
            {text(entry.description ?? entry.invoice?.description ?? transactionTypeLabel(entry.transaction_type))}
            {!showPayer && entry.counterparty_name ? text(entry.counterparty_name, false, true) : null}
          </View>,
          ...(showPayer ? [text(entry.counterparty_name ?? "—", false, true)] : []),
          text(transactionTypeLabel(entry.transaction_type)),
          ...(showExternalId ? [text(entry.external_id, true, true)] : []),
          text(`${entry.direction === "credit" ? "+" : "−"} ${fmtMoney(entry.amount)}`, true),
          <Badge label={entry.status === "reconciled" ? entry.match_type === "auto" ? "Auto" : "Manual" : RECONCILIATION_STATUS_LABEL[entry.status]} tone={entry.status === "reconciled" && entry.match_type === "manual" ? "brand" : RECONCILIATION_STATUS_TONE[entry.status]} dot />,
          <Text className="text-brand font-mono" numberOfLines={1} style={{ fontSize: 11, lineHeight: 18 }}>{entry.invoice ? `Cobrança #${entry.invoice.id}` : entry.expense ? entry.expense.code : "—"}</Text>,
          <Text className="text-brand font-medium" style={{ fontSize: 12, lineHeight: 18 }}>Detalhes</Text>,
        ];
        return (
          <DataTableRow key={entry.id} index={index} onPress={() => onSelect(entry)} style={{ paddingHorizontal: 12, paddingVertical: 6, minHeight: 34, ...(selectedId === entry.id ? { backgroundColor: color["brand-tint"] } : {}) }}>
            {values.map((value, i) => cell(i, value))}
          </DataTableRow>
        );
      })}
    </View>
  );
}
