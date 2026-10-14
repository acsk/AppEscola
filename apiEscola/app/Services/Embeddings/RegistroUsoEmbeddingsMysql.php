<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Models\EmbeddingUsage;
use App\Models\QuestionEmbedding;

class RegistroUsoEmbeddingsMysql implements RegistroUsoEmbeddings
{
    public function registrar(int $tenantId, ?int $questaoId, string $acao, ?string $modelo, int $tokens, float $custo, ?int $duracaoMs, array $meta = []): void
    {
        EmbeddingUsage::query()->create([
            'tenant_id' => $tenantId,
            'exam_question_id' => $questaoId,
            'action' => $acao,
            'model_name' => $modelo,
            'tokens' => $tokens,
            'cost_usd' => $custo,
            'duration_ms' => $duracaoMs,
            'meta' => $meta === [] ? null : $meta,
            'created_at' => now(),
        ]);
    }

    public function metricas(int $tenantId): array
    {
        $contagem = fn (string $acao) => (int) EmbeddingUsage::query()->where('tenant_id', $tenantId)->where('action', $acao)->count();
        $quantidade = function (string $acao) use ($tenantId): int {
            return (int) EmbeddingUsage::query()
                ->where('tenant_id', $tenantId)
                ->where('action', $acao)
                ->get(['meta'])
                ->sum(function (EmbeddingUsage $row): int {
                    $quantidade = is_array($row->meta) ? ($row->meta['quantidade'] ?? null) : null;

                    return is_numeric($quantidade) && (int) $quantidade > 0 ? (int) $quantidade : 1;
                });
        };
        $soma = fn (string $coluna) => (float) EmbeddingUsage::query()->where('tenant_id', $tenantId)->sum($coluna);
        $buscas = EmbeddingUsage::query()->where('tenant_id', $tenantId)->where('action', 'busca')->whereNotNull('duration_ms');

        return [
            'embeddings_gerados' => $contagem('gerado'),
            'embeddings_reutilizados' => $contagem('reutilizado'),
            'falhas' => $contagem('falha'),
            'buscas' => $contagem('busca'),
            'duplicatas_detectadas' => $quantidade('duplicata'),
            'regeneradas' => $quantidade('regenerada'),
            'rejeitadas_semelhanca' => $quantidade('rejeitada'),
            'tempo_medio_busca_ms' => round((float) $buscas->avg('duration_ms'), 1),
            'custo_embeddings_usd' => round($soma('cost_usd'), 6),
            'armazenados' => QuestionEmbedding::query()->where('tenant_id', $tenantId)->count(),
        ];
    }
}
