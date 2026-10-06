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
