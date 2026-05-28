/**
 * Traduz chaves de validação do Laravel para pt-BR.
 * Usado ao processar respostas 422 da API.
 */
const TRANSLATIONS: Record<string, string> = {
  // datas
  "validation.date": "Data inválida.",
  "validation.date_format": "Formato de data inválido.",
  "validation.before": "A data deve ser anterior.",
  "validation.after": "A data deve ser posterior.",
  "validation.before_or_equal": "A data deve ser anterior ou igual.",
  "validation.after_or_equal": "A data deve ser posterior ou igual.",
  // presença
  "validation.required": "Este campo é obrigatório.",
  "validation.filled": "Este campo não pode estar vazio.",
  "validation.present": "Este campo deve estar presente.",
  // formato
  "validation.email": "E-mail inválido.",
  "validation.url": "URL inválida.",
  "validation.string": "Deve ser um texto.",
  "validation.numeric": "Deve ser um número.",
  "validation.integer": "Deve ser um número inteiro.",
  "validation.boolean": "Deve ser verdadeiro ou falso.",
  "validation.alpha": "Deve conter apenas letras.",
  "validation.alpha_num": "Deve conter apenas letras e números.",
  "validation.alpha_dash": "Deve conter apenas letras, números e traços.",
  // tamanho
  "validation.min.string": "Muito curto.",
  "validation.max.string": "Muito longo.",
  "validation.min.numeric": "Valor muito pequeno.",
  "validation.max.numeric": "Valor muito grande.",
  // unicidade
  "validation.unique": "Já cadastrado.",
  "validation.exists": "Não encontrado.",
  // arquivos
  "validation.mimes": "Tipo de arquivo inválido.",
  "validation.max.file": "Arquivo muito grande.",
  // confirmação
  "validation.confirmed": "A confirmação não confere.",
  "validation.same": "Os campos não conferem.",
  "validation.different": "Os campos devem ser diferentes.",
  // regex
  "validation.regex": "Formato inválido.",
};

/**
 * Traduz uma mensagem (ou chave) de validação para pt-BR.
 * Se não houver tradução conhecida, retorna a string original.
 */
export function translateError(message: string): string {
  return TRANSLATIONS[message] ?? message;
}

/**
 * Processa o objeto `errors` de uma resposta 422 e retorna
 * um Record<string, string> com as mensagens em pt-BR.
 */
export function parseApiErrors(
  rawErrors: Record<string, string | string[]>
): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(rawErrors).forEach(([field, value]) => {
    const msg = Array.isArray(value) ? value[0] : value;
    result[field] = translateError(msg);
  });
  return result;
}

/** Envelope padrão da apiEscola: `{ type, message, body }`. */
export type ApiEnvelope<T = unknown> = {
  type?: "success" | "error" | string;
  message?: string;
  body?: T;
};

/** Mensagem de sucesso/erro retornada pela API (campo `message` do envelope). */
export function getApiResponseMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as ApiEnvelope).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Tipo do toast a partir do campo `type` do envelope (`success` | `error`). */
export function getApiResponseToastType(data: unknown): "success" | "error" {
  if (data && typeof data === "object" && "type" in data) {
    const type = (data as ApiEnvelope).type;
    if (type === "error") return "error";
  }
  return "success";
}

/** Corpo útil da resposta (`body` ou fallbacks legados). */
export function getApiResponseBody<T = unknown>(data: unknown): T | undefined {
  if (!data || typeof data !== "object") return undefined;
  const envelope = data as ApiEnvelope<T>;
  if (envelope.body != null) return envelope.body;
  if ("data" in envelope && (envelope as { data?: T }).data != null) {
    return (envelope as { data?: T }).data;
  }
  return data as T;
}
