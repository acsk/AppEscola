import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMobileTheme } from '../services/mobile-theme.service';
import { defaultColors, type ThemeColors } from '../theme';

type TenantThemeContextValue = {
  colors: ThemeColors;
  logoUrl: string | null;
  tenantName: string | null;
  isLoading: boolean;
  isError: boolean;
};

const TenantThemeContext = createContext<TenantThemeContextValue | null>(null);

export const mobileThemeQueryKey = ['aluno', 'mobile-theme'] as const;

export function TenantThemeProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: mobileThemeQueryKey,
    queryFn: fetchMobileTheme,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const value = useMemo<TenantThemeContextValue>(() => {
    const merged: ThemeColors = {
      ...defaultColors,
      ...(data?.colors ?? {}),
    };

    return {
      colors: merged,
      logoUrl: data?.logo_url ?? null,
      tenantName: data?.tenant_name ?? null,
      isLoading,
      isError,
    };
  }, [data, isLoading, isError]);

  return (
    <TenantThemeContext.Provider value={value}>{children}</TenantThemeContext.Provider>
  );
}

export function useTenantTheme(): TenantThemeContextValue {
  const ctx = useContext(TenantThemeContext);
  if (!ctx) {
    return {
      colors: { ...defaultColors },
      logoUrl: null,
      tenantName: null,
      isLoading: false,
      isError: false,
    };
  }
  return ctx;
}

/** Cores do tenant no fluxo aluno; fora do provider retorna defaults. */
export function useThemeColors(): ThemeColors {
  return useTenantTheme().colors;
}
