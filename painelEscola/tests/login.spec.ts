import { test, expect, type Page } from '@playwright/test';

const APP_URL = 'http://localhost:8082';
const LOGIN_URL = `${APP_URL}/#/login`;
const EMAIL = 'admin@cursinhoexemplo.com';
const PASSWORD = '123456';

/**
 * Realiza login via UI. Ao retornar, o estado autenticado já está visível
 * (campo "Pesquisar..." e mensagem "Bem-vindo de volta").
 */
async function loginViaUI(page: Page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email-input', EMAIL);
  await page.fill('#login-password-input', PASSWORD);

  // O botão "Entrar" fica desabilitado enquanto o app valida /meta.
  // Aguardar habilitar evita cliques ignorados em Firefox/WebKit.
  const submit = page.getByRole('button', { name: 'Entrar' });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();

  await expect(page.getByPlaceholder('Pesquisar...')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Bem-vindo de volta/i)).toBeVisible({ timeout: 20_000 });
}

/**
 * Valida o formato do token Laravel Sanctum: "<id>|<hash>",
 * onde <id> é numérico e <hash> é uma string alfanumérica longa.
 * Ex.: "42|8kQ...aZ"
 */
const SANCTUM_TOKEN_REGEX = /^\d+\|[A-Za-z0-9]{20,}$/;

function isSanctumToken(token: string | null): boolean {
  if (!token) return false;
  return SANCTUM_TOKEN_REGEX.test(token);
}

/** Rotas públicas que não usam o interceptor com Authorization. */
const PUBLIC_API_PATHS = [
  '/api/login',
  '/api/meta',
  '/api/health',
  '/api/version/panel',
];

function isAuthenticatedApiRequest(url: string): boolean {
  if (!url.includes('/api/')) return false;
  return !PUBLIC_API_PATHS.some((path) => url.includes(path));
}

test.describe('Login e JWT', () => {
  // Rodar em série: vários logins simultâneos sobrecarregam o dev server
  // (Expo) e podem disparar rate-limit no backend, causando ERR_CONNECTION_REFUSED.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Começar sempre com storage limpo para evitar contaminação entre testes.
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
  });

  test('login test', async ({ page }) => {
    await loginViaUI(page);
  });

  test('após login, o JWT é armazenado no localStorage com formato válido', async ({ page }) => {
    await loginViaUI(page);

    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('auth_token'),
      user: localStorage.getItem('auth_user'),
    }));

    expect(stored.token, 'auth_token deve existir no localStorage').toBeTruthy();
    expect(
      isSanctumToken(stored.token),
      'auth_token deve seguir o formato Sanctum "<id>|<hash>"'
    ).toBe(true);
    expect(stored.user, 'auth_user deve existir no localStorage').toBeTruthy();

    const parsedUser = JSON.parse(stored.user as string);
    expect(parsedUser).toMatchObject({ email: EMAIL });
  });

  test('requisições autenticadas enviam o header Authorization: Bearer <jwt>', async ({ page }) => {
    await loginViaUI(page);

    // Captura a próxima requisição autenticada (dashboard, etc.),
    // ignorando rotas públicas que não usam o interceptor axios.
    const apiRequest = page.waitForRequest(
      (req) => isAuthenticatedApiRequest(req.url()),
      { timeout: 10_000 }
    );

    // Recarrega a área logada para disparar chamadas do dashboard.
    await page.reload();

    const request = await apiRequest;
    const authHeader = request.headers()['authorization'];

    expect(authHeader, 'header Authorization deve ser enviado').toBeTruthy();
    expect(authHeader).toMatch(/^Bearer\s+\S+/);

    const tokenFromHeader = authHeader.replace(/^Bearer\s+/, '');
    expect(
      isSanctumToken(tokenFromHeader),
      'token no header deve seguir o formato Sanctum "<id>|<hash>"'
    ).toBe(true);

    const tokenFromStorage = await page.evaluate(() =>
      localStorage.getItem('auth_token')
    );
    expect(tokenFromHeader).toBe(tokenFromStorage);
  });

  test('sessão persiste após reload (JWT mantém autenticação)', async ({ page }) => {
    await loginViaUI(page);

    const tokenBefore = await page.evaluate(() =>
      localStorage.getItem('auth_token')
    );
    expect(tokenBefore).toBeTruthy();

    await page.reload();

    // Continua autenticado, sem voltar para a tela de login.
    await expect(page.getByPlaceholder('Pesquisar...')).toBeVisible();
    await expect(page.getByText(/Bem-vindo de volta/i)).toBeVisible();

    const tokenAfter = await page.evaluate(() =>
      localStorage.getItem('auth_token')
    );
    expect(tokenAfter).toBe(tokenBefore);
  });

  test('token adulterado invalida a sessão e volta para o login', async ({ page }) => {
    await loginViaUI(page);

    // Corrompe o token e o user, simulando adulteração local.
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'invalid.jwt.token');
      localStorage.setItem('auth_user', '{}');
    });

    // Recarrega: o interceptor da API deve receber 401 na próxima chamada
    // e o AuthContext deve limpar credenciais e voltar ao login.
    await page.reload();

    await expect(
      page.getByPlaceholder('seu@email.com ou matrícula')
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    const tokenAfter = await page.evaluate(() =>
      localStorage.getItem('auth_token')
    );
    expect(tokenAfter, 'token inválido deve ter sido removido').toBeNull();
  });
});
