import { api, BASE_URL } from './api';

export interface RemoteVersionInfo {
  app: string;
  version: string;
  release_date: string;
}

export interface MetaInfo {
  apiVersion: string;
  contractVersion: string;
  minSupportedVersion: string;
  recommendedVersion: string;
  forceRelogin: boolean;
}

function parseBooleanFlag(value: unknown): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

const apiRoot = () => {
  const base = String(BASE_URL ?? '').replace(/\/$/, '');
  return /\/api$/i.test(base) ? base : `${base}/api`;
};

/**
 * Compara duas versões no formato `v{major}.{release}` (ou similares).
 * Retorna 1 se `left > right`, -1 se `left < right`, 0 se iguais.
 */
export function compareBuildVersions(left: string, right: string): number {
  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < max; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

/** Compara versões no formato semver simples (1.2.3 vs 1.2.4). */
export function compareVersions(left: string, right: string): number {
  const leftParts = String(left || '').split('.').map((p) => Number.parseInt(p, 10) || 0);
  const rightParts = String(right || '').split('.').map((p) => Number.parseInt(p, 10) || 0);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < max; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

/** Busca a versão mais recente do app mobile no backend. */
export async function fetchMobileVersion(): Promise<RemoteVersionInfo | null> {
  try {
    const { data } = await api.get('/api/version/mobile');
    const body = data?.body ?? data ?? {};
    if (!body?.version) return null;
    return {
      app: String(body.app ?? 'mobile'),
      version: String(body.version),
      release_date: String(body.release_date ?? ''),
    };
  } catch {
    return null;
  }
}

/** Busca metadados da API (versão, contrato, versão mínima/recomendada do app). */
export async function fetchMetaInfo(): Promise<MetaInfo> {
  const url = `${apiRoot()}/meta`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const rawData: any = await response.json().catch(() => ({}));
  const body = rawData?.body ?? rawData ?? {};

  return {
    apiVersion: String(body?.api_version ?? response.headers.get('x-api-version') ?? '-'),
    contractVersion: String(
      body?.contract_version ?? response.headers.get('x-api-contract-version') ?? '-',
    ),
    minSupportedVersion: String(
      body?.min_supported_app_version ??
        response.headers.get('x-min-supported-app-version') ??
        '',
    ),
    recommendedVersion: String(
      body?.recommended_app_version ??
        response.headers.get('x-recommended-app-version') ??
        '',
    ),
    forceRelogin: parseBooleanFlag(
      body?.force_relogin ?? response.headers.get('x-force-relogin') ?? false,
    ),
  };
}

/** Testa conexão com a API via /health. Retorna true se respondeu 2xx. */
export async function testApiConnection(timeoutMs = 6000): Promise<boolean> {
  const url = `${apiRoot()}/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/** Formata uma data ISO para `dd/mm/yyyy HH:MM`. */
export function formatBuildDateTime(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoDate;
  }
}

/** Formata data `YYYY-MM-DD` para `dd/mm/yyyy`. */
export function formatDateToPtBr(dateStr: string): string {
  if (!dateStr || dateStr === '-') return dateStr;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
