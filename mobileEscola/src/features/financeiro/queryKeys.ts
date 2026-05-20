export const financeiroKeys = {
  all: ['financeiro'] as const,
  cobrancas: () => [...financeiroKeys.all, 'cobrancas'] as const,
  paymentOptions: (invoiceId: number) =>
    [...financeiroKeys.all, 'payment-options', invoiceId] as const,
};
