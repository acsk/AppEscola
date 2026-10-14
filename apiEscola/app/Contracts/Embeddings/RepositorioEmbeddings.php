<?php

namespace App\Contracts\Embeddings;

/**
 * Troca futura por Qdrant ou pgvector fica atrás desta interface.
 *
 * @phpstan-type Candidato array{
 *   question_id: int,
 *   question_text: string,
 *   options: list<string>,
 *   subject_id: int|null,
 *   subject_name: string|null,
 *   topic_names: list<string>,
 *   image_url: string|null,
 *   text_hash: string|null,
 *   embedding: list<float>|null,
 *   model_name: string|null,
 *   dimensions: int|null,
 *   strategy_version: string|null
 * }
 */
interface RepositorioEmbeddings
{
    /** @return list<Candidato> */
    public function candidatos(int $tenantId, ?int $disciplinaId, ?int $assuntoId, string $modelo, string $estrategia, int $limite): array;

    /**
     * @param  list<float>  $vetor
     */
    public function salvar(
        int $tenantId,
        int $questaoId,
        ?int $disciplinaId,
        string $modelo,
        int $dimensoes,
        array $vetor,
        string $hash,
        string $estrategia,
        bool $multimodal,
    ): void;

    /** @return array{embedding: list<float>, dimensions: int, text_hash: string, model_name: string}|null */
    public function embeddingDaQuestao(int $questaoId, string $modelo, string $estrategia): ?array;
}
