import api from "./api";

export type SimilarMatch = {
  question_id: number;
  enunciado: string;
  disciplina: string | null;
  assuntos: string[];
  similaridade_semantica: number | null;
  correspondencia_textual: number;
  semelhanca_estrutural: number;
  tipo: string;
  motivo: string;
};

export type SimilarSearchResult = {
  verificacao: string;
  reindexacao_necessaria?: boolean;
  comparacao_multimodal_necessaria?: boolean;
  resultados: SimilarMatch[];
};

const TIPO: Record<string, string> = {
  duplicata_exata: "Duplicata exata",
  possivel_duplicata: "Possível duplicata",
  muito_semelhante: "Muito semelhante",
  mesmo_assunto: "Mesmo assunto",
  comparacao_multimodal_necessaria: "Comparar a imagem",
  reindexacao_necessaria: "Reindexar embeddings",
};

export function similarMatchLabel(tipo: string): string {
  return TIPO[tipo] ?? tipo;
}

export function similarPercent(match: SimilarMatch): number | null {
  const valor = match.similaridade_semantica ?? match.semelhanca_estrutural;
  return valor === null ? null : Math.round(valor * 100);
}

export async function searchSimilarQuestions(payload: {
  question_text: string;
  subject_id?: number | null;
  topic_id?: number | null;
  image_url?: string | null;
  options?: { option_text: string }[];
  limite?: number;
  ignorar_ids?: number[];
}) {
  const { data } = await api.post("/question-bank/questions/similar-search", payload, { timeout: 60000 });
  return data as { type: string; message: string; body: SimilarSearchResult };
}

export async function fetchEmbeddingMetrics() {
  const { data } = await api.get("/question-bank/embeddings/metrics");
  return data.body as {
    embeddings_gerados: number;
    embeddings_reutilizados: number;
    falhas: number;
    buscas: number;
    duplicatas_detectadas: number;
    regeneradas: number;
    rejeitadas_semelhanca: number;
    tempo_medio_busca_ms: number;
    custo_embeddings_usd: number;
    armazenados: number;
  };
}
