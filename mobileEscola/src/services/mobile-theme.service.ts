import { api } from './api';
import type { ThemeColors } from '../theme';

export interface MobileThemePayload {
  tenant_id: number;
  tenant_name: string;
  logo_url: string | null;
  colors: ThemeColors;
}

function unwrap<T>(data: unknown): T {
  const envelope = data as { body?: T };
  return (envelope?.body ?? data) as T;
}

export async function fetchMobileTheme(): Promise<MobileThemePayload> {
  const { data } = await api.get('/api/aluno/mobile-theme');
  return unwrap<MobileThemePayload>(data);
}
