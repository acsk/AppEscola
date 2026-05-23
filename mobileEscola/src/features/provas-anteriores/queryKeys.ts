export const provasAnterioresKeys = {
  all: ['provas-anteriores'] as const,
  list: (filtersKey: string) => [...provasAnterioresKeys.all, 'list', filtersKey] as const,
  detail: (id: number) => [...provasAnterioresKeys.all, 'detail', id] as const,
};
