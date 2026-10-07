import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function usePracticeRanking(period: RankingPeriod) {
  return useQuery({ queryKey: bancoKeys.ranking(period), queryFn: () => fetchPracticeRanking(period) });
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
  return useMutation({
    mutationFn: ({ questionId, optionId }: { questionId: number; optionId: number }) =>
      answerInPracticeAttempt(attemptId, questionId, optionId),
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
