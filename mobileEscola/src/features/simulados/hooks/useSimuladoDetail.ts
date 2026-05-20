import { useQuery } from '@tanstack/react-query';
import { detalharSimulado } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

export function useSimuladoDetail(examId: number) {
  return useQuery({
    queryKey: simuladosKeys.detail(examId),
    queryFn: () => detalharSimulado(examId),
    enabled: examId > 0,
  });
}
