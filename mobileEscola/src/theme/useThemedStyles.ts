import { useMemo } from 'react';
import { useThemeColors } from '../context/TenantThemeContext';
import type { ThemeColors } from './index';

/** StyleSheet (ou objeto de estilos) recalculado quando as cores do tenant mudam. */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [colors]);
}
