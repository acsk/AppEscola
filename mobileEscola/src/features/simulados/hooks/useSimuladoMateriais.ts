import { useQuery } from '@tanstack/react-query';
import { listarMateriaisApoio } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

export function useSimuladoMateriais(examId: number) {
  return useQuery({
    queryKey: simuladosKeys.materiais(examId),
    queryFn: () => listarMateriaisApoio(examId),
    enabled: examId > 0,
  });
}
