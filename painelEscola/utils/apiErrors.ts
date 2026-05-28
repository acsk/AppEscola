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

export type ApiToastState = {
  visible: boolean;
  type: "success" | "error";
  message: string;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function readEnvelopeMessage(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const message = record.message;
  if (typeof message === "string" && message.trim()) return message;
  return null;
}

function readEnvelopeType(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const type = record.type;
  return typeof type === "string" ? type : null;
}

/** Normaliza `axiosResponse.data` (ou objeto equivalente) para o envelope da API. */
export function normalizeApiEnvelope(data: unknown): ApiEnvelope | null {
  const root = asRecord(data);
  if (!root) return null;

  const rootMessage = readEnvelopeMessage(root);
  if (rootMessage) {
    return {
      type: readEnvelopeType(root) ?? "success",
      message: rootMessage,
      body: root.body,
    };
  }

  const nested = asRecord(root.data);
  const nestedMessage = readEnvelopeMessage(nested);
  if (nestedMessage) {
    return {
      type: readEnvelopeType(nested) ?? "success",
      message: nestedMessage,
      body: nested?.body,
    };
  }

  return null;
}

/** Mensagem de sucesso/erro retornada pela API (campo `message` do envelope). */
export function getApiResponseMessage(data: unknown, fallback: string): string {
  return normalizeApiEnvelope(data)?.message ?? fallback;
}

/** Tipo do toast a partir do campo `type` do envelope (`success` | `error`). */
export function getApiResponseToastType(data: unknown): "success" | "error" {
  const type = normalizeApiEnvelope(data)?.type;
  return type === "error" ? "error" : "success";
}

/** Corpo útil da resposta (`body` ou fallbacks legados). */
export function getApiResponseBody<T = unknown>(data: unknown): T | undefined {
  const envelope = normalizeApiEnvelope(data);
  if (envelope?.body != null && typeof envelope.body === "object") {
    return envelope.body as T;
  }

  const root = asRecord(data);
  if (!root) return undefined;

  if (root.body != null && typeof root.body === "object") {
    return root.body as T;
  }

  const nested = asRecord(root.data);
  if (nested?.body != null && typeof nested.body === "object") {
    return nested.body as T;
  }

  if (nested && "id" in nested) return nested as T;
  if ("id" in root && !readEnvelopeMessage(root)) return root as T;

  return undefined;
}

/** Mensagem de erro a partir de exceção axios (`response.data.message`). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const message = getApiResponseMessage(data, "");
  return message || fallback;
}

type ToastSetter = (state: ApiToastState | ((prev: ApiToastState) => ApiToastState)) => void;

/** Toast de sucesso/erro com `message` e `type` vindos da API. */
export function showApiToast(setToast: ToastSetter, data: unknown, fallback: string) {
  setToast({
    visible: true,
    type: getApiResponseToastType(data),
    message: getApiResponseMessage(data, fallback),
  });
}

/** Toast de erro a partir de exceção axios. */
export function showApiErrorToast(setToast: ToastSetter, error: unknown, fallback: string) {
  setToast({
    visible: true,
    type: "error",
    message: getApiErrorMessage(error, fallback),
  });
}
