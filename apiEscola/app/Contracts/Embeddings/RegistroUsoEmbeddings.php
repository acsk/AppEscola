<?php

namespace App\Contracts\Embeddings;

interface RegistroUsoEmbeddings
{
    /** @param  array<string, mixed>  $meta */
    public function registrar(int $tenantId, ?int $questaoId, string $acao, ?string $modelo, int $tokens, float $custo, ?int $duracaoMs, array $meta = []): void;

    /** @return array<string, int|float> */
    public function metricas(int $tenantId): array;
}
