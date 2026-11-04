import React from "react";
import { Pressable, Text, View } from "react-native";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type { InvoiceSituation, InvoiceSituationTotals } from "../../services/invoices";

const ITEMS: { key: InvoiceSituation; label: (days: number) => string; marker: string }[] = [
  { key: "open", label: () => "Em aberto", marker: color["ink-muted"] },
  { key: "overdue", label: () => "Vencidas", marker: color.danger },
  { key: "due_soon", label: (days) => `A vencer em ${days} dias`, marker: color.warning },
  { key: "paid", label: () => "Pagas", marker: color.success },
  { key: "cancelled", label: () => "Canceladas", marker: color["ink-subtle"] },
];

const money = (value?: string) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  totals: InvoiceSituationTotals | null;
  value: InvoiceSituation;
  onChange: (situation: InvoiceSituation) => void;
};

/** Faixa de situações das Contas a receber: cada item filtra a lista; o selecionado ganha fundo e sublinhado. */
export default function SituationStrip({ totals, value, onChange }: Props) {
  const { isMobile } = useResponsiveLayout();
  const days = totals?.due_soon_days ?? 7;

  return (
    <View
      className="bg-surface border border-border rounded-ds-md flex-row flex-wrap overflow-hidden"
      role="tablist"
      aria-label="Situação das cobranças"
    >
      {ITEMS.map((item, index) => {
        const selected = item.key === value;
        const data = totals?.situations[item.key];
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            role="tab"
            aria-selected={selected}
            className={selected ? "bg-brand-tint" : ""}
            style={{
              flexGrow: 1,
              flexBasis: isMobile ? "50%" : 0,
              minWidth: isMobile ? "50%" : 150,
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 2,
              borderLeftWidth: index > 0 && !isMobile ? 1 : 0,
              borderColor: color.border,
              borderBottomWidth: 3,
              borderBottomColor: selected ? color.brand : "transparent",
            }}
          >
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <View style={{ width: 8, height: 8, backgroundColor: item.marker }} />
              <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                {item.label(days)}
              </Text>
            </View>
            <Text className="font-mono font-semibold text-ink" style={{ fontSize: 22, lineHeight: 28 }}>
              {data ? data.count : "—"}
            </Text>
            <Text className="font-mono text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
              {data ? money(data.amount) : " "}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
