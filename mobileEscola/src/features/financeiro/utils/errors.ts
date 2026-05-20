export function getFinanceiroErrorMessage(err: unknown, fallback: string): string {
  const error = err as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };

  if (error?.response?.status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }

  if (error?.response?.status === 403) {
    return 'Você não tem permissão para acessar esta informação.';
  }

  return error?.response?.data?.message ?? error?.message ?? fallback;
}
