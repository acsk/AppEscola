import { QueryClient } from '@tanstack/react-query';
import type {
  Cobranca,
  CobrancasResponse,
  GenerateChargeResponse,
} from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';

function mapCobrancas(
  prev: CobrancasResponse,
  invoiceId: number,
  updater: (cobranca: Cobranca) => Cobranca,
): CobrancasResponse {
  const atualizar = (cobranca: Cobranca): Cobranca =>
    cobranca.id === invoiceId ? updater(cobranca) : cobranca;

  return {
    ...prev,
    atual: prev.atual ? atualizar(prev.atual) : null,
    abertas: prev.abertas.map(atualizar),
    atrasados: prev.atrasados.map(atualizar),
    pagas: prev.pagas.map(atualizar),
  };
}

export function patchCobrancaInCache(
  queryClient: QueryClient,
  invoiceId: number,
  updater: (cobranca: Cobranca) => Cobranca,
) {
  queryClient.setQueryData<CobrancasResponse>(financeiroKeys.cobrancas(), (prev) => {
    if (!prev) return prev;
    return mapCobrancas(prev, invoiceId, updater);
  });
}

export function patchCobrancaFromChargeResult(
  queryClient: QueryClient,
  invoiceId: number,
  result: GenerateChargeResponse,
) {
  patchCobrancaInCache(queryClient, invoiceId, (cobranca) => ({
    ...cobranca,
    status: result.status,
    payment_method: result.method,
    boleto_number: result.payment_assets.boleto_number,
    boleto_digitable: result.payment_assets.boleto_digitable,
    payment_url: result.payment_assets.boleto_url,
    pix_copy_paste: result.payment_assets.pix_copy_paste,
    pix_qr_image_url: result.payment_assets.pix_qr_image_url,
  }));
}

export function patchCobrancaFromInvoice(
  queryClient: QueryClient,
  updatedInvoice: Cobranca,
) {
  patchCobrancaInCache(queryClient, updatedInvoice.id, () => updatedInvoice);
}
