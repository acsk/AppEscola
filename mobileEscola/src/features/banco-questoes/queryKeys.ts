import type { RankingPeriod } from '../../services/practice.service';

export const bancoKeys = {
  all: ['banco-questoes'] as const,
  filters: () => [...bancoKeys.all, 'filters'] as const,
  summary: () => [...bancoKeys.all, 'summary'] as const,
  performance: () => [...bancoKeys.all, 'performance'] as const,
  ranking: (period: RankingPeriod) => [...bancoKeys.all, 'ranking', period] as const,
  sets: () => [...bancoKeys.all, 'sets'] as const,
  attempt: (attemptId: number) => [...bancoKeys.all, 'attempt', attemptId] as const,
};
