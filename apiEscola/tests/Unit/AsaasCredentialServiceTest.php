<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Models\TenantAsaasCredential;
use App\Services\Asaas\AsaasConfigResolver;
use App\Services\Asaas\AsaasCredentialService;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AsaasCredentialServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function afterRefreshingDatabase(): void
    {
        $this->seed(DomainSeeder::class);
    }

    public function test_resolve_config_uses_tenant_credentials(): void
    {
        $tenant = Tenant::factory()->create();

        app(AsaasCredentialService::class)->persist(
            $tenant,
            'stage',
            '$aact_test_key_1234567890',
            'webhook-secret-token',
        );

        $config = app(AsaasConfigResolver::class);
        $this->assertTrue($config->isConfiguredForTenant($tenant, 'stage'));
        $this->assertSame('$aact_test_key_1234567890', $config->resolveApiKey($tenant, 'stage'));
        $this->assertTrue($config->validateWebhookToken('webhook-secret-token'));
    }

    public function test_webhook_token_hash_lookup(): void
    {
        $tenant = Tenant::factory()->create();
        $credential = app(AsaasCredentialService::class)->persist(
            $tenant,
            'stage',
            '$aact_test_key_1234567890',
            'my-webhook-token',
        );

        $this->assertSame(
            TenantAsaasCredential::hashWebhookToken('my-webhook-token'),
            $credential->webhook_token_hash
        );

        $found = app(AsaasCredentialService::class)->findByWebhookToken('my-webhook-token');
        $this->assertNotNull($found);
        $this->assertSame($tenant->id, $found->tenant_id);
    }
}
