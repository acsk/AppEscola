import type {
  GenerateChargeResponse,
  PaymentMethod,
  PaymentOptionsResponse,
} from '../../../services/financeiro.service';

export function normalizarMetodoPagamento(method: string | null | undefined): PaymentMethod | null {
  if (!method) return null;

  const normalized = method.toLowerCase();
  if (normalized === 'pix') return 'pix';
  if (normalized === 'boleto' || normalized === 'bank_slip') return 'boleto';

  return null;
}

export function rotuloMetodoPagamento(method: string | null | undefined): string {
  const normalized = normalizarMetodoPagamento(method);
  if (normalized === 'pix') return 'PIX';
  if (normalized === 'boleto') return 'Boleto';

  return method ? String(method).toUpperCase() : 'Não definido';
}

export function textoLockMetodo(reason: string | null | undefined): string {
  if (!reason) {
    return 'O método de pagamento desta cobrança não pode ser alterado.';
  }

  if (reason === 'synced_charge_method_lock') {
    return 'O método de pagamento desta cobrança está bloqueado.';
  }

  return reason;
}

export function statusEhPago(status: string): boolean {
  return status.toLowerCase() === 'paid';
}

export function formatarStatusCobranca(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'pending') return 'Aguardando';
  if (normalized === 'paid') return 'Paga';
  if (normalized === 'overdue') return 'Atrasada';
  if (normalized === 'canceled' || normalized === 'cancelled') return 'Cancelada';
  return status;
}

export function obterTemaModalStatus(status: string) {
  if (statusEhPago(status)) {
    return {
      indicadorIcone: 'checkmark-circle',
      indicadorTexto: 'Pagamento confirmado',
    };
  }

  return {
    indicadorIcone: 'alert-circle',
    indicadorTexto: 'Aguardando pagamento',
  };
}

export function obterEstiloBadgeStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'pending') {
    return { badge: 'pendente' as const };
  }
  if (normalized === 'paid') {
    return { badge: 'paga' as const };
  }
  if (normalized === 'overdue') {
    return { badge: 'atrasada' as const };
  }
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return { badge: 'cancelada' as const };
  }

  return { badge: 'default' as const };
}

export function criarResultadoDeOpcoes(options: PaymentOptionsResponse): GenerateChargeResponse | null {
  const temAssets = Boolean(
    options.payment_assets.boleto_digitable ||
      options.payment_assets.boleto_number ||
      options.payment_assets.boleto_url ||
      options.payment_assets.pix_copy_paste ||
      options.payment_assets.pix_qr_image_url,
  );

  if (!temAssets && options.actions.can_generate_charge !== false) return null;
  if (!temAssets) return null;

  const metodo =
    normalizarMetodoPagamento(options.method_lock?.method ?? options.current_method) ?? 'boleto';

  return {
    invoice_id: options.invoice.id,
    method: metodo,
    status: options.invoice.status,
    charge_id: null,
    reused_existing_charge: true,
    payment_assets: options.payment_assets,
    actions: options.actions,
  };
}
