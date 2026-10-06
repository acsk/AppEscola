<?php

namespace App\Services\Ai;

use App\Models\TenantAiCredential;
use App\Models\User;

/**
 * Decide qual chave de IA usar na requisição:
 * - super admin: chaves do .env (config services.ai);
 * - demais usuários: chave ativa do tenant em tenant_ai_credentials (nunca a do .env).
 * Com as duas chaves disponíveis, vale services.ai.preferred_provider.
 */
class AiCredentialResolver
{
    /**
     * @return array{provider: string, api_key: string, base_url: string, model: string, source: string}|null
     */
    public function resolve(?User $user, ?int $tenantId): ?array
    {
        if ($user?->isSuperAdmin()) {
            return $this->fromEnv();
        }

        return $tenantId ? $this->fromTenant($tenantId) : null;
    }

    /** Resumo seguro (sem chave) para o painel saber se pode exibir os botões de IA. */
    public function status(?User $user, ?int $tenantId): array
    {
        $credential = $this->resolve($user, $tenantId);

        return [
            'available' => $credential !== null,
            'source'    => $credential['source'] ?? null,
            'provider'  => $credential['provider'] ?? null,
        ];
    }

    private function fromEnv(): ?array
    {
        foreach ($this->providerOrder() as $provider) {
            $key = trim((string) config("services.ai.{$provider}.api_key"));
            if ($key !== '') {
                return $this->credential($provider, $key, null, 'env');
            }
        }

        return null;
    }

    private function fromTenant(int $tenantId): ?array
    {
        $credentials = TenantAiCredential::query()
            ->where('tenant_id', $tenantId)
            ->where('active', true)
            ->get()
            ->keyBy('provider');

        foreach ($this->providerOrder() as $provider) {
            $credential = $credentials->get($provider);
            $key = $credential ? trim((string) $credential->api_key) : '';
            if ($key !== '') {
                return $this->credential($provider, $key, $credential->model, 'tenant');
            }
        }

        return null;
    }

    private function credential(string $provider, string $key, ?string $model, string $source): array
    {
        return [
            'provider' => $provider,
            'api_key'  => $key,
            'base_url' => rtrim((string) config("services.ai.{$provider}.base_url"), '/'),
            'model'    => $model ?: (string) config("services.ai.{$provider}.model"),
            'source'   => $source,
        ];
    }

    /** @return string[] */
    private function providerOrder(): array
    {
        $preferred = (string) config('services.ai.preferred_provider', 'openrouter');
        $order = TenantAiCredential::PROVIDERS;

        return in_array($preferred, $order, true)
            ? array_values(array_unique([$preferred, ...$order]))
            : $order;
    }
}
