import type { RankingCriterion, RankingPeriod } from '../../services/practice.service';

export const bancoKeys = {
  all: ['banco-questoes'] as const,
  filters: () => [...bancoKeys.all, 'filters'] as const,
  summary: () => [...bancoKeys.all, 'summary'] as const,
  performance: () => [...bancoKeys.all, 'performance'] as const,
  ranking: (period: RankingPeriod, criterion: RankingCriterion = 'participation', subjectId: number | null = null, topicId: number | null = null, page = 1, courseId: number | null = null, perPage = 20) =>
    [...bancoKeys.all, 'ranking', period, criterion, subjectId, topicId, page, courseId, perPage] as const,
  sets: () => [...bancoKeys.all, 'sets'] as const,
  attempt: (attemptId: number) => [...bancoKeys.all, 'attempt', attemptId] as const,
  catalog: (filters: unknown, sort: string) => [...bancoKeys.all, 'catalog', filters, sort] as const,
  facets: (filters: unknown) => [...bancoKeys.all, 'facets', filters] as const,
  learning: () => [...bancoKeys.all, 'learning'] as const,
};
