import React from "react";
import { Text, View } from "react-native";
import InfoTip from "../bi/InfoTip";
import { color } from "../../constants/theme";
import { fmtMoney } from "./format";

type KpiProps = {
  label: string;
  value: string;
  /** Linha de apoio abaixo do valor (ex.: "3 cobranças"). */
  footnote?: string;
  /** Comparação com o período anterior; a seta e o texto indicam a direção, a cor nunca é a única pista. */
  delta?: { text: string; trend: "up" | "down" | "flat"; goodWhen: "up" | "down" } | null;
  info?: string[];
  tone?: "default" | "danger" | "muted";
};

/** Indicador financeiro no mesmo formato do MetricCard do BI. */
export function FinanceKpiCard({ label, value, footnote, delta, info, tone = "default" }: KpiProps) {
  const good = delta && delta.trend !== "flat" ? delta.trend === delta.goodWhen : null;
  const deltaClass = good === null ? "text-ink-subtle" : good ? "text-success" : "text-danger";
  const arrow = delta?.trend === "up" ? "▲" : delta?.trend === "down" ? "▼" : "■";
  const valueClass = tone === "danger" ? "text-danger" : tone === "muted" ? "text-ink-subtle" : "text-ink";

  return (
    <View
      className="bg-surface border border-border rounded-ds-md"
      style={{ padding: 16, gap: 6, minWidth: 0, flex: 1 }}
      aria-label={`${label}: ${value}${delta ? `, ${arrow} ${delta.text}` : ""}`}
    >
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
          {label}
        </Text>
        {info?.length ? <InfoTip title={label} lines={info} /> : null}
      </View>
      <Text className={`font-mono font-semibold ${valueClass}`} style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.24 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View className="flex-row items-center flex-wrap" style={{ justifyContent: "space-between", gap: 8 }}>
        {delta ? (
          <Text className={`font-mono font-medium ${deltaClass}`} style={{ fontSize: 12, lineHeight: 16 }}>
            {arrow} {delta.text}
          </Text>
        ) : (
          <View />
        )}
        {footnote ? (
          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1, textAlign: "right" }}>
            {footnote}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type MoneyBarItem = { key: string; label: string; amount: number; count: number };

/** Barras horizontais em R$, proporcionais ao maior item, com valor e participação no total. */
export function MoneyBars({ items, barColor = color["data-1"] }: { items: MoneyBarItem[]; barColor?: string }) {
  const max = Math.max(0, ...items.map((i) => i.amount));
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <View style={{ gap: 14 }}>
      {items.map((item) => {
        const share = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return (
          <View key={item.key} style={{ gap: 6 }} aria-label={`${item.label}: ${fmtMoney(item.amount)}, ${item.count} cobranças, ${share}% do total`}>
            <View className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
              <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18, flexShrink: 1 }} numberOfLines={1}>
                {item.label}
              </Text>
              <Text className="font-mono font-medium text-ink" style={{ fontSize: 12, lineHeight: 16 }}>
                {fmtMoney(item.amount)}
                <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`  ${share}%`}</Text>
              </Text>
            </View>
            <View className="bg-surface-sunken" style={{ height: 10, borderRadius: 2 }}>
              <View style={{ height: 10, width: `${max > 0 ? (item.amount / max) * 100 : 0}%`, backgroundColor: barColor, borderRadius: 2 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

type MonthlyPoint = { key: string; label: string; expected: number; received: number };

/** Colunas agrupadas por mês: previsto (vencimento) × recebido (data de pagamento). */
export function MonthlyColumns({ points, height = 200 }: { points: MonthlyPoint[]; height?: number }) {
  const max = Math.max(0, ...points.flatMap((p) => [p.expected, p.received]));
  const scale = (v: number) => (max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * height) : 0);
  const series = [
    { key: "expected", name: "Previsto", color: color["data-2"] },
    { key: "received", name: "Recebido", color: color["data-1"] },
  ] as const;

  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        {series.map((s) => (
          <View key={s.key} className="flex-row items-center" style={{ gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color }} />
            <Text className="text-ink-muted" style={{ fontSize: 12 }}>{s.name}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row border-b border-border" style={{ height, alignItems: "flex-end", gap: 8 }}>
        {points.map((p) => (
          <View
            key={p.key}
            className="flex-row"
            style={{ flex: 1, justifyContent: "center", alignItems: "flex-end", gap: 3 }}
            aria-label={`${p.label}: previsto ${fmtMoney(p.expected)}, recebido ${fmtMoney(p.received)}`}
          >
            {series.map((s) => (
              <View key={s.key} style={{ width: "34%", maxWidth: 22, height: scale(p[s.key]), backgroundColor: s.color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            ))}
          </View>
        ))}
      </View>
      <View className="flex-row" style={{ gap: 8 }}>
        {points.map((p) => (
          <View key={p.key} style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
            <Text className="text-ink-muted" style={{ fontSize: 11 }} numberOfLines={1}>{p.label}</Text>
            <Text className="font-mono text-ink-subtle" style={{ fontSize: 10 }} numberOfLines={1}>{fmtMoneyShort(p.received)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** "12345.6" → "12,3 mil" para rótulos estreitos. */
const fmtMoneyShort = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : v >= 1_000
    ? `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
