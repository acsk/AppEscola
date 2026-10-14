<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\ProvedorEmbeddings;
use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Exceptions\EmbeddingException;

class EmbeddingService
{
    public function __construct(
        private readonly ProvedorEmbeddings $provedor,
        private readonly RepositorioEmbeddings $repositorio,
        private readonly RegistroUsoEmbeddings $usos,
        private readonly TextoCanonicoQuestao $texto,
    ) {}

    public function modelo(): string
    {
        try {
            return function_exists('app') && app()->bound('config')
                ? (string) config('services.ai.embeddings.model')
                : 'modelo-teste';
        } catch (\Throwable) {
            return 'modelo-teste';
        }
    }

    public function dimensoesConfiguradas(): int
    {
        try {
            return function_exists('app') && app()->bound('config')
                ? (int) config('services.ai.embeddings.dimensions')
                : 2;
        } catch (\Throwable) {
            return 2;
        }
    }

    /**
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credencial
     * @param  list<string>  $textos
     * @return list<list<float>>
     */
    public function gerarLote(int $tenantId, array $credencial, array $textos, string $acao = 'gerado'): array
    {
        $inicio = microtime(true);
        $pedido = $credencial;
        $pedido['model'] = $this->modelo();
        try {
            $resposta = $this->provedor->gerar($pedido, $textos);
        } catch (EmbeddingException $e) {
            $this->usos->registrar($tenantId, null, 'falha', $this->modelo(), 0, 0, $this->ms($inicio), [
                'codigo' => $e->codigo,
            ]);
            throw $e;
        }

        $dimensao = isset($resposta['vetores'][0]) ? count($resposta['vetores'][0]) : 0;
        if ($dimensao !== 0 && $dimensao !== $this->dimensoesConfiguradas()) {
            $this->usos->registrar($tenantId, null, 'falha', $resposta['modelo'], $resposta['tokens'], 0, $this->ms($inicio), [
                'codigo' => 'embedding_dimension_mismatch',
                'dimensoes' => $dimensao,
            ]);
            throw new EmbeddingException(
                'O modelo devolveu um vetor com dimensão diferente da configurada. Reindexe com o modelo atual.',
                'embedding_dimension_mismatch'
            );
        }

        $custo = $this->custo($resposta['tokens']);
        $this->usos->registrar($tenantId, null, $acao, $resposta['modelo'], $resposta['tokens'], $custo, $this->ms($inicio), [
            'quantidade' => count($textos),
        ]);

        return $resposta['vetores'];
    }

    /**
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credencial
     * @return list<float>
     */
    public function vetorDaQuestao(int $tenantId, int $questaoId, ?int $disciplinaId, string $canonico, bool $multimodal, array $credencial): array
    {
        $hash = $this->texto->hash($canonico);
        $guardado = $this->repositorio->embeddingDaQuestao($questaoId, $this->modelo(), $this->texto->estrategia());
        if ($guardado !== null && $guardado['text_hash'] === $hash && count($guardado['embedding']) === $this->dimensoesConfiguradas()) {
            $this->usos->registrar($tenantId, $questaoId, 'reutilizado', $this->modelo(), 0, 0, 0);

            return $guardado['embedding'];
        }

        $vetor = $this->gerarLote($tenantId, $credencial, [$canonico])[0];
        $this->repositorio->salvar(
            $tenantId,
            $questaoId,
            $disciplinaId,
            $this->modelo(),
            count($vetor),
            $vetor,
            $hash,
            $this->texto->estrategia(),
            $multimodal,
        );

        return $vetor;
    }

    public function custo(int $tokens): float
    {
        try {
            $milhao = function_exists('app') && app()->bound('config')
                ? (float) config('services.ai.embeddings.cost_per_million_tokens', 0.02)
                : 0.02;
        } catch (\Throwable) {
            $milhao = 0.02;
        }

        return round($tokens * $milhao / 1_000_000, 6);
    }

    private function ms(float $inicio): int
    {
        return (int) round((microtime(true) - $inicio) * 1000);
    }
}
