import { useQuery } from '@tanstack/react-query';
import {
  listarProvasAnteriores,
  type PastExamsListFilters,
} from '../../../services/past-exams.service';
import { provasAnterioresKeys } from '../queryKeys';

export function useProvasAnterioresList(filters?: PastExamsListFilters) {
  const filtersKey = JSON.stringify(filters ?? {});

  return useQuery({
    queryKey: provasAnterioresKeys.list(filtersKey),
    queryFn: () => listarProvasAnteriores(filters),
  });
}
