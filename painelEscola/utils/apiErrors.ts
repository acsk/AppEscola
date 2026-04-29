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
