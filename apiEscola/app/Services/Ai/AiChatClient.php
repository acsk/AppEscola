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
    public function json(array $credential, string $system, string $user, float $temperature = 0.4, array $images = []): array
    {
        return $this->jsonWithMetadata($credential, $system, $user, $temperature, $images)['data'];
    }

    public function jsonWithMetadata(array $credential, string $system, string $user, float $temperature = 0.4, array $images = []): array
    {
        $content = $user;
        if ($images !== []) {
            $content = [
                ['type' => 'text', 'text' => $user],
                ...array_map(fn (string $url) => ['type' => 'image_url', 'image_url' => ['url' => $url]], $images),
            ];
        }
        $payload = [
            'model' => $credential['model'],
            'temperature' => $temperature,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $content],
            ],
        ];
        if (isset($credential['provider_routing'])) {
            $payload['provider'] = $credential['provider_routing'];
        }
        $response = $this->request($credential, 'chat/completions', $payload);

        return [
            'data' => $this->decode((string) data_get($response, 'choices.0.message.content', '')),
            'usage' => $response['usage'] ?? [],
            'id' => $response['id'] ?? null,
            'model' => $response['model'] ?? $credential['model'],
        ];
    }

    /** Shared transport: credentials and provider error bodies never enter logs. */
    public function request(array $credential, string $endpoint, ?array $payload = null): array
    {
        $headers = [];
        if ($credential['provider'] === 'openrouter') {
            $headers['HTTP-Referer'] = (string) config('app.url');
            $headers['X-Title'] = (string) config('app.name');
        }

        try {
            $request = Http::withToken($credential['api_key'])
                ->withHeaders($headers)
                ->acceptJson()
                ->timeout($endpoint === 'images'
                    ? (int) config('services.ai.images.timeout', 120)
                    : (int) config('services.ai.timeout', 90));
            $url = $credential['base_url'].'/'.$endpoint;
            $response = $payload === null ? $request->get($url) : $request->post($url, $payload);
        } catch (ConnectionException $e) {
            Log::warning('IA: falha de conexão', ['provider' => $credential['provider']]);
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
                'status' => $response->status(),
            ]);
            throw AiException::provider();
        }

        $data = $response->json();
        if (! is_array($data)) {
            throw AiException::invalidResponse();
        }

        return $data;
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
            Log::warning('IA: resposta não é JSON');
            throw AiException::invalidResponse();
        }

        return $decoded;
    }
}
