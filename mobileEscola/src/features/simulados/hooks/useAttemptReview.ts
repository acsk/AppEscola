import { useQuery } from '@tanstack/react-query';
import { buscarRevisao } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

export function useAttemptReview(attemptId: number | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: simuladosKeys.review(attemptId ?? 0),
    queryFn: () => buscarRevisao(attemptId!),
    enabled: enabled && attemptId != null && attemptId > 0,
    retry: false,
  });
}
