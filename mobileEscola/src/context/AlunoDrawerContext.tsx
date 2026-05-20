import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface AlunoDrawerContextData {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const AlunoDrawerContext = createContext<AlunoDrawerContextData | null>(null);

export function AlunoDrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const toggle = useCallback(() => setVisible((prev) => !prev), []);

  return (
    <AlunoDrawerContext.Provider value={{ visible, open, close, toggle }}>
      {children}
    </AlunoDrawerContext.Provider>
  );
}

export function useAlunoDrawer(): AlunoDrawerContextData {
  const context = useContext(AlunoDrawerContext);
  if (!context) {
    throw new Error('useAlunoDrawer deve ser usado dentro de AlunoDrawerProvider');
  }
  return context;
}
