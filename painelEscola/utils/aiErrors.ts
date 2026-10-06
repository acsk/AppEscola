import { getApiErrorMessage } from "./apiErrors";

/** Título e mensagem do modal de erro padrão (MessageModal) para falhas da IA, pelo `body.code` da API. */
export function describeAiError(error: unknown, fallbackTitle: string): { title: string; message: string } {
  const body = (error as { response?: { data?: { body?: { code?: string; motivo?: string } } } })?.response?.data?.body;
  const apiMessage = getApiErrorMessage(error, "");

  switch (body?.code) {
    case "image_needs_review":
      return {
        title: "Não foi possível usar a imagem",
        message: `A IA não conseguiu interpretar a imagem da questão${body.motivo ? ` (${body.motivo.toLowerCase()})` : ""}. Envie uma imagem mais nítida na edição da questão e tente novamente.`,
      };
    case "ai_not_configured":
      return { title: "IA não configurada", message: apiMessage || "Cadastre uma chave em Configurações → Integração com IA." };
    case "ai_provider_error":
      return { title: "Falha no provedor de IA", message: apiMessage || "O provedor de IA não respondeu. Tente novamente em instantes." };
    case "ai_invalid_response":
      return { title: fallbackTitle, message: apiMessage || "A IA devolveu uma resposta inválida. Tente novamente." };
    default:
      return { title: fallbackTitle, message: apiMessage || "Ocorreu um erro inesperado. Tente novamente." };
  }
}
