import { useQuery } from '@tanstack/react-query';
import { detalharProvaAnterior } from '../../../services/past-exams.service';
import { provasAnterioresKeys } from '../queryKeys';

export function useProvaAnteriorDetail(id: number) {
  return useQuery({
    queryKey: provasAnterioresKeys.detail(id),
    queryFn: () => detalharProvaAnterior(id),
    enabled: id > 0,
  });
}
