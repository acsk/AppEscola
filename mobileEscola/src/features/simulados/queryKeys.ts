export const simuladosKeys = {
  all: ['simulados'] as const,
  list: () => [...simuladosKeys.all, 'list'] as const,
  detail: (examId: number) => [...simuladosKeys.all, 'detail', examId] as const,
  materiais: (examId: number) => [...simuladosKeys.all, 'materiais', examId] as const,
  review: (attemptId: number) => [...simuladosKeys.all, 'review', attemptId] as const,
  attempt: (attemptId: number) => [...simuladosKeys.all, 'attempt', attemptId] as const,
};
