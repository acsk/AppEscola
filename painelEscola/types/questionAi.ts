/** IA do banco de questões e chaves de IA do tenant — contratos de /question-bank/ai e /ai-settings. */

export type AiProvider = "openrouter" | "openai";

/** Sugestão da IA no formato do payload de criação de questão avulsa (campos ausentes = sem sugestão). */
export type AiQuestionSuggestion = {
  type: "multiple_choice" | "essay";
  question_text: string;
  explanation: string;
  options?: { option_text: string; is_correct: boolean; order?: number }[];
  subject_id?: number;
  topic_ids?: number[];
  difficulty_id?: number | null;
  board_id?: number;
  year?: number;
  exam_type_id?: number | null;
  tags?: string[];
  possui_imagem?: boolean;
  image_url?: string | null;
  generation_id?: string;
  image_generation?: AiImageGeneration;
  /** Importação de PDF: índice do bloco de origem no lote enviado. */
  block_index?: number;
  source_number?: string;
  source_exam_name?: string;
  /** Importação de PDF: a questão depende de figura/gráfico que não veio no texto. */
  needs_image?: boolean;
  /** Importação de PDF: o gabarito veio do próprio PDF (e não da IA). */
  answer_from_pdf?: boolean;
};

export type AiImageGeneration = {
  status: "PENDING" | "GENERATING" | "READY" | "NEEDS_REVIEW" | "APPROVED";
  model: string | null;
  attempts: number;
  validation: { valida: boolean; confidence: number; problemas: string[]; recomendacao: string | null } | null;
  reason: string | null;
};

export type AiImageReview = {
  generation_id: string;
  image_url: string | null;
  image_generation: AiImageGeneration;
};

export type AiStatus = { available: boolean; source: "env" | "tenant" | null; provider: AiProvider | null };

export type AiCredentialSummary = {
  provider: AiProvider;
  configured: boolean;
  active: boolean;
  key_hint: string | null;
  model: string | null;
  default_model: string;
  configured_at: string | null;
};

export type AiSettingsResponse = {
  tenant_id: number;
  providers: AiCredentialSummary[];
  /** Só para super admin: chaves do .env (sem valores). */
  env: { provider: AiProvider; configured: boolean; model: string }[] | null;
};

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
};
