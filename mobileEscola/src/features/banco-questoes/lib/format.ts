export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value == null) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })}%`;
}
