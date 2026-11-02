import type { BiMetric } from "../../services/biService";

/** Número em pt-BR com casas fixas: 1234.5 → "1.234,5". */
export const fmtNumber = (value: number, decimals = 1) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Valor do indicador: percentual com 1 casa, contagem inteira; sem amostra vira "—". */
export const fmtMetricValue = (metric: BiMetric | undefined) => {
  if (!metric || metric.value === null) return "—";
  return metric.unit === "pct" ? fmtNumber(metric.value, 1) : fmtNumber(metric.value, 0);
};

/** Variação sem sinal (a seta indica a direção): "4,1 pp", "12%", "3". */
export const fmtMetricDelta = (metric: BiMetric | undefined) => {
  if (!metric || metric.delta === null) return null;
  const abs = Math.abs(metric.delta);
  if (metric.delta_unit === "pp") return `${fmtNumber(abs, 1)} pp`;
  if (metric.delta_unit === "pts") return `${fmtNumber(abs, 0)} pts`;
  if (metric.unit === "count" && metric.previous !== null && metric.value !== null) {
    return fmtNumber(Math.abs(metric.value - metric.previous), 0);
  }
  return `${fmtNumber(abs, 0)}%`;
};

/** "2026-10-31T07:00:00-03:00" → "31/10 às 07:00". */
export const fmtUpdatedAt = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** "2026-09-01" → "01/09/2026". */
export const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
};
