import { useMemo } from 'react';
import { useTenantTheme } from '../context/TenantThemeContext';
import { LIGHT, deriveBrand, type Palette } from './tokens';

/**
 * Paleta do design system com a cor da escola: `primary` do Tema do app mobile (painel) vira `brand`
 * e as variações saem dela; `accent` é opcional (sem ele, o padrão laranja do sistema).
 */
export function usePalette(): Palette {
  const { colors } = useTenantTheme();
  const primary = colors.primary;
  const accent = (colors as Record<string, string | undefined>).accent;
  return useMemo(() => deriveBrand(LIGHT, primary, accent), [primary, accent]);
}
