import { useQuery } from '@tanstack/react-query';
import { getPaymentOptionsApi } from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';

export function usePaymentOptions(invoiceId: number, enabled: boolean) {
  return useQuery({
    queryKey: financeiroKeys.paymentOptions(invoiceId),
    queryFn: () => getPaymentOptionsApi(invoiceId),
    enabled: enabled && invoiceId > 0,
  });
}
