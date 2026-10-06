<?php

namespace App\Services\Ai;

use App\Exceptions\AiException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Cliente de chat completions (formato OpenAI, aceito também pelo OpenRouter) que devolve JSON.
 */
class AiChatClient
{
    /**
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credential
     * @return array<string, mixed>
     */
    public function json(array $credential, string $system, string $user, float $temperature = 0.4): array
    {
        $headers = [];
        if ($credential['provider'] === 'openrouter') {
            $headers['HTTP-Referer'] = (string) config('app.url');
            $headers['X-Title'] = (string) config('app.name');
        }

        try {
            $response = Http::withToken($credential['api_key'])
                ->withHeaders($headers)
                ->acceptJson()
                ->timeout((int) config('services.ai.timeout', 90))
                ->post($credential['base_url'].'/chat/completions', [
                    'model'           => $credential['model'],
                    'temperature'     => $temperature,
                    'response_format' => ['type' => 'json_object'],
                    'messages'        => [
                        ['role' => 'system', 'content' => $system],
                        ['role' => 'user', 'content' => $user],
                    ],
                ]);
        } catch (ConnectionException $e) {
            Log::warning('IA: falha de conexão', ['provider' => $credential['provider'], 'error' => $e->getMessage()]);
            throw AiException::provider();
        }

        if ($response->status() === 401 || $response->status() === 403) {
            Log::warning('IA: chave recusada', ['provider' => $credential['provider'], 'status' => $response->status()]);
            throw AiException::provider('A chave de IA foi recusada pelo provedor. Verifique a chave cadastrada.');
        }
        if ($response->status() === 429) {
            throw AiException::provider('Limite de uso do provedor de IA atingido. Tente novamente em instantes.');
        }
        if ($response->failed()) {
            Log::warning('IA: erro do provedor', [
                'provider' => $credential['provider'],
                'status'   => $response->status(),
                'body'     => mb_substr($response->body(), 0, 500),
            ]);
            throw AiException::provider();
        }

        $content = (string) data_get($response->json(), 'choices.0.message.content', '');

        return $this->decode($content);
    }

    /** Aceita JSON puro ou dentro de bloco ```json```. */
    private function decode(string $content): array
    {
        $content = trim($content);
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/s', $content, $m)) {
            $content = $m[1];
        }

        $decoded = json_decode($content, true);
        if (! is_array($decoded)) {
            Log::warning('IA: resposta não é JSON', ['content' => mb_substr($content, 0, 500)]);
            throw AiException::invalidResponse();
        }

        return $decoded;
    }
}
