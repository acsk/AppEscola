<?php

namespace App\Services\Asaas;

use App\Models\Tenant;
use App\Models\TenantAsaasCredential;

/**
 * Contexto autenticado de uma chamada ao webhook Asaas.
 *
 * - source "tenant": o token pertence a uma credencial ativa; tenant e ambiente são conhecidos.
 * - source "global": token legado (ASAAS_WEBHOOK_TOKEN), só aceito com
 *   asaas.webhook_allow_global_token = true. Não há tenant: o processador o resolve pela
 *   cobrança e o confirma na API do Asaas antes de alterar qualquer fatura.
 */
final class AsaasWebhookContext
{
    public const SOURCE_TENANT = 'tenant';

    public const SOURCE_GLOBAL = 'global';

    private function __construct(
        public readonly string $source,
        public readonly ?Tenant $tenant,
        public readonly ?TenantAsaasCredential $credential,
        public readonly ?string $environment,
    ) {
    }

    public static function forCredential(TenantAsaasCredential $credential, Tenant $tenant): self
    {
        return new self(self::SOURCE_TENANT, $tenant, $credential, $credential->environment);
    }

    public static function forGlobalToken(): self
    {
        return new self(self::SOURCE_GLOBAL, null, null, null);
    }

    public function isGlobal(): bool
    {
        return $this->source === self::SOURCE_GLOBAL;
    }

    /** Escopo usado na chave de idempotência e nos logs. */
    public function scope(): string
    {
        return $this->tenant ? 'tenant:' . $this->tenant->id : 'global';
    }
}
