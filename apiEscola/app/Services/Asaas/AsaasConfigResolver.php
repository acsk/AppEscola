<?php

namespace App\Services\Asaas;

use App\Models\Tenant;
use App\Models\TenantAsaasCredential;

class AsaasConfigResolver
{
    public function __construct(private readonly AsaasCredentialService $credentials)
    {
    }

    public function resolveApiKey(Tenant $tenant, string $environment = 'stage'): string
    {
        return $this->credentials->resolveConfig($tenant, $environment)['api_key'];
    }

    public function resolveBaseUrl(Tenant $tenant, string $environment = 'stage'): string
    {
        return $this->credentials->resolveConfig($tenant, $environment)['base_url'];
    }

    public function resolveWebhookToken(Tenant $tenant, string $environment = 'stage'): string
    {
        $token = $this->credentials->resolveConfig($tenant, $environment)['webhook_token'] ?? '';

        return trim($token);
    }

    public function isConfiguredForTenant(Tenant $tenant, string $environment = 'stage'): bool
    {
        return $this->credentials->isConfiguredForTenant($tenant, $environment);
    }

    public function isConfigured(?Tenant $tenant = null, string $environment = 'stage'): bool
    {
        if ($tenant instanceof Tenant) {
            return $this->isConfiguredForTenant($tenant, $environment);
        }

        return $this->credentials->hasGlobalFallback();
    }

    public function validateWebhookToken(string $token): bool
    {
        $token = trim($token);

        if ($token === '') {
            return false;
        }

        if (TenantAsaasCredential::query()->where('webhook_token_hash', TenantAsaasCredential::hashWebhookToken($token))->exists()) {
            return true;
        }

        $global = trim((string) config('asaas.webhook_token', ''));

        return $global !== '' && hash_equals($global, $token);
    }
}
