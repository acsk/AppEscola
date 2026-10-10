<?php

namespace App\Services\Ai;

/**
 * Resolve o modelo de cada função a partir da configuração.
 * Os identificadores ficam no ambiente; a revisão não grava slug de modelo na regra.
 *
 * IDs conferidos no OpenRouter em 2026-10-10, ainda não usados como padrão
 * para não trocar o custo das gerações já em produção:
 * gerador preferencial anthropic/claude-sonnet-5.5 ($2 / $10 por milhão),
 * revisor openai/gpt-5.6-sol,
 * revisor premium anthropic/claude-opus-5.5,
 * multimodal ~google/gemini-pro-latest (aceita imagem, áudio e PDF).
 */
class GerenciadorModelosService
{
    public const GERADOR = 'gerador';

    public const REVISOR = 'revisor';

    public const REVISOR_PREMIUM = 'revisor_premium';

    public const MULTIMODAL = 'multimodal';

    public function modelo(string $funcao): string
    {
        $valor = match ($funcao) {
            self::GERADOR => config('services.ai.openrouter.model'),
            self::REVISOR => config('services.ai.review.model'),
            self::REVISOR_PREMIUM => config('services.ai.review.advanced_model'),
            self::MULTIMODAL => config('services.ai.pdf.model_openrouter'),
            default => '',
        };

        return trim((string) $valor);
    }
}
