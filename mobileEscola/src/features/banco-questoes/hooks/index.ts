import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  answerInPracticeAttempt,
  answerPracticeQuestion,
  fetchPracticeAttempt,
  fetchPracticeFilters,
  fetchPracticePerformance,
  fetchPracticeRanking,
  fetchPracticeSummary,
  fetchQuestionSets,
  finishPracticeAttempt,
  startQuestionSet,
  type RankingPeriod,
  type RankingQuery,
  type CatalogFilters,
  type SessionOptions,
  fetchPracticeQuestions,
  fetchPracticeFacets,
  setQuestionSaved,
  startPracticeSession,
  fetchLearningOverview,
  fetchLearningTopics,
  fetchLearningRecommendations,
  fetchLearningEvolution,
  startLearningReinforcement,
} from '../../../services/practice.service';
import { bancoKeys } from '../queryKeys';

export function usePracticeFilters() {
  return useQuery({ queryKey: bancoKeys.filters(), queryFn: fetchPracticeFilters, staleTime: 5 * 60_000 });
}

export function usePracticeSummary() {
  return useQuery({ queryKey: bancoKeys.summary(), queryFn: fetchPracticeSummary });
}

export function usePracticePerformance() {
  return useQuery({ queryKey: bancoKeys.performance(), queryFn: fetchPracticePerformance });
}

export function usePracticeRanking(period: RankingPeriod, extra?: Omit<RankingQuery, 'period'>) {
  const criterion = extra?.criterion ?? 'participation';
  const subjectId = extra?.subjectId ?? null;
  const topicId = extra?.topicId ?? null;
  const page = extra?.page ?? 1;
  const courseId = extra?.courseId ?? null;
  return useQuery({
    queryKey: bancoKeys.ranking(period, criterion, subjectId, topicId, page, courseId),
    queryFn: () => fetchPracticeRanking({ period, criterion, subjectId, topicId, page, perPage: extra?.perPage, courseId }),
    refetchInterval: 10 * 60_000,
  });
}

export function useQuestionSets() {
  return useQuery({ queryKey: bancoKeys.sets(), queryFn: fetchQuestionSets });
}

export function usePracticeAttempt(attemptId: number | null) {
  return useQuery({
    queryKey: bancoKeys.attempt(attemptId ?? 0),
    queryFn: () => fetchPracticeAttempt(attemptId as number),
    enabled: attemptId != null,
  });
}

/** Resposta avulsa: muda resumo, desempenho e ranking. */
export function useAnswerPracticeQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, optionId }: { questionId: number; optionId: number }) =>
      answerPracticeQuestion(questionId, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bancoKeys.summary() });
      queryClient.invalidateQueries({ queryKey: bancoKeys.performance() });
      queryClient.invalidateQueries({ queryKey: [...bancoKeys.all, 'ranking'] });
    },
  });
}

export function useStartQuestionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: number) => startQuestionSet(setId),
    onSuccess: (payload) => {
      queryClient.setQueryData(bancoKeys.attempt(payload.attempt.id), payload);
      queryClient.invalidateQueries({ queryKey: bancoKeys.sets() });
    },
  });
}

export function useAnswerInAttempt(attemptId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, optionId }: { questionId: number; optionId: number }) =>
      answerInPracticeAttempt(attemptId, questionId, optionId),
    // Com a correção na hora, recarrega a sessão ("Seu acerto no assunto" e afins).
    onSuccess: (res) => { if (res.feedback) queryClient.invalidateQueries({ queryKey: bancoKeys.attempt(attemptId) }); },
  });
}

export function useFinishAttempt(attemptId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => finishPracticeAttempt(attemptId),
    onSuccess: (payload) => {
      queryClient.setQueryData(bancoKeys.attempt(attemptId), payload);
      queryClient.invalidateQueries({ queryKey: bancoKeys.sets() });
      queryClient.invalidateQueries({ queryKey: bancoKeys.summary() });
      queryClient.invalidateQueries({ queryKey: bancoKeys.performance() });
      queryClient.invalidateQueries({ queryKey: [...bancoKeys.all, 'ranking'] });
    },
  });
}


/** Lista do catálogo, 20 por página ("Ver mais questões"). */
export function usePracticeCatalog(filters: CatalogFilters, sort: 'recent' | 'oldest' = 'recent') {
  return useInfiniteQuery({
    queryKey: bancoKeys.catalog(filters, sort),
    queryFn: ({ pageParam }) => fetchPracticeQuestions(filters, pageParam, sort),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.last_page ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** Quantas questões cada opção de filtro traz com os demais aplicados. */
export function usePracticeFacets(filters: CatalogFilters) {
  return useQuery({ queryKey: bancoKeys.facets(filters), queryFn: () => fetchPracticeFacets(filters), placeholderData: keepPreviousData });
}

/** Questões novas para o aluno (número azul na aba Questões e na SideNav). */
export function useNewQuestionsCount(enabled = true): number {
  const { data } = useQuery({
    queryKey: bancoKeys.facets({ situation: 'all' }),
    queryFn: () => fetchPracticeFacets({ situation: 'all' }),
    enabled,
    staleTime: 60_000,
  });
  return enabled ? (data?.situations.new ?? 0) : 0;
}

export function useToggleSavedQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, saved }: { questionId: number; saved: boolean }) => setQuestionSaved(questionId, saved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...bancoKeys.all, 'catalog'] });
      queryClient.invalidateQueries({ queryKey: [...bancoKeys.all, 'facets'] });
    },
  });
}

export function useLearning() {
  const overview = useQuery({ queryKey: [...bancoKeys.learning(), 'overview'], queryFn: fetchLearningOverview });
  const topics = useQuery({ queryKey: [...bancoKeys.learning(), 'topics'], queryFn: fetchLearningTopics });
  const plans = useQuery({ queryKey: [...bancoKeys.learning(), 'plans'], queryFn: fetchLearningRecommendations });
  const evolution = useQuery({ queryKey: [...bancoKeys.learning(), 'evolution'], queryFn: fetchLearningEvolution });
  const refetch = () => Promise.all([overview.refetch(), topics.refetch(), plans.refetch(), evolution.refetch()]);
  return { overview, topics, plans, evolution, refetch, isLoading: overview.isLoading || topics.isLoading, isError: overview.isError || topics.isError };
}

export function useStartReinforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topicId: number) => startLearningReinforcement(topicId),
    onSuccess: (payload) => {
      queryClient.setQueryData(bancoKeys.attempt(payload.attempt.id), payload);
    },
  });
}

export function useStartPracticeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filters, options }: { filters: CatalogFilters; options: SessionOptions }) => startPracticeSession(filters, options),
    onSuccess: (payload) => {
      queryClient.setQueryData(bancoKeys.attempt(payload.attempt.id), payload);
      queryClient.invalidateQueries({ queryKey: bancoKeys.summary() });
    },
  });
}
