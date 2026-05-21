<?php

namespace App\Services\Asaas;

use App\Models\Tenant;
use App\Models\TenantAsaasCredential;
use RuntimeException;

class AsaasCredentialService
{
    public function normalizeEnvironment(string $environment): string
    {
        $env = strtolower(trim($environment));

        return in_array($env, ['prod', 'production'], true) ? 'prod' : 'stage';
    }

    public function findForTenant(Tenant $tenant, string $environment): ?TenantAsaasCredential
    {
        $environment = $this->normalizeEnvironment($environment);

        return $tenant->asaasCredentials()
            ->where('environment', $environment)
            ->where('active', true)
            ->first();
    }

    public function findByWebhookToken(string $token): ?TenantAsaasCredential
    {
        $token = trim($token);

        if ($token === '') {
            return null;
        }

        $hash = TenantAsaasCredential::hashWebhookToken($token);

        return TenantAsaasCredential::query()
            ->where('webhook_token_hash', $hash)
            ->where('active', true)
            ->first();
    }

    public function isConfiguredForTenant(Tenant $tenant, string $environment): bool
    {
        return $this->findForTenant($tenant, $environment) !== null
            || $this->hasGlobalFallback();
    }

    public function hasGlobalFallback(): bool
    {
        return trim((string) config('asaas.api_key', '')) !== '';
    }

    /**
     * @return array{api_key: string, base_url: string, webhook_token: string|null, source: string}
     */
    public function resolveConfig(Tenant $tenant, string $environment): array
    {
        $environment = $this->normalizeEnvironment($environment);
        $credential = $this->findForTenant($tenant, $environment);

        if ($credential) {
            $apiKey = trim((string) $credential->api_key);
            $baseUrl = rtrim(trim((string) ($credential->base_url ?: '')), '/');

            if ($baseUrl === '') {
                $baseUrl = $this->defaultBaseUrlForEnvironment($environment);
            }

            if ($apiKey === '') {
                throw new RuntimeException('Credencial Asaas do tenant sem API key válida.');
            }

            return [
                'api_key' => $apiKey,
                'base_url' => $baseUrl,
                'webhook_token' => $credential->webhook_token ? trim((string) $credential->webhook_token) : null,
                'source' => 'tenant',
                'credential_id' => $credential->id,
            ];
        }

        if ($this->hasGlobalFallback()) {
            return [
                'api_key' => trim((string) config('asaas.api_key', '')),
                'base_url' => $this->resolveGlobalBaseUrl($environment),
                'webhook_token' => trim((string) config('asaas.webhook_token', '')) ?: null,
                'source' => 'global',
                'credential_id' => null,
            ];
        }

        throw new RuntimeException(
            'Integração Asaas não configurada para este tenant. Cadastre as credenciais em Configurações → Provedor Asaas.'
        );
    }

    public function persist(
        Tenant $tenant,
        string $environment,
        string $apiKey,
        ?string $webhookToken = null,
        ?string $baseUrl = null,
    ): TenantAsaasCredential {
        $environment = $this->normalizeEnvironment($environment);
        $apiKey = trim($apiKey);

        if ($apiKey === '') {
            throw new RuntimeException('API key do Asaas é obrigatória.');
        }

        $webhookHash = null;
        $normalizedWebhook = $webhookToken !== null ? trim($webhookToken) : null;

        if ($normalizedWebhook !== null && $normalizedWebhook !== '') {
            $webhookHash = TenantAsaasCredential::hashWebhookToken($normalizedWebhook);
        }

        $normalizedBaseUrl = $baseUrl !== null ? rtrim(trim($baseUrl), '/') : null;
        if ($normalizedBaseUrl === '') {
            $normalizedBaseUrl = null;
        }

        return TenantAsaasCredential::query()->updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
            ],
            [
                'api_key' => $apiKey,
                'webhook_token' => $normalizedWebhook,
                'webhook_token_hash' => $webhookHash,
                'base_url' => $normalizedBaseUrl,
                'active' => true,
                'configured_at' => now(),
            ]
        );
    }

    public function defaultBaseUrlForEnvironment(string $environment): string
    {
        $environment = $this->normalizeEnvironment($environment);
        $urls = (array) config('asaas.environment_urls', []);

        return rtrim((string) ($urls[$environment] ?? $urls['stage'] ?? 'https://api-sandbox.asaas.com/v3'), '/');
    }

    private function resolveGlobalBaseUrl(string $environment): string
    {
        $configured = rtrim(trim((string) config('asaas.base_url', '')), '/');

        if ($configured !== '') {
            return $configured;
        }

        return $this->defaultBaseUrlForEnvironment($environment);
    }
}
