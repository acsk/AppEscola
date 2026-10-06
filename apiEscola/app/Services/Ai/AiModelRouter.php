<?php

namespace App\Services\Ai;

use App\Exceptions\AiException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class AiModelRouter
{
    public const TEXT = 'TEXT';

    public const VISION = 'VISION';

    public const STRUCTURED_OUTPUT = 'STRUCTURED_OUTPUT';

    public const IMAGE_GENERATION = 'IMAGE_GENERATION';

    public const IMAGE_EDITING = 'IMAGE_EDITING';

    public function __construct(private readonly AiChatClient $client) {}

    public function vision(array $credential, string $system, string $prompt, array $images): array
    {
        return $this->execute($credential, self::VISION, fn (array $selected) => $this->client->jsonWithMetadata($selected, $system, $prompt, 0.2, $images));
    }

    public function image(array $credential, string $prompt, ?string $reference): array
    {
        return $this->execute($credential, self::IMAGE_GENERATION, function (array $selected) use ($prompt, $reference) {
            $payload = [
                'model' => $selected['model'],
                'prompt' => $prompt,
                'n' => 1,
                'provider' => $selected['provider_routing'],
            ];
            if ($reference !== null && in_array(self::IMAGE_EDITING, $selected['capabilities'], true)) {
                $payload['input_references'] = [['type' => 'image_url', 'image_url' => ['url' => $reference]]];
            }
            $response = $this->client->request($selected, 'images', $payload);
            $encoded = data_get($response, 'data.0.b64_json');
            if (! is_string($encoded) || $encoded === '') {
                throw AiException::invalidResponse();
            }

            return [
                'encoded' => $encoded,
                'model' => $selected['model'],
                'usage' => $response['usage'] ?? [],
                'id' => $response['id'] ?? null,
            ];
        });
    }

    private function execute(array $credential, string $capability, callable $action): array
    {
        if ($credential['provider'] !== 'openrouter') {
            throw new AiException('O pipeline de imagens exige uma chave ativa do OpenRouter.');
        }
        $vision = $capability === self::VISION;
        $primary = trim((string) config('services.ai.images.'.($vision ? 'vision_model' : 'model')));
        $fallbacks = config('services.ai.images.'.($vision ? 'vision_free_fallbacks' : 'free_fallbacks'), []);
        $models = array_values(array_unique(array_filter([$primary, ...array_slice($fallbacks, 0, 3)])));
        if ($primary === '') {
            throw new AiException('Configure o modelo de '.($vision ? 'visão' : 'imagem').' do OpenRouter.');
        }
        $failure = null;
        foreach ($models as $index => $model) {
            try {
                $selected = $this->select($credential, trim($model), $capability, $index > 0);

                return $action($selected);
            } catch (AiException $e) {
                $failure = $e;
                Log::warning('IA: modelo indisponível', ['model' => $model, 'capability' => $capability, 'code' => $e->errorCode]);
            }
        }

        throw $failure ?? AiException::provider();
    }

    private function select(array $credential, string $model, string $capability, bool $fallback): array
    {
        $image = $capability === self::IMAGE_GENERATION;
        $endpoint = ($image ? 'images/models/' : 'models/').implode('/', array_map('rawurlencode', explode('/', $model))).'/endpoints';
        $info = Cache::remember('ai-model:'.hash('sha256', $credential['base_url'].$endpoint), 300,
            fn () => $this->client->request($credential, $endpoint));
        $data = $image ? $info : ($info['data'] ?? []);
        $capabilities = [self::TEXT];
        if ($image) {
            $capabilities[] = self::IMAGE_GENERATION;
        } elseif (in_array('image', data_get($data, 'architecture.input_modalities', []), true)) {
            $capabilities[] = self::VISION;
        }
        if (! in_array($capability, $capabilities, true)) {
            throw new AiException("O modelo {$model} não suporta {$capability}.", 422, 'ai_model_capability');
        }

        foreach ($data['endpoints'] ?? [] as $endpointInfo) {
            if (isset($endpointInfo['status']) && $endpointInfo['status'] !== 0) {
                continue;
            }
            $parameters = $endpointInfo['supported_parameters'] ?? [];
            if (! $image && ! in_array('response_format', $parameters, true)) {
                continue;
            }
            $prices = $image
                ? array_column($endpointInfo['pricing'] ?? [], 'cost_usd')
                : array_values(array_diff_key($endpointInfo['pricing'] ?? [], array_flip(['discount'])));
            // Unknown pricing is not evidence that a fallback is free.
            $free = $prices !== [] && collect($prices)->every(fn ($price) => is_numeric($price) && (float) $price === 0.0);
            if (! $free && ($fallback || ! config('services.ai.images.allow_paid_primary', true))) {
                continue;
            }
            $provider = $image ? ($endpointInfo['provider_tag'] ?? null) : ($endpointInfo['tag'] ?? null);
            if (! is_string($provider) || $provider === '') {
                continue;
            }
            if ($image && (int) data_get($parameters, 'input_references.max', 0) > 0) {
                $capabilities[] = self::IMAGE_EDITING;
            }
            if (! $image) {
                $capabilities[] = self::STRUCTURED_OUTPUT;
            }

            return array_replace($credential, [
                'model' => $model,
                'capabilities' => $capabilities,
                'provider_routing' => ['only' => [$provider], 'allow_fallbacks' => false],
            ]);
        }

        throw new AiException("Nenhum endpoint ativo de {$model} atende às capabilities e à política de custo.", 422, 'ai_model_unavailable');
    }
}
