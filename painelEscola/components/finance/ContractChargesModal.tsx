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
  purgeImportedContractCharges,
  type ContractChargePreviewRow,
  type ContractChargesPreview,
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
    return "Provedor indica pago; o sync diário (ou reconciliação) atualiza o status no sistema — baixa manual não é permitida com ID Cora.";
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
        color={disabled ? "var(--ds-border-strong)" : checked ? "var(--ds-brand)" : "var(--ds-ink-subtle)"}
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
    <View className="rounded-ds-md border border-dashed border-border bg-surface-sunken px-3 py-3 items-center">
      <View className="w-8 h-8 rounded-full bg-surface border border-border items-center justify-center mb-1.5">
        <Ionicons name={icon} size={16} color="var(--ds-ink-subtle)" />
      </View>
      <Text className="text-sm font-semibold text-ink">{title}</Text>
      <Text className="text-xs text-ink-muted text-center mt-1">{description}</Text>
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
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="text-xs text-ink-muted mt-0.5">{subtitle}</Text> : null}
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
    gray: "border-border bg-surface-sunken",
    violet: "border-border bg-brand-tint",
    emerald: "border-success bg-success-tint/50",
  };

  return (
    <View className={`rounded-ds-md border ${accentStyles[accent]} p-3`}>
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
    gray: { bg: "bg-surface-sunken", text: "text-ink" },
    slate: { bg: "bg-surface-sunken", text: "text-ink" },
    emerald: { bg: "bg-success-tint", text: "text-success" },
    violet: { bg: "bg-brand-tint", text: "text-brand" },
    amber: { bg: "bg-warning-tint", text: "text-warning" },
    orange: { bg: "bg-warning-tint", text: "text-warning" },
    red: { bg: "bg-danger-tint", text: "text-danger" },
    blue: { bg: "bg-brand-tint", text: "text-brand" },
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
    <View className="flex-row items-center gap-1 rounded-ds-md bg-surface-sunken px-1.5 py-0.5">
      <Ionicons name="calendar-outline" size={11} color="var(--ds-ink-muted)" />
      <Text className="text-[10px] font-semibold text-ink-muted">{fmtDate(date)}</Text>
    </View>
  );
}

function AccordionChevron({ expanded }: { expanded: boolean }) {
  return (
    <Ionicons
      name={expanded ? "chevron-up" : "chevron-down"}
      size={16}
      color="var(--ds-ink-muted)"
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
    <View className="min-w-[150px] flex-1 rounded-ds-md bg-surface border border-border px-2.5 py-2">
      <View className="flex-row items-center gap-1.5 mb-0.5">
        <Ionicons name={icon} size={13} color="var(--ds-ink-muted)" />
        <Text className="text-[10px] font-semibold uppercase text-ink-muted">{label}</Text>
      </View>
      <Text className="text-xs font-semibold text-ink" numberOfLines={2}>
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
      className={`w-full rounded-ds-md border px-2.5 py-2 ${
        hint
          ? "border-warning bg-warning-tint/40"
          : compact
            ? "border-border bg-surface-sunken"
            : "border-border bg-surface"
      }`}
    >
      <TouchableOpacity
        onPress={onToggleExpanded}
        activeOpacity={0.75}
        className="flex-row items-center gap-2"
      >
        <View className="w-7 h-7 rounded-ds-md bg-surface border border-border items-center justify-center">
          <Ionicons name="document-text-outline" size={14} color="var(--ds-ink-muted)" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[10px] font-mono font-semibold text-brand" numberOfLines={1}>
              ID #{row.invoice_id}
            </Text>
            <DueDateBadge date={row.due_date} />
          </View>
          <Text className="text-xs font-semibold text-ink mt-0.5" numberOfLines={1}>
            {row.description}
          </Text>
          <Text className="text-[11px] text-ink-muted mt-0.5" numberOfLines={1}>
            {fmtMoney(row.amount)}
            {providerVisible && row.cora_charge_id ? ` · Cora ${row.cora_charge_id}` : ""}
          </Text>
        </View>
        <CardBadges>
          <StatusPill status={row.status} />
          {providerVisible ? (
            row.imported_from_cora_sync ? (
              <Pill label="Importada Cora" tone="amber" />
            ) : row.cora_status && !providerAlignedWithLocal(row.status, row.cora_status) ? (
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
        <View className="mt-2 pt-2 border-t border-border">
          <View className="flex-row flex-wrap gap-1.5">
            <DetailBlock icon="pricetag-outline" label="ID" value={`#${row.invoice_id}`} />
            <DetailBlock icon="calendar-outline" label="Vencimento" value={fmtDate(row.due_date)} />
            <DetailBlock icon="cash-outline" label="Valor" value={fmtMoney(row.amount)} />
            <DetailBlock icon="card-outline" label="Método" value={paymentMethodLabel(row.payment_method)} />
            <DetailBlock
              icon="cloud-done-outline"
              label="Cora"
              value={providerVisible ? String(row.cora_charge_id) : "Sem cobrança vinculada"}
            />
            {row.cora_status ? (
              <DetailBlock icon="pulse-outline" label="Status Cora" value={getStatusDisplay(row.cora_status).label} />
            ) : null}
          </View>

          {hint ? (
            <View className="flex-row items-start gap-1.5 mt-1.5 rounded-ds-md bg-warning-tint border border-warning px-2 py-1.5">
              <Ionicons name="information-circle-outline" size={13} color="var(--ds-warning)" />
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
    <View className="flex-row items-center px-2 py-1.5 bg-surface-sunken border-b border-border">
      <View style={{ width: 28 }} />
      {columns.map((col) => (
        <Text
          key={col.label}
          className={`text-[9px] font-semibold uppercase text-ink-muted ${
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

  if (lines.length === 0) {
    return null;
  }

  return (
    <View className="rounded-ds-md border border-border bg-brand-tint px-3 py-2.5 gap-1.5">
      <View className="flex-row items-center gap-2">
        <Ionicons name="play-circle-outline" size={16} color="var(--ds-brand-hover)" />
        <Text className="text-xs font-semibold text-brand">
          Ao executar ({lines.length} {lines.length === 1 ? "ação" : "ações"})
        </Text>
      </View>
      {lines.map((line, i) => (
        <View key={i} className="flex-row items-start gap-2 pl-0.5">
          <Ionicons name={line.icon} size={13} color="var(--ds-brand)" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[11px] leading-4 text-violet-950">{line.text}</Text>
        </View>
      ))}
    </View>
  );
}

type ContractChargesStep = "overview" | "generate" | "review";

const WIZARD_STEPS: { id: ContractChargesStep; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "generate", label: "Gerar local" },
  { id: "review", label: "Revisão" },
];

function ContractChargesStepIndicator({ current }: { current: ContractChargesStep }) {
  const index = WIZARD_STEPS.findIndex((s) => s.id === current);

  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between gap-0.5 px-0.5">
        {WIZARD_STEPS.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <View key={step.id} className="flex-1 flex-row items-center">
              <View className="flex-1 items-center min-w-0">
                <View
                  className={`h-7 w-7 rounded-full items-center justify-center ${
                    active ? "bg-brand" : done ? "bg-brand-tint" : "bg-border"
                  }`}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={14} color="var(--ds-brand-hover)" />
                  ) : (
                    <Text
                      className={`text-xs font-semibold ${active ? "text-on-brand" : "text-ink-muted"}`}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  className={`text-[9px] font-semibold mt-1 text-center ${
                    active ? "text-brand" : done ? "text-brand" : "text-ink-subtle"
                  }`}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </View>
              {i < WIZARD_STEPS.length - 1 ? (
                <View
                  className={`h-0.5 flex-1 mb-4 max-w-[12px] ${done ? "bg-brand-tint" : "bg-border"}`}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function OverviewSummaryCards({
  preview,
}: {
  preview: ContractChargesPreview;
}) {
  const importedCount = preview.summary.imported_from_cora_sync_count
    ?? preview.local_invoices.filter((r) => r.imported_from_cora_sync).length;
  const cards = [
    { label: "No sistema", value: preview.summary.local_count, icon: "folder-outline" as const },
    { label: "A gerar", value: preview.summary.to_generate_count, icon: "add-circle-outline" as const },
    {
      label: "Com Cora (app)",
      value: preview.summary.local_with_gateway,
      icon: "cloud-outline" as const,
    },
    { label: "Importadas", value: importedCount, icon: "warning-outline" as const },
  ];

  return (
    <View className="flex-row flex-wrap gap-2">
      {cards.map((card) => (
        <View
          key={card.label}
          className="flex-1 min-w-[100px] rounded-ds-md border border-border bg-surface px-2.5 py-2"
        >
          <View className="flex-row items-center gap-1 mb-0.5">
            <Ionicons name={card.icon} size={12} color="var(--ds-ink-muted)" />
            <Text className="text-[9px] font-semibold uppercase text-ink-muted">{card.label}</Text>
          </View>
          <Text className="text-lg font-semibold text-ink">{card.value}</Text>
        </View>
      ))}
    </View>
  );
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
    <View className="rounded-ds-md border border-warning bg-warning-tint/90 overflow-hidden">
      <View className="px-3 py-2 border-b border-warning">
        <Text className="text-xs font-semibold text-amber-950">Debug cobranças (prod)</Text>
        <Text className="text-[10px] text-warning mt-0.5">
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
            className="px-2 py-1 rounded-ds-md bg-warning-tint border border-warning"
          >
            <Text className="text-[10px] font-semibold text-amber-900">Copiar JSON</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        className="max-h-48 bg-gray-900 mx-2 mb-2 rounded-ds-md"
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
          className="flex-row items-start gap-2 rounded-ds-md bg-warning-tint border border-warning px-3 py-2"
        >
          <Ionicons name="warning-outline" size={15} color="var(--ds-warning)" />
          <Text className="flex-1 text-xs text-warning">{text}</Text>
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
    <View className="rounded-ds-md border border-border bg-surface overflow-hidden">
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
              index < rows.length - 1 ? "border-b border-border" : ""
            } ${selected ? "bg-brand-tint" : disabled ? "opacity-60" : ""}`}
          >
            <TouchableOpacity
              onPress={() => onToggle(row.key)}
              disabled={disabled}
              activeOpacity={0.75}
              style={{ width: 28 }}
            >
              <RowCheckbox checked={selected} disabled={disabled} />
            </TouchableOpacity>
            <Text className="text-[11px] text-ink" style={{ width: 68 }}>
              {fmtDate(row.due_date)}
            </Text>
            <Text className="text-[11px] font-semibold text-ink" style={{ width: 82 }}>
              {fmtMoney(row.amount)}
            </Text>
            <Text className="flex-1 text-[10px] text-ink-muted" numberOfLines={1}>
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
        <Text className="text-[10px] text-ink-muted px-2 py-2">Todas as parcelas já existem ou estão bloqueadas.</Text>
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
  const [step, setStep] = useState<ContractChargesStep>("overview");
  const [purgingImported, setPurgingImported] = useState(false);

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
      data.to_generate
        .filter((row) => !row.disabled && !row.already_exists && row.selected_by_default === true)
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
    setStep("overview");
    loadPreview();
  }, [visible, loadPreview]);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex >= WIZARD_STEPS.length - 1;

  const goNext = () => {
    if (isLastStep) return;
    setError(null);
    setStep(WIZARD_STEPS[stepIndex + 1].id);
  };

  const goBack = () => {
    if (isFirstStep) return;
    setError(null);
    setStep(WIZARD_STEPS[stepIndex - 1].id);
  };

  const selectableGenerate = useMemo(
    () => preview?.to_generate.filter((r) => !r.disabled && !r.already_exists) ?? [],
    [preview]
  );

  const importedInvoices = useMemo(
    () => preview?.local_invoices.filter((r) => r.imported_from_cora_sync) ?? [],
    [preview]
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
  const selectedActionCount = selectedGenerateKeys.length;

  const purgeImported = async () => {
    if (importedInvoices.length === 0) return;
    setPurgingImported(true);
    setError(null);
    try {
      const { message } = await purgeImportedContractCharges(enrollmentId);
      onSuccess(message);
      await loadPreview();
    } catch (e: any) {
      setError(
        e?.response?.data?.message ?? e?.message ?? "Falha ao remover cobranças importadas."
      );
    }
    setPurgingImported(false);
  };

  const submit = async () => {
    if (selectedGenerateKeys.length === 0) {
      setError("Marque ao menos uma parcela para gerar no sistema.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const { message } = await applyContractCharges(enrollmentId, {
        environment,
        generate_keys: selectedGenerateKeys,
      });
      onSuccess(message);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Falha ao processar cobranças.");
    }
    setApplying(false);
  };

  const canGenerate = !preview?.blocked.contract_batch_generated;
  const currentStepMeta = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];

  const renderStepContent = () => {
    if (!preview) return null;

    switch (step) {
      case "overview":
        return (
          <View className="gap-3">
            <Text className="text-xs text-ink-muted leading-5">
              Gere as parcelas no sistema conforme o contrato. Depois, emita boleto/PIX na Cora pela
              ação “gerar cobrança” de cada fatura. Importação de boletos da Cora não é mais usada.
            </Text>
            <OverviewSummaryCards preview={preview} />
            <PreviewAlerts
              warnings={preview.warnings}
              providerError={preview.summary.provider_fetch_error}
            />
            {importedInvoices.length > 0 ? (
              <View className="rounded-ds-md border border-warning bg-warning-tint px-3 py-2.5 gap-2">
                <Text className="text-xs font-semibold text-amber-950">
                  {importedInvoices.length} cobrança(s) importada(s) da Cora nesta matrícula
                </Text>
                <Text className="text-[11px] leading-4 text-amber-900">
                  Remover apaga só o vínculo local. O boleto permanece na conta Cora.
                </Text>
                <TouchableOpacity
                  onPress={purgeImported}
                  disabled={loading || applying || purgingImported}
                  className={`self-start flex-row items-center gap-1.5 px-3 py-1.5 rounded-ds-md ${
                    purgingImported ? "bg-danger opacity-60" : "bg-danger"
                  }`}
                >
                  {purgingImported ? (
                    <ActivityIndicator color="var(--ds-on-danger)" size="small" />
                  ) : (
                    <Ionicons name="trash-outline" size={14} color="var(--ds-on-danger)" />
                  )}
                  <Text className="text-xs font-medium text-on-danger">Remover importadas</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-2.5">
              <Text className="text-xs font-semibold text-ink mb-2">Tipos de cobrança na análise</Text>
              <View className="flex-row flex-wrap gap-1.5">
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
                      disabled={loading || applying || preview.charges_batch_generated}
                      className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-ds-md border ${
                        active ? "bg-surface border-border" : "bg-transparent border-border"
                      }`}
                    >
                      <Ionicons
                        name={active ? "checkmark-circle" : "ellipse-outline"}
                        size={14}
                        color={active ? "var(--ds-brand)" : "var(--ds-ink-subtle)"}
                      />
                      <Text
                        className={`text-[11px] font-semibold ${
                          active ? "text-brand" : "text-ink-muted"
                        }`}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-[10px] text-ink-muted mt-2">
                Alterar os tipos recarrega a análise ao avançar ou usar Atualizar.
              </Text>
            </View>
            {preview.charges_batch_generated ? (
              <View className="flex-row items-start gap-2 rounded-ds-md bg-warning-tint border border-warning px-3 py-2">
                <Ionicons name="lock-closed-outline" size={16} color="var(--ds-warning)" />
                <Text className="flex-1 text-xs text-warning">
                  O lote do contrato já foi gerado. Novas parcelas locais estão bloqueadas; use cobranças
                  avulsas se precisar de parcelas extras.
                </Text>
              </View>
            ) : null}
            {canRequestDebug ? (
              <TouchableOpacity
                onPress={loadDebugPreview}
                disabled={loading || debugLoading || applying}
                className={`self-start flex-row items-center gap-1 px-2.5 py-1.5 rounded-ds-md border border-warning bg-warning-tint ${
                  loading || debugLoading || applying ? "opacity-60" : ""
                }`}
              >
                {debugLoading ? (
                  <ActivityIndicator size="small" color="var(--ds-warning)" />
                ) : (
                  <Ionicons name="bug-outline" size={14} color="var(--ds-warning)" />
                )}
                <Text className="text-[11px] font-semibold text-amber-900">Carregar debug técnico</Text>
              </TouchableOpacity>
            ) : null}
            {debugPayload ? <ContractChargesDebugPanel debug={debugPayload} /> : null}
          </View>
        );

      case "generate":
        return (
          <View className="gap-2">
            <Text className="text-xs text-ink-muted leading-5">
              Crie parcelas no sistema conforme o contrato. Em seguida, emita o boleto na Cora pela
              fatura (gerar cobrança).
            </Text>
            <SectionPanel accent="violet">
              <SectionHeader
                title={`Parcelas (${selectableGenerate.length} disponíveis)`}
                action={
                  canGenerate && selectableGenerate.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-ds-md bg-brand-tint"
                      onPress={() =>
                        toggleAll(
                          selectableGenerate.map((r) => r.key),
                          selectedGenerateKeys.length !== selectableGenerate.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-brand">
                        {selectedGenerateKeys.length === selectableGenerate.length
                          ? "Desmarcar"
                          : "Marcar todas"}
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
            <Text className="text-[10px] text-ink-muted text-center">
              {selectedGenerateKeys.length} parcela(s) marcada(s) para gerar
            </Text>
          </View>
        );

      case "review":
        return (
          <View className="gap-3">
            <Text className="text-xs text-ink-muted leading-5">
              Confira o que será executado. Você pode voltar às etapas anteriores para ajustar a seleção.
            </Text>
            <ExecutionPreviewSummary preview={preview} selectedKeys={selectedKeys} />
            {selectedActionCount === 0 ? (
              <EmptyState
                icon="hand-left-outline"
                title="Nenhuma ação selecionada"
                description="Volte e marque parcelas para gerar no sistema."
              />
            ) : (
              <View className="rounded-ds-md border border-border bg-brand-tint px-3 py-2 flex-row items-center gap-2">
                <Ionicons name="checkmark-done-outline" size={18} color="var(--ds-brand-hover)" />
                <Text className="text-sm font-semibold text-brand">
                  {selectedActionCount} ação(ões) pronta(s) para executar
                </Text>
              </View>
            )}
            {preview.local_invoices.length > 0 ? (
              <SectionPanel>
                <SectionHeader
                  title={`Já no sistema (${preview.local_invoices.length})`}
                  subtitle="Somente consulta — não entra na execução."
                  action={
                    <TouchableOpacity
                      className="px-2 py-1 rounded-ds-md bg-surface-sunken"
                      onPress={() => setShowLocalInvoices((v) => !v)}
                    >
                      <Text className="text-xs font-semibold text-ink">
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
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      title={`Cobranças do contrato · ${currentStepMeta.label}`}
      onClose={applying ? () => undefined : onClose}
      size="xl"
      maxHeight="98%"
      showScrollIndicator
      scrollViewClassName="app-scrollbar py-3"
      footer={
        <>
          {isFirstStep ? (
            <TouchableOpacity
              onPress={onClose}
              disabled={applying}
              className="px-4 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
            >
              <Text className="text-sm font-semibold text-ink">Fechar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={goBack}
              disabled={applying || loading}
              className="flex-row items-center gap-1.5 px-4 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
            >
              <Ionicons name="arrow-back" size={16} color="var(--ds-ink)" />
              <Text className="text-sm font-semibold text-ink">Voltar</Text>
            </TouchableOpacity>
          )}
          {step === "overview" ? (
            <TouchableOpacity
              onPress={loadPreview}
              disabled={loading || applying}
              className={`flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-ds-md border border-border ${
                loading || applying ? "opacity-60" : "bg-surface"
              }`}
            >
              <Ionicons name="refresh-outline" size={16} color="var(--ds-brand-hover)" />
              <Text className="text-sm font-semibold text-brand">Atualizar</Text>
            </TouchableOpacity>
          ) : null}
          {isLastStep ? (
            <TouchableOpacity
              onPress={submit}
              disabled={applying || loading || selectedActionCount === 0}
              className={`flex-row items-center justify-center gap-2 px-5 py-2.5 rounded-ds-md ${
                applying || loading || selectedActionCount === 0 ? "bg-brand-tint" : "bg-brand"
              }`}
            >
              {applying ? (
                <ActivityIndicator color="var(--ds-on-brand)" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="var(--ds-on-brand)" />
                  <Text className="text-sm font-medium text-on-brand">
                    Executar ({selectedActionCount})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={goNext}
              disabled={loading || applying || !preview}
              className={`flex-row items-center justify-center gap-2 px-5 py-2.5 rounded-ds-md ${
                loading || applying || !preview ? "bg-brand-tint" : "bg-brand"
              }`}
            >
              <Text className="text-sm font-medium text-on-brand">Próximo</Text>
              <Ionicons name="arrow-forward" size={16} color="var(--ds-on-brand)" />
            </TouchableOpacity>
          )}
        </>
      }
    >
      <View className="gap-3">
        <View className="flex-row items-center justify-end">
          <Pill
            label={environment === "prod" ? "Produção" : "Homologação"}
            tone={environment === "prod" ? "amber" : "gray"}
          />
        </View>

        {!loading && preview ? (
          <ContractChargesStepIndicator current={step} />
        ) : null}

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
            <Text className="text-xs text-ink-muted mt-2">Consultando sistema e provedor...</Text>
          </View>
        ) : null}

        {!!error && (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-3 py-2">
            <Text className="text-sm text-danger">{error}</Text>
          </View>
        )}

        {preview && !loading ? renderStepContent() : null}
      </View>
    </Modal>
  );
}
