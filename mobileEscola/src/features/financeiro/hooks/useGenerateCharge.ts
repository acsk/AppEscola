import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateChargeApi,
  getPaymentOptionsApi,
  PaymentMethod,
} from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';
import { patchCobrancaFromChargeResult } from '../utils/cobrancaCache';

interface GenerateChargeVariables {
  invoiceId: number;
  method: PaymentMethod;
}

export function useGenerateCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, method }: GenerateChargeVariables) => {
      const result = await generateChargeApi(invoiceId, method);
      let finalResult = result;
      const temPixNoResult = Boolean(
        result.payment_assets.pix_copy_paste || result.payment_assets.pix_qr_image_url,
      );

      if (!temPixNoResult) {
        try {
          const options = await getPaymentOptionsApi(invoiceId);
          const temPixNasOptions = Boolean(
            options.payment_assets.pix_copy_paste || options.payment_assets.pix_qr_image_url,
          );
          if (temPixNasOptions) {
            finalResult = {
              ...result,
              payment_assets: {
                ...result.payment_assets,
                pix_copy_paste: options.payment_assets.pix_copy_paste,
                pix_qr_image_url: options.payment_assets.pix_qr_image_url,
              },
              actions: options.actions,
            };
          }
          queryClient.setQueryData(financeiroKeys.paymentOptions(invoiceId), options);
        } catch {
          // mantém apenas o retorno do generate-charge
        }
      }

      patchCobrancaFromChargeResult(queryClient, invoiceId, finalResult);
      return finalResult;
    },
  });
}
