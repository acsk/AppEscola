import { useCallback, useEffect, useState } from "react";
import { fetchAiStatus } from "../services/questionAi";
import { getApiErrorMessage } from "../utils/apiErrors";

const MISSING_KEY = "Para usar a IA, cadastre uma chave em Configurações → Integração com IA.";

export function useQuestionAiStatus() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchAiStatus();
      setAvailable(status.available);
      return status.available ? null : MISSING_KEY;
    } catch (cause) {
      const message = `${getApiErrorMessage(cause, "Não foi possível verificar a configuração de IA.")} Verifique a API e tente novamente.`;
      setAvailable(false);
      setError(message);
      return message;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ensureAvailable = async (): Promise<string | null> => {
    if (loading) return "Verificando a configuração de IA. Aguarde e tente novamente.";
    return available ? null : reload();
  };

  return { available, loading, error, reload, ensureAvailable };
}
