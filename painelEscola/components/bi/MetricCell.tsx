import React from "react";
import { Text, View } from "react-native";
import { fmtMetricDelta, fmtMetricValue } from "./format";
import type { BiMetric } from "../../services/biService";

type Props = {
  metric?: BiMetric;
  unit?: string;
  goodWhen?: "up" | "down";
  width: number;
};

/** Indicador numa célula de tabela: valor e variação (seta + número); sem amostra, "—" com o motivo no rótulo. */
export default function MetricCell({ metric, unit = "", goodWhen = "up", width }: Props) {
  const value = fmtMetricValue(metric);
  const delta = fmtMetricDelta(metric);
  const trend = metric?.trend;
  const good = trend === "stable" ? null : (trend === "up") === (goodWhen === "up");
  const insufficient = !!metric && !metric.sufficient;

  return (
    <View
      style={{ width, alignItems: "flex-end" }}
      aria-label={
        insufficient
          ? `Amostra insuficiente (${metric?.sample.size ?? 0} de ${metric?.min_sample} mínimo)`
          : `${value}${unit}${delta ? `, ${trend === "down" ? "queda" : trend === "up" ? "alta" : "estável"} de ${delta}` : ""}`
      }
    >
      <Text className={`font-mono ${value === "—" ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 13 }}>
        {value === "—" ? "—" : `${value}${unit}`}
      </Text>
      {delta && trend && trend !== "stable" ? (
        <Text className={`font-mono ${good ? "text-success" : "text-danger"}`} style={{ fontSize: 11 }}>
          {`${trend === "up" ? "▲" : "▼"} ${delta}`}
        </Text>
      ) : insufficient ? (
        <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`n=${metric?.sample.size ?? 0}`}</Text>
      ) : null}
    </View>
  );
}
