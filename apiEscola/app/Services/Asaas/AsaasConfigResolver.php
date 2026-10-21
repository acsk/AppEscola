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

    /** @deprecated Use authenticateWebhook(), que devolve o tenant dono do token. */
    public function validateWebhookToken(string $token): bool
    {
        return $this->authenticateWebhook($token) !== null;
    }

    /**
     * Identifica a credencial (e o tenant) dona do token do webhook.
     * Retorna null para token vazio, desconhecido, revogado, ambíguo ou de tenant inativo.
     */
    public function authenticateWebhook(string $token): ?AsaasWebhookContext
    {
        $token = trim($token);

        if ($token === '') {
            return null;
        }

        $matches = TenantAsaasCredential::query()
            ->where('webhook_token_hash', TenantAsaasCredential::hashWebhookToken($token))
            ->where('active', true)
            ->with('tenant')
            ->limit(2)
            ->get();

        // O mesmo token em duas credenciais não identifica o tenant de forma inequívoca.
        if ($matches->count() === 1) {
            $credential = $matches->first();
            $tenant = $credential->tenant;

            if (! $tenant || $tenant->status !== 'active') {
                return null;
            }

            // Confirma em tempo constante contra o token armazenado (o hash serve só para a busca).
            if (! hash_equals(trim((string) $credential->webhook_token), $token)) {
                return null;
            }

            return AsaasWebhookContext::forCredential($credential, $tenant);
        }

        if ($matches->count() > 1) {
            return null;
        }

        $global = trim((string) config('asaas.webhook_token', ''));

        if ($global !== '' && hash_equals($global, $token) && (bool) config('asaas.webhook_allow_global_token', false)) {
            return AsaasWebhookContext::forGlobalToken();
        }

        return null;
    }
}
