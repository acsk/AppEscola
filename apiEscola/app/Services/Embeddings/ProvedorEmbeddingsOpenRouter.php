<?php

namespace App\Services\Embeddings;

use App\Contracts\Embeddings\ProvedorEmbeddings;
use App\Exceptions\EmbeddingException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProvedorEmbeddingsOpenRouter implements ProvedorEmbeddings
{
    public function gerar(array $credencial, array $textos): array
    {
        if ($textos === []) {
            return ['vetores' => [], 'tokens' => 0, 'modelo' => $credencial['model']];
        }

        $headers = [];
        if (($credencial['provider'] ?? '') === 'openrouter') {
            $headers['HTTP-Referer'] = (string) config('app.url');
            $headers['X-Title'] = (string) config('app.name');
        }

        try {
            $response = Http::withToken($credencial['api_key'])
                ->withHeaders($headers)
                ->acceptJson()
                ->timeout(30)
                ->post(rtrim($credencial['base_url'], '/').'/embeddings', [
                    'model' => $credencial['model'],
                    'input' => array_values($textos),
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Embeddings: falha de conexão', ['provider' => $credencial['provider'] ?? null]);
            throw new EmbeddingException();
        }

        if (! $response->successful()) {
            Log::warning('Embeddings: resposta recusada', ['status' => $response->status()]);
            throw new EmbeddingException();
        }

        $data = $response->json('data');
        if (! is_array($data) || count($data) !== count($textos)) {
            throw new EmbeddingException('A resposta de embeddings veio incompleta.', 'embedding_invalid_response');
        }

        $vetores = [];
        foreach ($data as $item) {
            $vetor = $item['embedding'] ?? null;
            if (! is_array($vetor) || $vetor === []) {
                throw new EmbeddingException('A resposta de embeddings veio incompleta.', 'embedding_invalid_response');
            }
            $vetores[(int) ($item['index'] ?? count($vetores))] = array_map('floatval', $vetor);
        }
        ksort($vetores);

        return [
            'vetores' => array_values($vetores),
            'tokens' => (int) ($response->json('usage.total_tokens') ?? $response->json('usage.prompt_tokens') ?? 0),
            'modelo' => (string) ($response->json('model') ?? $credencial['model']),
        ];
    }
}
