import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPaymentOptionsWithMessageApi } from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';
import { patchCobrancaFromInvoice } from '../utils/cobrancaCache';

export function useCheckPaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: number) => getPaymentOptionsWithMessageApi(invoiceId),
    onSuccess: (response, invoiceId) => {
      const options = response.body!;
      queryClient.setQueryData(financeiroKeys.paymentOptions(invoiceId), options);
      patchCobrancaFromInvoice(queryClient, options.invoice);
    },
  });
}
