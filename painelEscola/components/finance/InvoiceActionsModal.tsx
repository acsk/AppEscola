import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import { paymentMethodLabel } from "../../utils/paymentMethods";

import type { InvoiceListItem } from "../../types/matriculas";

export type InvoiceActionKey =
  | "settle"
  | "generate_charge"
  | "edit"
  | "cancel"
  | "delete";

type ActionItem = {
  key: InvoiceActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "emerald" | "blue" | "violet" | "orange" | "red" | "gray";
  group: "primary" | "maintenance" | "danger";
  disabled?: boolean;
  disabledReason?: string;
};

type Props = {
  visible: boolean;
  invoice: InvoiceListItem | null;
  canGenerateCharge?: boolean;
  onClose: () => void;
  onSelect: (action: InvoiceActionKey) => void;
};

const toneStyles: Record<ActionItem["tone"], { bg: string; icon: string }> = {
  emerald: { bg: "bg-emerald-50", icon: "#16A34A" },
  blue: { bg: "bg-blue-50", icon: "#2563EB" },
  violet: { bg: "bg-violet-50", icon: "#7C3AED" },
  orange: { bg: "bg-orange-50", icon: "#F97316" },
  red: { bg: "bg-red-50", icon: "#EF4444" },
  gray: { bg: "bg-gray-100", icon: "#9CA3AF" },
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  overdue: "Vencida",
  paid: "Paga",
  cancelled: "Cancelada",
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700" },
  overdue: { bg: "bg-red-50", text: "text-red-700" },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-700" },
};

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

function InfoPill({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "emerald" | "blue" | "amber" | "red";
}) {
  const styles = {
    gray: { bg: "bg-gray-100", text: "text-gray-700" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
    blue: { bg: "bg-blue-50", text: "text-blue-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-700" },
    red: { bg: "bg-red-50", text: "text-red-700" },
  };

  return (
    <View className={`rounded-md px-2 py-1 ${styles[tone].bg}`}>
      <Text className={`text-[10px] uppercase font-semibold ${styles[tone].text}`}>{label}</Text>
      <Text className={`text-[11px] font-bold ${styles[tone].text}`}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10px] uppercase font-bold text-gray-500 tracking-wide mt-0.5 mb-1">
      {children}
    </Text>
  );
}

export default function InvoiceActionsModal({
  visible,
  invoice,
  canGenerateCharge = false,
  onClose,
  onSelect,
}: Props) {
  if (!invoice) return null;

  const isOpen = invoice.status === "pending" || invoice.status === "overdue";
  const canEdit = invoice.can_edit ?? (invoice.status !== "paid" && invoice.status !== "cancelled");
  const canCancel = invoice.can_cancel ?? (invoice.status !== "cancelled" && invoice.status !== "paid");
  const canDelete = invoice.can_delete ?? invoice.status !== "paid";

  const actions: ActionItem[] = [];

  if (isOpen) {
    actions.push({
      key: "settle",
      label: "Registrar baixa manual",
      description:
        invoice.settlement_hint ??
        "Registrar pagamento recebido fora da Cora.",
      icon: "cash-outline",
      tone: "emerald",
      group: "primary",
    });
  }

  actions.push({
    key: "generate_charge",
    label: "Cobrança no provedor (PIX / Boleto)",
    description: canGenerateCharge
      ? invoice.cora?.charge_id
        ? "Consultar PIX, boleto e dados da cobrança."
        : "Gerar PIX ou boleto para esta cobrança."
      : "Indisponível para cobrança paga ou cancelada.",
    icon: "qr-code-outline",
    tone: canGenerateCharge ? "blue" : "gray",
    group: "primary",
    disabled: !canGenerateCharge,
  });

  if (canEdit) {
    actions.push({
      key: "edit",
      label: "Editar cobrança",
      description: "Alterar vencimento, valor, status ou observações.",
      icon: "pencil-outline",
      tone: "violet",
      group: "maintenance",
    });
  }

  if (canCancel) {
    actions.push({
      key: "cancel",
      label: "Cancelar cobrança",
      description: invoice.lifecycle_hint ?? undefined,
      icon: "close-circle-outline",
      tone: "orange",
      group: "danger",
      disabled: !canCancel,
      disabledReason: invoice.cancel_block_reason ?? undefined,
    });
  } else if (invoice.cancel_block_reason) {
    actions.push({
      key: "cancel",
      label: "Cancelar cobrança",
      icon: "close-circle-outline",
      tone: "gray",
      group: "danger",
      disabled: true,
      disabledReason: invoice.cancel_block_reason,
    });
  }

  if (canDelete || invoice.delete_block_reason) {
    actions.push({
      key: "delete",
      label: "Excluir registro",
      description: invoice.delete_block_reason ?? undefined,
      icon: "trash-outline",
      tone: canDelete ? "red" : "gray",
      group: "danger",
      disabled: !canDelete,
      disabledReason: invoice.delete_block_reason ?? undefined,
    });
  }

  const statusStyle = statusStyles[invoice.status] ?? statusStyles.pending;
  const groups = [
    {
      key: "primary",
      title: "Ações principais",
      items: actions.filter((action) => action.group === "primary"),
    },
    {
      key: "maintenance",
      title: "Manutenção",
      items: actions.filter((action) => action.group === "maintenance"),
    },
    {
      key: "danger",
      title: "Alterações sensíveis",
      items: actions.filter((action) => action.group === "danger"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Modal visible={visible} title="Ações da cobrança" onClose={onClose} size="md">
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 mb-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
              {invoice.description}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
              {fmtMoney(invoice.amount)} · {fmtDate(invoice.due_date)}
              {invoice.student?.name ? ` · ${invoice.student.name}` : ""}
            </Text>
          </View>
          <View className={`rounded-full px-2 py-0.5 ${statusStyle.bg}`}>
            <Text className={`text-[11px] font-bold ${statusStyle.text}`}>
              {statusLabels[invoice.status] ?? invoice.status}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {invoice.payment_method ? (
            <InfoPill label="Forma" value={paymentMethodLabel(invoice.payment_method)} />
          ) : null}
          <InfoPill
            label="Provedor"
            value={invoice.cora?.charge_id ? "Com Cora" : "Local"}
            tone={invoice.cora?.charge_id ? "blue" : "gray"}
          />
        </View>
      </View>

      <View className="gap-2">
        {groups.map((group) => (
          <View key={group.key}>
            <SectionTitle>{group.title}</SectionTitle>
            <View className="gap-1.5">
              {group.items.map((action) => {
                const style = toneStyles[action.tone];
                const disabled = action.disabled === true;

                return (
                  <TouchableOpacity
                    key={action.key}
                    disabled={disabled}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(action.key);
                      onClose();
                    }}
                    className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2 ${
                      disabled
                        ? "border-gray-100 bg-gray-50 opacity-60"
                        : action.group === "danger"
                          ? "border-red-100 bg-white"
                          : "border-gray-100 bg-white"
                    }`}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-lg items-center justify-center ${style.bg}`}>
                      <Ionicons name={action.icon} size={17} color={style.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
                        {action.label}
                      </Text>
                      {(action.description || action.disabledReason) && (
                        <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                          {action.disabledReason ?? action.description}
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={disabled ? "lock-closed-outline" : "chevron-forward-outline"}
                      size={16}
                      color={disabled ? "#CBD5E1" : "#9CA3AF"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Modal>
  );
}
