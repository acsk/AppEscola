<?php

namespace App\Services\Ai;

use App\Models\TenantAiCredential;

/** Cadastro das chaves de IA do tenant. Respostas nunca incluem a chave, só key_hint. */
class AiCredentialService
{
    /** @return array<int, array<string, mixed>> um item por provedor (configurado ou não) */
    public function list(int $tenantId): array
    {
        $credentials = TenantAiCredential::query()->where('tenant_id', $tenantId)->get()->keyBy('provider');

        return array_map(
            fn (string $provider) => $this->payload($provider, $credentials->get($provider)),
            TenantAiCredential::PROVIDERS
        );
    }

    /**
     * Cria ou atualiza a chave do provedor. Sem api_key, só altera modelo/ativo (exige chave já cadastrada).
     *
     * @param  array{api_key?: string|null, model?: string|null, active?: bool}  $data
     */
    public function save(int $tenantId, string $provider, array $data): array
    {
        $credential = TenantAiCredential::firstOrNew(['tenant_id' => $tenantId, 'provider' => $provider]);

        $apiKey = trim((string) ($data['api_key'] ?? ''));
        if ($apiKey !== '') {
            $credential->api_key = $apiKey;
            $credential->key_hint = TenantAiCredential::hintFor($apiKey);
            $credential->configured_at = now();
        }
        if (array_key_exists('model', $data)) {
            $credential->model = trim((string) $data['model']) ?: null;
        }
        if (array_key_exists('active', $data)) {
            $credential->active = (bool) $data['active'];
        }
        $credential->save();

        return $this->payload($provider, $credential);
    }

    public function delete(int $tenantId, string $provider): bool
    {
        return TenantAiCredential::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->delete() > 0;
    }

    public function exists(int $tenantId, string $provider): bool
    {
        return TenantAiCredential::query()->where('tenant_id', $tenantId)->where('provider', $provider)->exists();
    }

    private function payload(string $provider, ?TenantAiCredential $credential): array
    {
        return [
            'provider'      => $provider,
            'configured'    => $credential !== null,
            'active'        => (bool) ($credential?->active ?? false),
            'key_hint'      => $credential?->key_hint,
            'model'         => $credential?->model,
            'default_model' => (string) config("services.ai.{$provider}.model"),
            'configured_at' => $credential?->configured_at?->toISOString(),
        ];
    }
}
