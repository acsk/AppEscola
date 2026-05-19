import { useCallback, useEffect, useState } from "react";
import {
  BillingSettingsValues,
  getBillingSettings,
} from "../services/settings";

type State = {
  loading: boolean;
  settings: BillingSettingsValues | null;
  error: string | null;
};

const EMPTY: BillingSettingsValues = {
  billing: {},
  payment: {},
  enrollment: {},
};

/**
 * Carrega as configurações de billing/payment/enrollment do tenant atual.
 *
 * As regras devem sempre vir do backend; o frontend só adapta UI/validações
 * conforme os valores retornados.
 */
export function useBillingSettings(tenantId?: number | null) {
  const [state, setState] = useState<State>({
    loading: true,
    settings: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const resp = await getBillingSettings(tenantId);
      setState({
        loading: false,
        settings: resp.settings ?? EMPTY,
        error: null,
      });
    } catch (e: any) {
      setState({
        loading: false,
        settings: null,
        error: e?.response?.data?.message || "Falha ao carregar configurações.",
      });
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const settings = state.settings ?? EMPTY;
  const billing = (settings.billing ?? {}) as Record<string, any>;
  const payment = (settings.payment ?? {}) as Record<string, any>;
  const enrollment = (settings.enrollment ?? {}) as Record<string, any>;

  return {
    loading: state.loading,
    error: state.error,
    reload: load,
    settings,
    billing,
    payment,
    enrollment,
  };
}
