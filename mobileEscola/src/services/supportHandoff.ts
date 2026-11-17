import { api } from './api';
import { AuthUser } from './auth.service';

export type SupportAccessInfo = { expires_at: string };

export type RedeemedSupportAccess = {
  token: string;
  user: AuthUser;
  support_access: SupportAccessInfo | null;
};

let pendingCode: string | null = null;
let redeeming: Promise<RedeemedSupportAccess | null> | null = null;

/** Lê ?acesso= uma vez, antes do app montar, e tira o código da URL. */
function captureCode(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('acesso');
  if (!code) return;
  pendingCode = code;
  params.delete('acesso');
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

captureCode();

/** Troca o código de uso único pela sessão do aluno. Chamadas seguintes esperam a mesma troca. */
export function redeemSupportHandoff(): Promise<RedeemedSupportAccess | null> {
  if (redeeming) return redeeming;
  const code = pendingCode;
  if (!code) return Promise.resolve(null);
  pendingCode = null;

  redeeming = api
    .post('/api/support-access/mobile/redeem', { code })
    .then(({ data }) => {
      const body = data?.body ?? data;
      if (!body?.token || !body?.user) {
        throw new Error('Resposta de acesso inválida.');
      }
      const support = body.support_access ?? body.user.support_access ?? null;
      return {
        token: String(body.token),
        user: body.user as AuthUser,
        support_access: support,
      };
    })
    .catch((error) => {
      redeeming = null;
      throw error;
    });

  return redeeming;
}
