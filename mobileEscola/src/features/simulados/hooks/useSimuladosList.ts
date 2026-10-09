import { useQuery } from '@tanstack/react-query';
import { listarSimulados } from '../../../services/simulados.service';
import { isClosed, isDone } from '../lib/examCard';
import { simuladosKeys } from '../queryKeys';

export function useSimuladosList(enabled = true) {
  return useQuery({
    queryKey: simuladosKeys.list(),
    queryFn: () => listarSimulados({ fetchAll: true }),
    enabled,
  });
}

/** Simulados ainda não feitos e dentro do prazo. É o número da pílula no menu. */
export function usePendingSimuladosCount(enabled = true): number {
  const { data } = useSimuladosList(enabled);
  if (!enabled || !data) return 0;
  return data.filter((s) => !isDone(s) && !isClosed(s)).length;
}
