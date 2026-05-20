import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useThemeColors } from '../../context/TenantThemeContext';
import { createFinanceiroStyles } from './styles/financeiro.styles';

type FinanceiroStyles = ReturnType<typeof createFinanceiroStyles>;

const FinanceiroStylesContext = createContext<FinanceiroStyles | null>(null);

export function FinanceiroStylesProvider({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createFinanceiroStyles(colors), [colors]);

  return (
    <FinanceiroStylesContext.Provider value={styles}>
      {children}
    </FinanceiroStylesContext.Provider>
  );
}

export function useFinanceiroStyles(): FinanceiroStyles {
  const ctx = useContext(FinanceiroStylesContext);
  const colors = useThemeColors();
  return useMemo(
    () => ctx ?? createFinanceiroStyles(colors),
    [ctx, colors],
  );
}
