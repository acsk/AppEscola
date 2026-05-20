import { useQuery } from '@tanstack/react-query';
import { listarSimulados } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

export function useSimuladosList() {
  return useQuery({
    queryKey: simuladosKeys.list(),
    queryFn: listarSimulados,
  });
}
