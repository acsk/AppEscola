import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import {
  listarProvasAnteriores,
  type PastExamsListFilters,
} from '../../../services/past-exams.service';
import { provasAnterioresKeys } from '../queryKeys';

export function useProvasAnterioresList(filters?: PastExamsListFilters) {
  const { user } = useAuth();
  const filtersKey = JSON.stringify(filters ?? {});
  const isAluno = user?.role === 'aluno';

  return useQuery({
    queryKey: provasAnterioresKeys.list(filtersKey),
    queryFn: () => listarProvasAnteriores(filters),
    enabled: isAluno,
  });
}
