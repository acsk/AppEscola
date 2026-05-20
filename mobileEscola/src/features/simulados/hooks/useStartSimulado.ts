import { useMutation, useQueryClient } from '@tanstack/react-query';
import { iniciarSimulado } from '../../../services/simulados.service';
import { simuladosKeys } from '../queryKeys';

interface StartSimuladoVariables {
  examId: number;
  studentId?: number;
}

export function useStartSimulado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ examId, studentId }: StartSimuladoVariables) =>
      iniciarSimulado(examId, studentId),
    onSuccess: (_attempt, { examId }) => {
      queryClient.invalidateQueries({ queryKey: simuladosKeys.list() });
      queryClient.invalidateQueries({ queryKey: simuladosKeys.detail(examId) });
    },
  });
}
