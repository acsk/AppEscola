import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
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

function ChargeGroup({
  title,
  subtitle,
  rows,
  selectedKeys,
  expandedKeys,
  canGenerate,
  onToggle,
  onToggleExpanded,
}: {
  title: string;
  subtitle: string;
  rows: ContractChargePreviewRow[];
  selectedKeys: Set<string>;
  expandedKeys: Set<string>;
  canGenerate: boolean;
  onToggle: (key: string) => void;
  onToggleExpanded: (key: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <View className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <View className="flex-row items-center justify-between gap-3 bg-gray-50 px-2.5 py-2 border-b border-gray-100">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase text-gray-700">{title}</Text>
          <Text className="text-[10px] text-gray-500 mt-0.5">{subtitle}</Text>
        </View>
        <Pill label={`${rows.length} item${rows.length === 1 ? "" : "s"}`} tone="gray" />
      </View>
      <View className="gap-1.5 p-2">
        {rows.map((row) => (
          <GenerateChargeCard
            key={row.key}
            row={row}
            selected={selectedKeys.has(row.key)}
            expanded={expandedKeys.has(row.key)}
            canGenerate={canGenerate}
            onToggle={onToggle}
            onToggleExpanded={onToggleExpanded}
          />
        ))}
      </View>
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

function GenerateChargeCard({
  row,
  selected,
  expanded,
  canGenerate,
  onToggle,
  onToggleExpanded,
}: {
  row: ContractChargePreviewRow;
  selected: boolean;
  expanded: boolean;
  canGenerate: boolean;
  onToggle: (key: string) => void;
  onToggleExpanded: (key: string) => void;
}) {
  const disabled = row.disabled || row.already_exists || !canGenerate;

  return (
    <View
      className={`w-full rounded-lg border px-2.5 py-2 ${
        selected && !row.already_exists
          ? "border-violet-200 bg-violet-50"
          : row.already_exists
            ? "border-gray-100 bg-gray-50 opacity-70"
            : "border-gray-100 bg-white"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => onToggle(row.key)}
          disabled={disabled}
          activeOpacity={0.75}
        >
          <RowCheckbox checked={selected} disabled={disabled} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onToggleExpanded(row.key)}
          activeOpacity={0.75}
          className="flex-1 flex-row items-center gap-2"
        >
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="flex-1 text-xs font-bold text-gray-900" numberOfLines={1}>
                {row.description ?? "Cobrança"}
              </Text>
              <DueDateBadge date={row.due_date} />
            </View>
            <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
              {fmtMoney(row.amount)}
            </Text>
          </View>
        </TouchableOpacity>
        {row.already_exists ? <Pill label="Já existe" tone="gray" /> : null}
        <TouchableOpacity onPress={() => onToggleExpanded(row.key)} className="p-1">
          <AccordionChevron expanded={expanded} />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View className="mt-2 pt-2 border-t border-gray-100">
          <View className="flex-row flex-wrap gap-1.5">
            <DetailBlock icon="calendar-outline" label="Vencimento" value={fmtDate(row.due_date)} />
            <DetailBlock icon="cash-outline" label="Valor" value={fmtMoney(row.amount)} />
            <DetailBlock
              icon="document-text-outline"
              label="Tipo"
              value={row.type === "monthly" ? "Mensalidade" : row.type === "enrollment_fee" ? "Taxa de matrícula" : "Cobrança"}
            />
            <DetailBlock
              icon="checkmark-done-outline"
              label="Situação"
              value={row.already_exists ? "Já existe no sistema" : disabled ? "Indisponível" : "Pode ser gerada"}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ExternalChargeCard({
  row,
  selected,
  expanded,
  onToggle,
  onToggleExpanded,
}: {
  row: ContractExternalChargeRow;
  selected: boolean;
  expanded: boolean;
  onToggle: (key: string) => void;
  onToggleExpanded: (key: string) => void;
}) {
  const disabled = row.link_status === "linked";

  return (
    <View
      className={`w-full rounded-lg border px-2.5 py-2 ${
        selected
          ? "border-violet-200 bg-violet-50"
          : disabled
            ? "border-gray-100 bg-gray-50 opacity-70"
            : "border-gray-100 bg-white"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => onToggle(row.key)}
          disabled={disabled}
          activeOpacity={0.75}
        >
          <RowCheckbox checked={selected} disabled={disabled} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onToggleExpanded(row.key)}
          activeOpacity={0.75}
          className="flex-1 flex-row items-center gap-2"
        >
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
        </TouchableOpacity>
        <CardBadges>
          <StatusPill status={row.status} />
          <Pill
            label={LINK_STATUS_LABELS[row.link_status] ?? row.link_status}
            tone={LINK_STATUS_TONES[row.link_status] ?? "violet"}
          />
        </CardBadges>
        <TouchableOpacity onPress={() => onToggleExpanded(row.key)} className="p-1">
          <AccordionChevron expanded={expanded} />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View className="mt-2 pt-2 border-t border-gray-100">
          <View className="flex-row flex-wrap gap-1.5">
            <DetailBlock icon="calendar-outline" label="Vencimento" value={fmtDate(row.due_date)} />
            <DetailBlock icon="cash-outline" label="Valor" value={fmtMoney(row.amount)} />
            <DetailBlock icon="pulse-outline" label="Status" value={getStatusDisplay(row.status).label} />
            <DetailBlock
              icon="link-outline"
              label="Vínculo"
              value={LINK_STATUS_LABELS[row.link_status] ?? row.link_status}
            />
            <DetailBlock icon="cloud-outline" label="ID Cora" value={truncateProviderChargeId(row.charge_id)} />
            {row.linked_invoice_id ? (
              <DetailBlock icon="document-text-outline" label="Cobrança local" value={`#${row.linked_invoice_id}`} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const LINK_STATUS_LABELS: Record<string, string> = {
  new: "Importar",
  linked: "Já vinculada",
  updatable: "Atualizar no sistema",
};

const LINK_STATUS_TONES: Record<string, PillTone> = {
  new: "violet",
  linked: "emerald",
  updatable: "blue",
};

export default function ContractChargesModal({
  visible,
  enrollmentId,
  environment,
  onClose,
  onSuccess,
}: Props) {
  const [preview, setPreview] = useState<ContractChargesPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [invoiceTypes, setInvoiceTypes] = useState<string[]>(["monthly"]);

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
        .filter((row) => row.selected_by_default && !row.disabled && !row.already_exists)
        .forEach((row) => defaults.add(row.key));
      data.external_charges
        .filter((row) => row.selected_by_default && row.link_status !== "linked")
        .forEach((row) => defaults.add(row.key));
      setSelectedKeys(defaults);
      setExpandedKeys(new Set());
    } catch (e: any) {
      setPreview(null);
      setError(e?.response?.data?.message ?? e?.message ?? "Não foi possível carregar a análise.");
    }
    setLoading(false);
  }, [enrollmentId, environment, invoiceTypes]);

  useEffect(() => {
    if (!visible) return;
    loadPreview();
  }, [visible, loadPreview]);

  const selectableGenerate = useMemo(
    () => preview?.to_generate.filter((r) => !r.disabled && !r.already_exists) ?? [],
    [preview]
  );

  const selectableSync = useMemo(
    () => preview?.external_charges.filter((r) => r.link_status !== "linked") ?? [],
    [preview]
  );

  const generateGroups = useMemo(() => {
    const rows = preview?.to_generate ?? [];
    const monthly = rows.filter((row) => row.type === "monthly");
    const enrollmentFee = rows.filter((row) => row.type === "enrollment_fee");
    const other = rows.filter((row) => row.type !== "monthly" && row.type !== "enrollment_fee");

    return [
      {
        key: "monthly",
        title: "Mensalidades",
        subtitle: "Parcelas recorrentes do plano contratado.",
        rows: monthly,
      },
      {
        key: "enrollment_fee",
        title: "Taxa de matrícula",
        subtitle: "Cobrança inicial do contrato, quando aplicável.",
        rows: enrollmentFee,
      },
      {
        key: "other",
        title: "Outras cobranças",
        subtitle: "Itens retornados pela análise do contrato.",
        rows: other,
      },
    ].filter((group) => group.rows.length > 0);
  }, [preview]);

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
        <View className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
          <View className="flex-row items-center gap-2.5 px-3 py-2.5">
            <View className="w-8 h-8 rounded-lg bg-white border border-slate-100 items-center justify-center">
              <Ionicons name="receipt-outline" size={17} color="#475569" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-slate-900">Revise antes de executar</Text>
              <Text className="text-[11px] text-slate-600 mt-0.5">
                Gere parcelas no sistema, sincronize boletos da Cora ou execute as duas ações juntas.
              </Text>
            </View>
            <Pill
              label={environment === "prod" ? "Produção" : "Homologação"}
              tone={environment === "prod" ? "amber" : "gray"}
            />
          </View>
        </View>

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
            <View className="flex-row flex-wrap gap-1.5">
              {[
                { label: "No sistema", value: preview.summary.local_count, icon: "albums-outline" },
                { label: "Com Cora", value: preview.summary.local_with_gateway, icon: "cloud-done-outline" },
                { label: "A gerar", value: preview.summary.to_generate_count, icon: "add-circle-outline" },
                { label: "A sincronizar", value: preview.summary.to_sync_count, icon: "sync-outline" },
              ].map((card) => (
                <View
                  key={card.label}
                  className="flex-row items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-2 min-w-[132px] flex-1"
                >
                  <View className="w-7 h-7 rounded-lg bg-gray-50 items-center justify-center">
                    <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={15} color="#6B7280" />
                  </View>
                  <View>
                    <Text className="text-[9px] uppercase text-gray-500 font-semibold">{card.label}</Text>
                    <Text className="text-lg font-bold text-gray-900">{card.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {preview.summary.external_total > 0 ||
            (preview.summary.external_for_enrollment ?? 0) > 0 ? (
              <View className="flex-row items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                <Ionicons name="information-circle-outline" size={16} color="#6D28D9" />
                <Text className="flex-1 text-xs text-violet-900">
                  Provedor (Cora): {preview.summary.external_total} cobrança
                  {preview.summary.external_total === 1 ? "" : "s"} na escola ·{" "}
                  {preview.summary.external_for_enrollment ?? preview.external_charges.length}{" "}
                  sugerida
                  {(preview.summary.external_for_enrollment ?? preview.external_charges.length) === 1
                    ? ""
                    : "s"}{" "}
                  para esta matrícula
                </Text>
              </View>
            ) : null}

            {preview.warnings.map((w, i) => (
              <View
                key={i}
                className="flex-row items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2"
              >
                <Ionicons name="warning-outline" size={16} color="#B45309" />
                <Text className="flex-1 text-xs text-amber-800">{w}</Text>
              </View>
            ))}

            {preview.summary.provider_fetch_error ? (
              <View className="flex-row items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
                <Ionicons name="alert-circle-outline" size={16} color="#C2410C" />
                <Text className="flex-1 text-xs text-orange-800">
                  {preview.summary.provider_fetch_error}
                </Text>
              </View>
            ) : null}

            {/* Local */}
            <SectionPanel>
              <SectionHeader
                title={`Já no sistema (${preview.local_invoices.length})`}
                subtitle="Cobranças que já existem nesta matrícula."
              />
              {preview.local_invoices.length === 0 ? (
                <EmptyState
                  icon="folder-open-outline"
                  title="Nenhuma cobrança local"
                  description="Ainda não há cobrança criada para esta matrícula."
                />
              ) : (
                <LocalInvoicesGrid
                  rows={preview.local_invoices}
                  expandedKeys={expandedKeys}
                  onToggleExpanded={toggleExpanded}
                />
              )}
            </SectionPanel>

            {/* A gerar */}
            <SectionPanel accent="violet">
              <SectionHeader
                title={`Gerar no contrato (${selectableGenerate.length})`}
                subtitle="Selecione as parcelas locais que serão criadas agora."
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
                          ? "Desmarcar todas"
                          : "Marcar todas"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              {preview.to_generate.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  title="Nada a gerar"
                  description="Os tipos selecionados não têm novas parcelas para criação."
                />
              ) : (
                <View className="gap-2">
                  {generateGroups.map((group) => (
                    <ChargeGroup
                      key={group.key}
                      title={group.title}
                      subtitle={group.subtitle}
                      rows={group.rows}
                      selectedKeys={selectedKeys}
                      expandedKeys={expandedKeys}
                      canGenerate={canGenerate}
                      onToggle={toggleKey}
                      onToggleExpanded={toggleExpanded}
                    />
                  ))}
                </View>
              )}
            </SectionPanel>

            {/* Sincronização externa */}
            <SectionPanel accent="emerald">
              <SectionHeader
                title={`No provedor - boletos (${preview.summary.external_for_enrollment ?? preview.external_charges.length})`}
                subtitle={
                  preview.summary.external_total > 0
                    ? `${preview.summary.external_total} cobrança(s) no cadastro da escola na Cora.`
                    : "Boletos sugeridos para esta matrícula."
                }
                action={
                  selectableSync.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-violet-50"
                      onPress={() =>
                        toggleAll(
                          selectableSync.map((r) => r.key),
                          selectedSyncIds.length !== selectableSync.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-violet-700">
                        {selectedSyncSelectableCount === selectableSync.length
                          ? "Desmarcar todas"
                          : "Marcar todas"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              {preview.external_charges.length === 0 ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Nenhum boleto para sincronizar"
                  description="Não há boleto pendente para este aluno no provedor."
                />
              ) : (
                <View className="gap-1.5">
                  {preview.external_charges.map((row) => (
                    <ExternalChargeCard
                      key={row.key}
                      row={row}
                      selected={selectedKeys.has(row.key)}
                      expanded={expandedKeys.has(row.key)}
                      onToggle={toggleKey}
                      onToggleExpanded={toggleExpanded}
                    />
                  ))}
                </View>
              )}
            </SectionPanel>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
