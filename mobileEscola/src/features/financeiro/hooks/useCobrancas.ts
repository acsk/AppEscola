import { useQuery } from '@tanstack/react-query';
import { getCobrancasApi } from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';

export function useCobrancas() {
  return useQuery({
    queryKey: financeiroKeys.cobrancas(),
    queryFn: getCobrancasApi,
  });
}
