import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import {
  applyContractCharges,
  fetchContractChargesPreview,
  type ContractChargePreviewRow,
  type ContractChargesPreview,
  type ContractExternalChargeRow,
} from "../../services/enrollmentContractCharges";
import { paymentMethodLabel } from "../../utils/paymentMethods";
import { useAuth } from "../../contexts/AuthContext";

type LocalInvoiceRow = ContractChargesPreview["local_invoices"][number];

const MANUAL_SETTLEMENT_METHODS = new Set([
  "cash",
  "transfer",
  "credit_card",
  "debit_card",
]);

type Props = {
  visible: boolean;
  enrollmentId: number;
  environment: "stage" | "prod";
  onClose: () => void;
  onSuccess: (message: string) => void;
};

type PillTone = "gray" | "slate" | "emerald" | "violet" | "amber" | "orange" | "red" | "blue";

function fmtMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
}

function getStatusDisplay(v: string | null | undefined): { label: string; tone: PillTone } {
  if (!v) return { label: "—", tone: "gray" };
  const key = v.toLowerCase();

  const statuses: Record<string, { label: string; tone: PillTone }> = {
    pending: { label: "Pendente", tone: "amber" },
    paid: { label: "Paga", tone: "emerald" },
    overdue: { label: "Vencida", tone: "red" },
    canceled: { label: "Cancelada", tone: "red" },
    cancelled: { label: "Cancelada", tone: "red" },
    open: { label: "Aberta", tone: "blue" },
    late: { label: "Atrasada", tone: "red" },
    active: { label: "Ativa", tone: "blue" },
    closed: { label: "Fechada", tone: "slate" },
    draft: { label: "Rascunho", tone: "gray" },
    failed: { label: "Falhou", tone: "red" },
    processing: { label: "Processando", tone: "orange" },
    created: { label: "Criada", tone: "blue" },
    confirmed: { label: "Confirmada", tone: "emerald" },
  };

  return statuses[key] ?? { label: key.replace(/_/g, " "), tone: "gray" };
}

/** Mapeia status bruto da Cora para o equivalente local (pending, paid, cancelled). */
function providerStatusToLocalKey(provider: string | null | undefined): string | null {
  if (!provider) return null;
  const key = provider.toLowerCase().replace(/-/g, "_");

  const map: Record<string, string> = {
    paid: "paid",
    in_payment: "paid",
    completed: "paid",
    received: "paid",
    open: "pending",
    late: "overdue",
    pending: "pending",
    draft: "pending",
    created: "pending",
    cancelled: "cancelled",
    canceled: "cancelled",
    voided: "cancelled",
    expired: "cancelled",
  };

  return map[key] ?? key;
}

function providerAlignedWithLocal(
  localStatus: string | null | undefined,
  providerStatus: string | null | undefined
): boolean {
  if (!providerStatus) return true;
  const localKey = (localStatus ?? "").toLowerCase();
  const mapped = providerStatusToLocalKey(providerStatus);
  if (!mapped) return false;
  if (localKey === mapped) return true;
  return getStatusDisplay(localStatus).label === getStatusDisplay(providerStatus).label;
}

function truncateProviderChargeId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function getStatusMismatchHint(row: LocalInvoiceRow): string | null {
  if (!row.cora_charge_id || !row.cora_status) return null;
  if (providerAlignedWithLocal(row.status, row.cora_status)) return null;

  const localKey = (row.status ?? "").toLowerCase();
  const providerKey = (row.cora_status ?? "").toUpperCase();
  const method = (row.payment_method ?? "").toLowerCase();

  if (
    localKey === "paid" &&
    (providerKey === "CANCELLED" || providerKey === "CANCELED")
  ) {
    if (MANUAL_SETTLEMENT_METHODS.has(method)) {
      return "Baixa manual no sistema; cobrança cancelada no provedor.";
    }
    return "Paga no sistema e cancelada no provedor — confira o histórico.";
  }

  if (
    localKey === "paid" &&
    ["OPEN", "PENDING", "DRAFT", "CREATED"].includes(providerKey)
  ) {
    return "Paga no sistema, ainda aberta no provedor — sincronize ou encerre no gateway.";
  }

  if (localKey === "pending" && providerKey === "PAID") {
    return "Provedor indica pago; dê baixa no sistema se o valor foi recebido.";
  }

  return "Status do sistema e do provedor divergem — confira ambos os lados.";
}

function LocalInvoicesGrid({
  rows,
  expandedKeys,
  onToggleExpanded,
}: {
  rows: LocalInvoiceRow[];
  expandedKeys: Set<string>;
  onToggleExpanded: (key: string) => void;
}) {
  return (
    <View className="gap-1.5">
      {rows.map((row, i) => (
        <LocalInvoiceCard
          key={row.invoice_id}
          row={row}
          compact={i % 2 === 1}
          expanded={expandedKeys.has(`local:${row.invoice_id}`)}
          onToggleExpanded={() => onToggleExpanded(`local:${row.invoice_id}`)}
        />
      ))}
    </View>
  );
}

function RowCheckbox({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <View className="p-1">
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={18}
        color={disabled ? "#D1D5DB" : checked ? "#7C3AED" : "#9CA3AF"}
      />
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 items-center">
      <View className="w-8 h-8 rounded-full bg-white border border-gray-100 items-center justify-center mb-1.5">
        <Ionicons name={icon} size={16} color="#9CA3AF" />
      </View>
      <Text className="text-sm font-semibold text-gray-700">{title}</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">{description}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3 mb-1.5">
      <View className="flex-1">
        <Text className="text-sm font-bold text-gray-900">{title}</Text>
        {subtitle ? <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function SectionPanel({
  children,
  accent = "gray",
}: {
  children: React.ReactNode;
  accent?: "gray" | "violet" | "emerald";
}) {
  const accentStyles = {
    gray: "border-gray-200 bg-gray-50",
    violet: "border-violet-200 bg-violet-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };

  return (
    <View className={`rounded-xl border ${accentStyles[accent]} p-3`}>
      {children}
    </View>
  );
}

function Pill({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: PillTone;
}) {
  const styles = {
    gray: { bg: "bg-gray-100", text: "text-gray-700" },
    slate: { bg: "bg-slate-100", text: "text-slate-700" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
    violet: { bg: "bg-violet-50", text: "text-violet-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-800" },
    orange: { bg: "bg-orange-50", text: "text-orange-700" },
    red: { bg: "bg-red-50", text: "text-red-700" },
    blue: { bg: "bg-sky-50", text: "text-sky-700" },
  };

  return (
    <View className={`rounded-full px-1.5 py-0.5 ${styles[tone].bg}`}>
      <Text className={`text-[10px] font-semibold ${styles[tone].text}`}>{label}</Text>
    </View>
  );
}

function StatusPill({ status, prefix }: { status: string | null | undefined; prefix?: string }) {
  const display = getStatusDisplay(status);

  return (
    <Pill
      label={prefix ? `${prefix} ${display.label}` : display.label}
      tone={display.tone}
    />
  );
}

function CardBadges({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap justify-end gap-1 max-w-[220px]">
      {children}
    </View>
  );
}

function DueDateBadge({ date }: { date: string | null | undefined }) {
  return (
    <View className="flex-row items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5">
      <Ionicons name="calendar-outline" size={11} color="#6B7280" />
      <Text className="text-[10px] font-semibold text-gray-600">{fmtDate(date)}</Text>
    </View>
  );
}

function AccordionChevron({ expanded }: { expanded: boolean }) {
  return (
    <Ionicons
      name={expanded ? "chevron-up" : "chevron-down"}
      size={16}
      color="#6B7280"
    />
  );
}

function DetailBlock({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="min-w-[150px] flex-1 rounded-lg bg-white border border-gray-100 px-2.5 py-2">
      <View className="flex-row items-center gap-1.5 mb-0.5">
        <Ionicons name={icon} size={13} color="#6B7280" />
        <Text className="text-[10px] font-bold uppercase text-gray-500">{label}</Text>
      </View>
      <Text className="text-xs font-semibold text-gray-900" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function LocalInvoiceCard({
  row,
  compact,
  expanded,
  onToggleExpanded,
}: {
  row: LocalInvoiceRow;
  compact?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const hint = getStatusMismatchHint(row);
  const providerVisible = !!row.cora_charge_id;

  return (
    <View
      className={`w-full rounded-lg border px-2.5 py-2 ${
        hint
          ? "border-amber-200 bg-amber-50/40"
          : compact
            ? "border-gray-100 bg-gray-50/60"
            : "border-gray-100 bg-white"
      }`}
    >
      <TouchableOpacity
        onPress={onToggleExpanded}
        activeOpacity={0.75}
        className="flex-row items-center gap-2"
      >
        <View className="w-7 h-7 rounded-md bg-white border border-gray-100 items-center justify-center">
          <Ionicons name="document-text-outline" size={14} color="#6B7280" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="flex-1 text-xs font-bold text-gray-900" numberOfLines={1}>
              {row.description}
            </Text>
            <DueDateBadge date={row.due_date} />
          </View>
          <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
            {fmtMoney(row.amount)}
          </Text>
        </View>
        <CardBadges>
          <StatusPill status={row.status} />
          {providerVisible ? (
            row.cora_status && !providerAlignedWithLocal(row.status, row.cora_status) ? (
              <StatusPill status={row.cora_status} prefix="Cora" />
            ) : (
              <Pill label="Com Cora" tone="emerald" />
            )
          ) : (
            <Pill label="Apenas sistema" tone="gray" />
          )}
        </CardBadges>
        <AccordionChevron expanded={expanded} />
      </TouchableOpacity>

      {expanded ? (
        <View className="mt-2 pt-2 border-t border-gray-100">
          <View className="flex-row flex-wrap gap-1.5">
            <DetailBlock icon="calendar-outline" label="Vencimento" value={fmtDate(row.due_date)} />
            <DetailBlock icon="cash-outline" label="Valor" value={fmtMoney(row.amount)} />
            <DetailBlock icon="card-outline" label="Método" value={paymentMethodLabel(row.payment_method)} />
            <DetailBlock
              icon="cloud-done-outline"
              label="Cora"
              value={providerVisible ? truncateProviderChargeId(row.cora_charge_id!) : "Sem cobrança vinculada"}
            />
            {row.cora_status ? (
              <DetailBlock icon="pulse-outline" label="Status Cora" value={getStatusDisplay(row.cora_status).label} />
            ) : null}
          </View>

          {hint ? (
            <View className="flex-row items-start gap-1.5 mt-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
              <Ionicons name="information-circle-outline" size={13} color="#B45309" />
              <Text className="flex-1 text-[10px] leading-4 text-amber-900">{hint}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CompactTableHeader({
  columns,
}: {
  columns: { label: string; width?: number; flex?: number; align?: "left" | "right" }[];
}) {
  return (
    <View className="flex-row items-center px-2 py-1.5 bg-gray-50 border-b border-gray-100">
      <View style={{ width: 28 }} />
      {columns.map((col) => (
        <Text
          key={col.label}
          className={`text-[9px] font-bold uppercase text-gray-500 ${
            col.align === "right" ? "text-right" : ""
          }`}
          style={col.width ? { width: col.width } : col.flex ? { flex: col.flex } : undefined}
          numberOfLines={1}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

function CoraChargesCompactList({
  rows,
  selectedKeys,
  onToggle,
}: {
  rows: ContractExternalChargeRow[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Nenhum boleto na Cora"
        description="A API da Cora não retornou boletos para esta escola."
      />
    );
  }

  return (
    <View className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
      <CompactTableHeader
        columns={[
          { label: "Venc.", width: 68 },
          { label: "Valor", width: 82 },
          { label: "Vínculo", width: 72 },
          { label: "Status", flex: 1 },
          { label: "Sync", width: 64, align: "right" },
        ]}
      />
      {rows.map((row, index) => {
        const syncDisabled = row.syncable !== true;
        const selected = selectedKeys.has(row.key);
        const actionLabel =
          row.syncable === true
            ? LINK_STATUS_LABELS[row.link_status] ?? "Sincronizar"
            : row.link_status === "linked"
              ? LINK_STATUS_LABELS.linked
              : "—";
        const actionTone = LINK_STATUS_TONES[row.link_status] ?? "violet";
        const statusLabel = getStatusDisplay(row.status).label;

        return (
          <View
            key={row.key}
            className={`flex-row items-center px-1 py-1.5 ${
              index < rows.length - 1 ? "border-b border-gray-50" : ""
            } ${selected ? "bg-violet-50/80" : syncDisabled ? "opacity-75" : ""}`}
          >
            <TouchableOpacity
              onPress={() => onToggle(row.key)}
              disabled={syncDisabled}
              activeOpacity={0.75}
              style={{ width: 28 }}
            >
              <RowCheckbox checked={selected} disabled={syncDisabled} />
            </TouchableOpacity>
            <Text className="text-[11px] text-gray-700" style={{ width: 68 }}>
              {fmtDate(row.due_date)}
            </Text>
            <Text className="text-[11px] font-semibold text-gray-900" style={{ width: 82 }}>
              {fmtMoney(row.amount)}
            </Text>
            <View style={{ width: 72 }}>
              <Pill label={providerLinkLabel(row)} tone={providerLinkTone(row)} />
            </View>
            <Text className="flex-1 text-[10px] text-gray-600 pr-1" numberOfLines={1}>
              {statusLabel}
            </Text>
            <View style={{ width: 64 }} className="items-end">
              <Pill label={actionLabel} tone={actionTone} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ExecutionPreviewSummary({
  preview,
  selectedKeys,
}: {
  preview: ContractChargesPreview;
  selectedKeys: Set<string>;
}) {
  const lines: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [];

  preview.to_generate.forEach((row) => {
    if (!selectedKeys.has(row.key) || row.already_exists || row.disabled) return;
    const tipo =
      row.type === "monthly"
        ? "Mensalidade"
        : row.type === "enrollment_fee"
          ? "Taxa de matrícula"
          : "Cobrança";
    lines.push({
      icon: "add-circle-outline",
      text: `Criar ${tipo.toLowerCase()} ${fmtDate(row.due_date)} — ${fmtMoney(row.amount)}`,
    });
  });

  (preview.provider_boleto_list ?? preview.external_charges).forEach((row) => {
    if (!selectedKeys.has(row.key) || row.syncable !== true) return;
    const acao = LINK_STATUS_LABELS[row.link_status] ?? "Sincronizar";
    lines.push({
      icon: "cloud-download-outline",
      text: `${acao} boleto Cora ${fmtDate(row.due_date)} — ${fmtMoney(row.amount)}`,
    });
  });

  if (lines.length === 0) {
    return null;
  }

  return (
    <View className="rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2.5 gap-1.5">
      <View className="flex-row items-center gap-2">
        <Ionicons name="play-circle-outline" size={16} color="#6D28D9" />
        <Text className="text-xs font-bold text-violet-900">
          Ao executar ({lines.length} {lines.length === 1 ? "ação" : "ações"})
        </Text>
      </View>
      {lines.map((line, i) => (
        <View key={i} className="flex-row items-start gap-2 pl-0.5">
          <Ionicons name={line.icon} size={13} color="#7C3AED" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[11px] leading-4 text-violet-950">{line.text}</Text>
        </View>
      ))}
    </View>
  );
}

const LINK_STATUS_LABELS: Record<string, string> = {
  new: "Importar",
  linked: "Já vinculada",
  updatable: "Atualizar",
  other: "—",
};

const LINK_STATUS_TONES: Record<string, PillTone> = {
  new: "violet",
  linked: "emerald",
  updatable: "blue",
  other: "gray",
};

function providerLinkLabel(row: ContractExternalChargeRow): string {
  if (row.link_status === "linked" && row.linked_invoice_id) {
    return `Fatura #${row.linked_invoice_id}`;
  }
  if (row.for_this_enrollment) return "Matrícula";
  if (row.matches_payer) return "Mesmo CPF";
  return "Outro";
}

function providerLinkTone(row: ContractExternalChargeRow): PillTone {
  if (row.for_this_enrollment) return "violet";
  if (row.matches_payer) return "blue";
  return "gray";
}

function ContractChargesDebugPanel({ debug }: { debug: Record<string, unknown> }) {
  const cora = (debug.cora ?? {}) as Record<string, unknown>;
  const local = (debug.local ?? {}) as Record<string, unknown>;
  const api = (cora.api ?? {}) as Record<string, unknown>;
  const amounts = (local.amounts ?? {}) as Record<string, string | null>;
  const coraSummary = (cora.summary ?? {}) as Record<string, number | null>;
  const json = JSON.stringify(debug, null, 2);

  const copyJson = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return;
    }
  };

  const bullets = [
    `Matrícula #${local.enrollment_id} (${local.enrollment_number ?? "—"}) · ambiente ${local.environment}`,
    `Valores: base ${amounts.base_monthly_amount} − desconto ${amounts.discount_amount} = líquido ${amounts.net_monthly_amount}`,
    `Cora listagem: ${api.listed_count ?? "?"} cobranças, ${api.boleto_count ?? "?"} boletos, CPF na listagem: ${api.with_customer_document_in_list ?? "?"}/${api.listed_count ?? "?"}`,
    `Vínculo: ${coraSummary.external_for_enrollment ?? 0} matrícula · ${coraSummary.external_matches_payer ?? 0} mesmo CPF`,
    (cora.fetch_error as string) ? `Erro: ${cora.fetch_error}` : null,
  ].filter(Boolean) as string[];

  const hydrateSamples = (cora.hydrate_samples ?? []) as Array<Record<string, unknown>>;

  return (
    <View className="rounded-lg border border-amber-300 bg-amber-50/90 overflow-hidden">
      <View className="px-3 py-2 border-b border-amber-200">
        <Text className="text-xs font-bold text-amber-950">Debug cobranças (prod)</Text>
        <Text className="text-[10px] text-amber-800 mt-0.5">
          {String(debug.hint ?? "")}
        </Text>
      </View>
      <View className="px-3 py-2 gap-1">
        {bullets.map((line, i) => (
          <Text key={i} className="text-[10px] leading-4 text-amber-950">
            • {line}
          </Text>
        ))}
        {hydrateSamples.length > 0 ? (
          <Text className="text-[10px] text-amber-900 mt-1">
            Amostra hidratação (list vs detalhe): {hydrateSamples.length} boleto(s) sem CPF na
            listagem — veja JSON completo.
          </Text>
        ) : null}
      </View>
      <View className="flex-row gap-2 px-3 pb-2">
        {Platform.OS === "web" ? (
          <TouchableOpacity
            onPress={() => copyJson().catch(() => undefined)}
            className="px-2 py-1 rounded-md bg-amber-100 border border-amber-200"
          >
            <Text className="text-[10px] font-semibold text-amber-900">Copiar JSON</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        className="max-h-48 bg-gray-900 mx-2 mb-2 rounded-md"
        horizontal={false}
        nestedScrollEnabled
      >
        <Text className="text-[9px] leading-3.5 text-emerald-100 font-mono p-2">{json}</Text>
      </ScrollView>
    </View>
  );
}

function PreviewAlerts({
  warnings,
  providerError,
}: {
  warnings: string[];
  providerError: string | null;
}) {
  const items = [...warnings];
  if (providerError && !items.includes(providerError)) {
    items.push(providerError);
  }
  if (items.length === 0) return null;

  return (
    <View className="gap-1.5">
      {items.map((text, i) => (
        <View
          key={`${i}-${text.slice(0, 24)}`}
          className="flex-row items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2"
        >
          <Ionicons name="warning-outline" size={15} color="#B45309" />
          <Text className="flex-1 text-xs text-amber-800">{text}</Text>
        </View>
      ))}
    </View>
  );
}

function CompactGenerateList({
  rows,
  selectedKeys,
  canGenerate,
  onToggle,
}: {
  rows: ContractChargePreviewRow[];
  selectedKeys: Set<string>;
  canGenerate: boolean;
  onToggle: (key: string) => void;
}) {
  const selectable = rows.filter((r) => !r.disabled && !r.already_exists);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="checkmark-done-outline"
        title="Nada a gerar"
        description="Não há parcelas novas para criar com os filtros atuais."
      />
    );
  }

  return (
    <View className="rounded-lg border border-violet-200 bg-white overflow-hidden">
      <CompactTableHeader
        columns={[
          { label: "Venc.", width: 68 },
          { label: "Valor", width: 82 },
          { label: "Tipo", flex: 1 },
          { label: "", width: 56, align: "right" },
        ]}
      />
      {rows.map((row, index) => {
        const disabled = row.disabled || row.already_exists || !canGenerate;
        const selected = selectedKeys.has(row.key);
        const typeLabel =
          row.type === "monthly"
            ? "Mensalidade"
            : row.type === "enrollment_fee"
              ? "Taxa"
              : "Outro";

        return (
          <View
            key={row.key}
            className={`flex-row items-center px-1 py-1.5 ${
              index < rows.length - 1 ? "border-b border-gray-50" : ""
            } ${selected ? "bg-violet-50/80" : disabled ? "opacity-60" : ""}`}
          >
            <TouchableOpacity
              onPress={() => onToggle(row.key)}
              disabled={disabled}
              activeOpacity={0.75}
              style={{ width: 28 }}
            >
              <RowCheckbox checked={selected} disabled={disabled} />
            </TouchableOpacity>
            <Text className="text-[11px] text-gray-700" style={{ width: 68 }}>
              {fmtDate(row.due_date)}
            </Text>
            <Text className="text-[11px] font-semibold text-gray-900" style={{ width: 82 }}>
              {fmtMoney(row.amount)}
            </Text>
            <Text className="flex-1 text-[10px] text-gray-600" numberOfLines={1}>
              {row.description ?? typeLabel}
            </Text>
            <View style={{ width: 56 }} className="items-end">
              {row.already_exists ? (
                <Pill label="Existe" tone="gray" />
              ) : row.provider_has_boleto ? (
                <Pill label="Cora" tone="emerald" />
              ) : null}
            </View>
          </View>
        );
      })}
      {selectable.length === 0 && rows.length > 0 ? (
        <Text className="text-[10px] text-gray-500 px-2 py-2">Todas as parcelas já existem ou estão bloqueadas.</Text>
      ) : null}
    </View>
  );
}

export default function ContractChargesModal({
  visible,
  enrollmentId,
  environment,
  onClose,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const canRequestDebug =
    user?.role === "super_admin" || user?.role === "admin" || user?.role === "financial";

  const [preview, setPreview] = useState<ContractChargesPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [invoiceTypes, setInvoiceTypes] = useState<string[]>(["monthly"]);
  const [showLocalInvoices, setShowLocalInvoices] = useState(false);
  const [debugPayload, setDebugPayload] = useState<Record<string, unknown> | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContractChargesPreview(enrollmentId, {
        environment,
        invoice_types: invoiceTypes,
      });
      setPreview(data);

      const defaults = new Set<string>();
      (data.provider_boleto_list ?? data.external_charges)
        .filter((row) => row.syncable === true && row.selected_by_default === true)
        .forEach((row) => defaults.add(row.key));
      setSelectedKeys(defaults);
      setExpandedKeys(new Set());
    } catch (e: any) {
      setPreview(null);
      setError(e?.response?.data?.message ?? e?.message ?? "Não foi possível carregar a análise.");
    }
    setLoading(false);
  }, [enrollmentId, environment, invoiceTypes]);

  const loadDebugPreview = useCallback(async () => {
    if (!canRequestDebug) return;
    setDebugLoading(true);
    setError(null);
    try {
      const data = await fetchContractChargesPreview(enrollmentId, {
        environment,
        invoice_types: invoiceTypes,
        debug: true,
      });
      setPreview(data);
      setDebugPayload((data.debug as Record<string, unknown>) ?? null);
      if (!data.debug) {
        setError(
          "Debug não retornado. No servidor: CORA_CONTRACT_CHARGES_DEBUG=true ou login super_admin."
        );
      }
    } catch (e: any) {
      setDebugPayload(null);
      setError(e?.response?.data?.message ?? e?.message ?? "Falha ao carregar debug.");
    }
    setDebugLoading(false);
  }, [canRequestDebug, enrollmentId, environment, invoiceTypes]);

  useEffect(() => {
    if (!visible) return;
    setShowLocalInvoices(false);
    setDebugPayload(null);
    loadPreview();
  }, [visible, loadPreview]);

  const selectableGenerate = useMemo(
    () => preview?.to_generate.filter((r) => !r.disabled && !r.already_exists) ?? [],
    [preview]
  );

  const providerBoletoRows = useMemo(
    () => preview?.provider_boleto_list ?? preview?.external_charges ?? [],
    [preview]
  );

  const selectableSync = useMemo(
    () => providerBoletoRows.filter((r) => r.syncable === true),
    [providerBoletoRows]
  );

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (keys: string[], select: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (select ? next.add(k) : next.delete(k)));
      return next;
    });
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedGenerateKeys = [...selectedKeys].filter((k) => k.startsWith("generate:"));
  const selectedSyncIds = [...selectedKeys]
    .filter((k) => k.startsWith("sync:"))
    .map((k) => k.slice(5));
  const selectedActionCount = selectedGenerateKeys.length + selectedSyncIds.length;
  const selectedSyncSelectableCount = selectableSync.filter((r) => selectedKeys.has(r.key)).length;

  const submit = async () => {
    if (selectedGenerateKeys.length === 0 && selectedSyncIds.length === 0) {
      setError("Marque ao menos uma cobrança para gerar ou sincronizar.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const { message } = await applyContractCharges(enrollmentId, {
        environment,
        generate_keys: selectedGenerateKeys,
        sync_charge_ids: selectedSyncIds,
        create_missing: true,
      });
      onSuccess(message);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Falha ao processar cobranças.");
    }
    setApplying(false);
  };

  const canGenerate = !preview?.blocked.contract_batch_generated;

  return (
    <Modal
      visible={visible}
      title="Cobranças do contrato"
      onClose={applying ? () => undefined : onClose}
      size="xl"
      maxHeight="98%"
      showScrollIndicator
      scrollViewClassName="app-scrollbar py-3"
      footer={
        <>
          <TouchableOpacity
            onPress={onClose}
            disabled={applying}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white"
          >
            <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={loadPreview}
            disabled={loading || applying}
            className={`flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-violet-200 ${
              loading || applying ? "opacity-60" : "bg-white"
            }`}
          >
            <Ionicons name="refresh-outline" size={16} color="#6D28D9" />
            <Text className="text-sm font-semibold text-violet-700">Atualizar análise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={submit}
            disabled={applying || loading}
            className={`flex-row items-center justify-center gap-2 px-5 py-2.5 rounded-lg ${
              applying || loading ? "bg-violet-300" : "bg-violet-600"
            }`}
          >
            {applying ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                <Text className="text-sm font-bold text-white">
                  Executar ({selectedActionCount})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      }
    >
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-2 flex-wrap">
          <Text className="text-xs text-gray-500 flex-1 min-w-[200px]">
            Marque o que deseja executar. Com boleto na Cora na mesma data, a geração local não vem pré-marcada.
          </Text>
          <View className="flex-row items-center gap-2">
            {canRequestDebug ? (
              <TouchableOpacity
                onPress={loadDebugPreview}
                disabled={loading || debugLoading || applying}
                className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 ${
                  loading || debugLoading || applying ? "opacity-60" : ""
                }`}
              >
                {debugLoading ? (
                  <ActivityIndicator size="small" color="#B45309" />
                ) : (
                  <Ionicons name="bug-outline" size={14} color="#B45309" />
                )}
                <Text className="text-[11px] font-semibold text-amber-900">Debug</Text>
              </TouchableOpacity>
            ) : null}
            <Pill
              label={environment === "prod" ? "Produção" : "Homologação"}
              tone={environment === "prod" ? "amber" : "gray"}
            />
          </View>
        </View>

        {debugPayload ? <ContractChargesDebugPanel debug={debugPayload} /> : null}

        {preview?.charges_batch_generated ? (
          <View className="flex-row items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <Ionicons name="lock-closed-outline" size={16} color="#B45309" />
            <Text className="flex-1 text-xs text-amber-800">
              O lote do contrato já foi gerado. Novas parcelas locais estão bloqueadas, mas
              ainda é possível sincronizar boletos do provedor.
            </Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-1.5 rounded-lg bg-gray-50 border border-gray-100 p-1">
          {(["monthly", "enrollment_fee"] as const).map((type) => {
            const active = invoiceTypes.includes(type);
            const label = type === "monthly" ? "Mensalidades" : "Taxa de matrícula";
            return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setInvoiceTypes((prev) => {
                    const next = active ? prev.filter((t) => t !== type) : [...prev, type];
                    return next.length > 0 ? next : ["monthly"];
                  });
                }}
                disabled={loading || applying || preview?.charges_batch_generated}
                className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
                  active ? "bg-white border-violet-300" : "bg-transparent border-transparent"
                }`}
              >
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={14}
                  color={active ? "#7C3AED" : "#9CA3AF"}
                />
                <Text className={`text-[11px] font-semibold ${active ? "text-violet-800" : "text-gray-600"}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-xs text-gray-500 mt-2">Consultando sistema e provedor...</Text>
          </View>
        ) : null}

        {!!error && (
          <View className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {preview && !loading ? (
          <View className="gap-3">
            <ExecutionPreviewSummary preview={preview} selectedKeys={selectedKeys} />

            <PreviewAlerts
              warnings={preview.warnings}
              providerError={preview.summary.provider_fetch_error}
            />

            <SectionPanel accent="emerald">
              <SectionHeader
                title={`Cora (${preview.summary.external_boleto_total ?? providerBoletoRows.length} boleto${(preview.summary.external_boleto_total ?? 0) === 1 ? "" : "s"})`}
                action={
                  selectableSync.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100"
                      onPress={() =>
                        toggleAll(
                          selectableSync.map((r) => r.key),
                          selectedSyncSelectableCount !== selectableSync.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-emerald-800">
                        {selectedSyncSelectableCount === selectableSync.length
                          ? "Desmarcar"
                          : "Marcar sync"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              {providerBoletoRows.length === 0 &&
              (preview.summary.external_boleto_total ?? 0) > 0 ? (
                <View className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 gap-1">
                  <Text className="text-xs font-semibold text-amber-900">
                    {preview.summary.external_boleto_total} boleto(s) na Cora, nenhum vinculável a esta
                    matrícula
                  </Text>
                  <Text className="text-[11px] leading-4 text-amber-800">
                    A sincronização só importa boletos com o mesmo CPF do aluno/responsável ou criados pelo
                    AppCurso (metadata). Boletos emitidos manualmente na Cora com outro CPF não aparecem aqui.
                    Use &quot;Gerar local&quot; e depois &quot;Gerar cobrança&quot; em cada fatura, ou corrija o
                    CPF do responsável financeiro.
                    {canRequestDebug
                      ? ' Use Debug para ver a lista completa e o motivo (cpf_not_matching_payer).'
                      : ''}
                  </Text>
                </View>
              ) : providerBoletoRows.length === 0 && (preview.summary.external_total ?? 0) > 0 ? (
                <Text className="text-xs text-amber-800">
                  {preview.summary.external_total} cobrança(s) na API, nenhuma como boleto.
                </Text>
              ) : (
                <CoraChargesCompactList
                  rows={providerBoletoRows}
                  selectedKeys={selectedKeys}
                  onToggle={toggleKey}
                />
              )}
            </SectionPanel>

            <SectionPanel accent="violet">
              <SectionHeader
                title={`Gerar local (${selectableGenerate.length})`}
                action={
                  canGenerate && selectableGenerate.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-violet-50"
                      onPress={() =>
                        toggleAll(
                          selectableGenerate.map((r) => r.key),
                          selectedGenerateKeys.length !== selectableGenerate.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-violet-700">
                        {selectedGenerateKeys.length === selectableGenerate.length
                          ? "Desmarcar"
                          : "Marcar"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              <CompactGenerateList
                rows={preview.to_generate}
                selectedKeys={selectedKeys}
                canGenerate={canGenerate}
                onToggle={toggleKey}
              />
            </SectionPanel>

            {preview.local_invoices.length > 0 ? (
              <SectionPanel>
                <SectionHeader
                  title={`No sistema (${preview.local_invoices.length})`}
                  action={
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-gray-100"
                      onPress={() => setShowLocalInvoices((v) => !v)}
                    >
                      <Text className="text-xs font-semibold text-gray-700">
                        {showLocalInvoices ? "Ocultar" : "Ver"}
                      </Text>
                    </TouchableOpacity>
                  }
                />
                {showLocalInvoices ? (
                  <LocalInvoicesGrid
                    rows={preview.local_invoices}
                    expandedKeys={expandedKeys}
                    onToggleExpanded={toggleExpanded}
                  />
                ) : null}
              </SectionPanel>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
