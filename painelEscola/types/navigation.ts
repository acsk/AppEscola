export type NavigateFn = (screen: string, params?: Record<string, unknown>) => void;

export type NavState = {
  screen: string;
  params?: Record<string, unknown>;
};

/** Props comuns de telas roteadas pelo App.tsx */
export type WithNavigate = {
  navigate: NavigateFn;
};
