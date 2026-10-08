export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value == null) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })}%`;
}

const DAY_MS = 86_400_000;
/** Brasília é UTC-3 fixo (sem horário de verão); evita depender do fuso do aparelho e do Intl do Hermes. */
const BRASILIA_OFFSET_MS = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const dayMonth = (ms: number) => {
  const d = new Date(ms - BRASILIA_OFFSET_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
};

/** "05/10 a 11/10" para as semanas do ranking (segunda a domingo); null nos demais períodos. */
export function rankingWeekRange(ranking: { period: string; since: string | null }): string | null {
  if (!ranking.since || (ranking.period !== 'week' && ranking.period !== 'last_week')) return null;
  const start = new Date(ranking.since).getTime();
  return `${dayMonth(start)} a ${dayMonth(start + 6 * DAY_MS)}`;
}
