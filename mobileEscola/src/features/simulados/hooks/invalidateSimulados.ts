import { QueryClient } from '@tanstack/react-query';
import { simuladosKeys } from '../queryKeys';

interface InvalidateSimuladosOptions {
  examId?: number;
  attemptId?: number;
}

export function invalidateSimuladosQueries(
  queryClient: QueryClient,
  options?: InvalidateSimuladosOptions | number,
) {
  const resolved =
    typeof options === 'number' ? { examId: options } : (options ?? {});

  queryClient.invalidateQueries({ queryKey: simuladosKeys.all });

  if (resolved.examId != null) {
    queryClient.invalidateQueries({ queryKey: simuladosKeys.detail(resolved.examId) });
  }

  if (resolved.attemptId != null) {
    queryClient.invalidateQueries({ queryKey: simuladosKeys.attempt(resolved.attemptId) });
    queryClient.invalidateQueries({ queryKey: simuladosKeys.review(resolved.attemptId) });
  }
}
