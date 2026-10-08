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

    /**
     * Chat com um arquivo PDF anexado (OpenAI: content "file"; OpenRouter: idem + plugin file-parser).
     * O PDF é dado não confiável: o chamador põe as regras de segurança no system prompt e valida a saída.
     *
     * @return array<string, mixed>
     */
    public function jsonWithPdf(array $credential, string $system, string $user, string $pdfBase64, string $filename, float $temperature = 0.1): array
    {
        $payload = [
            'model' => $credential['model'],
            'temperature' => $temperature,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => [
                    ['type' => 'text', 'text' => $user],
                    ['type' => 'file', 'file' => ['filename' => $filename, 'file_data' => 'data:application/pdf;base64,'.$pdfBase64]],
                ]],
            ],
        ];
        if ($credential['provider'] === 'openrouter') {
            $payload['plugins'] = [['id' => 'file-parser', 'pdf' => ['engine' => 'native']]];
        }
        if (isset($credential['provider_routing'])) {
            $payload['provider'] = $credential['provider_routing'];
        }
        $payload['max_tokens'] = 32000;
        $response = $this->request($credential + ['timeout' => (int) config('services.ai.pdf.timeout', 180)], 'chat/completions', $payload);
        if (data_get($response, 'choices.0.finish_reason') === 'length') {
            throw new AiException('A resposta da IA foi cortada. Divida o PDF e importe novamente.', 422, 'pdf_incomplete');
        }

        return $this->decode((string) data_get($response, 'choices.0.message.content', ''));
    }

    public function jsonWithMetadata(array $credential, string $system, string $user, float $temperature = 0.4, array $images = [], ?array $schema = null): array
    {
        $content = $user;
        if ($images !== []) {
            $content = [
                ['type' => 'text', 'text' => $user],
                // detail=high: análise em alta resolução (texto pequeno em gráficos/tabelas); provedores sem suporte ignoram.
                ...array_map(fn (string $url) => ['type' => 'image_url', 'image_url' => ['url' => $url, 'detail' => 'high']], $images),
            ];
        }
        $payload = [
            'model' => $credential['model'],
            'temperature' => $temperature,
            'response_format' => $schema === null ? ['type' => 'json_object'] : [
                'type' => 'json_schema', 'json_schema' => ['name' => 'question_text_import', 'strict' => true, 'schema' => $schema],
            ],
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $content],
            ],
        ];
        if (isset($credential['provider_routing'])) {
            $payload['provider'] = $credential['provider_routing'];
        }
        if ($schema !== null) {
            $payload['max_tokens'] = $credential['max_output_tokens'] ?? 16000;
        }
        $response = $this->request($credential, 'chat/completions', $payload);
        if ($schema !== null && data_get($response, 'choices.0.finish_reason') === 'length') {
            throw new AiException('A resposta da IA foi cortada. Divida o PDF e tente novamente.', 422, 'pdf_incomplete');
        }

        return [
            'data' => $this->decode((string) data_get($response, 'choices.0.message.content', ''), data_get($response, 'choices.0.finish_reason')),
            'finish_reason' => data_get($response, 'choices.0.finish_reason'),
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
                ->timeout($credential['timeout'] ?? ($endpoint === 'images'
                    ? (int) config('services.ai.images.timeout', 120)
                    : (int) config('services.ai.timeout', 90)));
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

    /** Aceita JSON puro, dentro de bloco ```json``` ou cercado de texto. */
    private function decode(string $content, ?string $finishReason = null): array
    {
        $content = trim($content);
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/s', $content, $m)) {
            $content = $m[1];
        }

        $decoded = json_decode($content, true);
        if (! is_array($decoded)) {
            $start = strpos($content, '{');
            $end = strrpos($content, '}');
            if ($start !== false && $end > $start) {
                $decoded = json_decode(substr($content, $start, $end - $start + 1), true);
            }
        }
        if (! is_array($decoded)) {
            Log::warning('IA: resposta não é JSON', ['finish_reason' => $finishReason, 'length' => strlen($content)]);
            throw $finishReason === 'length'
                ? new AiException('A resposta da IA foi cortada. Tente novamente.', 502, 'ai_invalid_response')
                : AiException::invalidResponse();
        }

        return $decoded;
    }
}
