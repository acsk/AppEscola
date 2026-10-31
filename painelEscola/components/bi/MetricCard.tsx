import React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Icon from "../ui/Icon";
import InfoTip from "./InfoTip";
import { fmtMetricDelta, fmtMetricValue } from "./format";
import { color } from "../../constants/theme";
import type { BiMetric, BiMetricDefinition } from "../../services/biService";

type Props = {
  label: string;
  metric?: BiMetric;
  definition?: BiMetricDefinition;
  /** Unidade exibida ao lado do valor (ex.: "%"). */
  unit?: string;
  /** Quando cair é bom (ex.: alunos que precisam de reforço). */
  goodWhen?: "up" | "down";
  /** Texto abaixo do valor; padrão "vs. período anterior". */
  hint?: string;
  onDrill?: () => void;
};

/**
 * Indicador do BI: valor, variação contra o período anterior (seta + número, a cor nunca é a única pista),
 * explicação do cálculo e, sem amostra mínima, "—" com o motivo — nunca zero.
 */
export default function MetricCard({ label, metric, definition, unit, goodWhen = "up", hint, onDrill }: Props) {
  const insufficient = !!metric && !metric.sufficient;
  const delta = fmtMetricDelta(metric);
  const trend = metric?.trend;
  const good = trend === "up" || trend === "down" ? trend === goodWhen : null;
  const deltaClass = good === null ? "text-ink-subtle" : good ? "text-success" : "text-danger";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "■";
  const reading = good === null ? "estável" : good ? "melhora" : "piora";
  const info = definition
    ? [definition.description, `Cálculo: ${definition.formula}.`, definition.missing]
    : [];
  const footnote = insufficient
    ? `Amostra insuficiente (${metric?.sample.size ?? 0} de ${metric?.min_sample} mín.)`
    : hint ?? "vs. período anterior";

  return (
    <View
      className="bg-surface border border-border rounded-ds-md"
      style={{ padding: 16, gap: 6, minWidth: 0, flex: 1 }}
      aria-label={`${label}: ${fmtMetricValue(metric)}${unit && metric?.value !== null ? unit : ""}${delta ? `, ${reading} de ${delta}` : ""}`}
    >
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
          {label}
        </Text>
        {info.length ? <InfoTip title={label} lines={info} /> : null}
      </View>
      <Text className="font-mono font-semibold text-ink" style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.26 }}>
        {fmtMetricValue(metric)}
        {unit && metric?.value !== null && metric?.value !== undefined ? (
          <Text className="font-mono font-medium text-ink-muted" style={{ fontSize: 14 }}>
            {` ${unit}`}
          </Text>
        ) : null}
      </Text>
      <View className="flex-row items-center flex-wrap" style={{ justifyContent: "space-between", gap: 8 }}>
        {delta ? (
          <Text className={`font-mono font-medium ${deltaClass}`} style={{ fontSize: 12, lineHeight: 16 }}>
            {arrow} {delta}
          </Text>
        ) : (
          <View />
        )}
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1, textAlign: "right" }}>
          {footnote}
        </Text>
      </View>
      {onDrill ? (
        <Pressable onPress={onDrill} accessibilityRole="link" className="flex-row items-center" style={{ gap: 2, marginTop: 2 }}>
          <Text className="font-medium text-brand" style={{ fontSize: 12, lineHeight: 16 }}>
            Detalhar
          </Text>
          <Icon icon={ChevronRight} size={16} color={color.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}
