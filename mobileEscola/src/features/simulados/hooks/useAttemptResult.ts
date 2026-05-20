import { useQuery } from '@tanstack/react-query';
import { buscarTentativaDetalhada } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

export function useAttemptResult(attemptId: number) {
  return useQuery({
    queryKey: simuladosKeys.attempt(attemptId),
    queryFn: () => buscarTentativaDetalhada(attemptId),
    enabled: attemptId > 0,
  });
}
