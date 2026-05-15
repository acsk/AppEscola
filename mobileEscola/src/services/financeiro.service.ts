import { api } from './api';

export interface Cobranca {
  id: number;
  enrollment_id: number;
  description: string;
  amount: string;
  due_date: string;
  status: string;
  payment_method: string | null;
  boleto_number: string | null;
  boleto_digitable: string | null;
  payment_url: string | null;
  pix_copy_paste: string | null;
  pix_qr_image_url: string | null;
  is_overdue: boolean;
}

export interface Referencia {
  hoje: string;
  inicio_mes: string;
  fim_mes: string;
}

export interface Resumo {
  quantidade_pagas: number;
  quantidade_atrasados: number;
  possui_atual: boolean;
  valor_total_pagas: string;
  valor_total_atrasados: string;
  valor_atual: string | null;
}

export interface CobrancasResponse {
  student_id: number;
  referencia: Referencia;
  pagas: Cobranca[];
  atrasados: Cobranca[];
  atual: Cobranca | null;
  resumo: Resumo;
}

export interface ApiResponse<T> {
  type: 'success' | 'error';
  message: string;
  body?: T;
}

export type PaymentMethod = 'pix' | 'boleto';

export interface PaymentActions {
  can_generate_charge?: boolean;
  can_change_method?: boolean;
  can_open_boleto_url: boolean;
  can_copy_boleto_line: boolean;
  can_copy_pix_code: boolean;
}

export interface PaymentMethodLock {
  locked: boolean;
  method: PaymentMethod | string | null;
  reason: string | null;
}

export interface PaymentAssets {
  boleto_number: string | null;
  boleto_digitable: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  pix_qr_image_url: string | null;
}

export interface PaymentOptionsResponse {
  invoice: Cobranca;
  allowed_methods: PaymentMethod[];
  current_method: PaymentMethod | string | null;
  actions: PaymentActions;
  method_lock?: PaymentMethodLock | null;
  payment_assets: PaymentAssets;
}

export interface GenerateChargeResponse {
  invoice_id: number;
  method: PaymentMethod;
  status: string;
  charge_id?: number | string | null;
  reused_existing_charge?: boolean;
  payment_assets: PaymentAssets;
  actions: PaymentActions;
}

/**
 * Gera uma URL de imagem de QR Code a partir do código Pix copia e cola.
 *
 * Usa um provedor público de QR para não depender de libs nativas no app.
 */
export function buildPixQrCodeImageUrl(
  pixCopyPaste: string | null | undefined,
  size = 320
): string | null {
  const value = (pixCopyPaste ?? '').trim();
  if (!value) return null;

  const safeSize = Math.max(128, Math.min(size, 1024));
  const encoded = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&format=png&ecc=M&data=${encoded}`;
}

/**
 * Resolve a melhor URL de QR para exibir no app.
 * Prioriza a URL retornada pelo backend e faz fallback para gerar via copia e cola.
 */
export function resolvePixQrImageUrl(assets: PaymentAssets, size = 320): string | null {
  if (assets.pix_qr_image_url && assets.pix_qr_image_url.trim()) {
    return assets.pix_qr_image_url.trim();
  }

  return buildPixQrCodeImageUrl(assets.pix_copy_paste, size);
}

export async function getCobrancasApi(): Promise<CobrancasResponse> {
  const { data } = await api.get<ApiResponse<CobrancasResponse>>('/api/aluno/boletos');
  if (data.type === 'error') {
    throw new Error(data.message);
  }
  return data.body!;
}

export async function getPaymentOptionsApi(invoiceId: number): Promise<PaymentOptionsResponse> {
  const data = await getPaymentOptionsWithMessageApi(invoiceId);
  return data.body!;
}

export async function getPaymentOptionsWithMessageApi(invoiceId: number): Promise<ApiResponse<PaymentOptionsResponse>> {
  const { data } = await api.get<ApiResponse<PaymentOptionsResponse>>(
    `/api/aluno/cobrancas/${invoiceId}/payment-options`
  );
  if (data.type === 'error') {
    throw new Error(data.message);
  }
  return data;
}

export async function generateChargeApi(invoiceId: number, method: PaymentMethod): Promise<GenerateChargeResponse> {
  const { data } = await api.post<ApiResponse<GenerateChargeResponse>>(
    `/api/aluno/cobrancas/${invoiceId}/generate-charge`,
    { method }
  );
  if (data.type === 'error') {
    throw new Error(data.message);
  }
  return data.body!;
}
