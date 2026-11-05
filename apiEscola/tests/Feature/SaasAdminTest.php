<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasAdminTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    public function test_only_super_admin_reaches_saas_endpoints(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenant->id]));

        $this->getJson('/api/saas/dashboard')->assertForbidden();
        $this->getJson("/api/saas/tenants/{$tenant->id}/overview")->assertForbidden();
    }

    public function test_dashboard_counts_tenants_and_students(): void
    {
        $active = Tenant::factory()->create(['status' => 'active']);
        Tenant::factory()->create(['status' => 'suspended']);
        Student::factory()->count(3)->create(['tenant_id' => $active->id]);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->getJson('/api/saas/dashboard?months=6')
            ->assertOk()
            ->assertJsonPath('body.tenants.total', 2)
            ->assertJsonPath('body.tenants.active', 1)
            ->assertJsonPath('body.tenants.suspended', 1)
            ->assertJsonPath('body.students_total', 3)
            ->assertJsonCount(6, 'body.months')
            ->assertJsonPath('body.top_tenants.0.id', $active->id);

        $this->getJson('/api/saas/dashboard?months=6&status=suspended')
            ->assertOk()
            ->assertJsonPath('body.students_total', 0);

        $this->getJson('/api/saas/dashboard?months=7')->assertUnprocessable();
    }

    public function test_overview_hides_credentials(): void
    {
        $tenant = Tenant::factory()->create();
        Student::factory()->create(['tenant_id' => $tenant->id]);
        TenantAiCredential::query()->create([
            'tenant_id' => $tenant->id,
            'provider' => 'openrouter',
            'api_key' => 'sk-or-secret-000000000000',
            'key_hint' => '…0000',
            'active' => true,
        ]);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $response = $this->getJson("/api/saas/tenants/{$tenant->id}/overview")
            ->assertOk()
            ->assertJsonPath('body.counts.students', 1);
        $this->assertSame('…0000', collect($response->json('body.integrations'))->firstWhere('key', 'ai:openrouter')['hint']);

        $this->assertStringNotContainsString('sk-or-secret', $response->getContent());
    }

    public function test_tenant_list_has_counts_and_searches_cnpj(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Escola Alfa', 'cnpj' => '12.345.678/0001-90']);
        Tenant::factory()->create(['name' => 'Escola Beta']);
        Student::factory()->count(2)->create(['tenant_id' => $tenant->id]);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->getJson('/api/tenants?search=12345678')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $tenant->id)
            ->assertJsonPath('data.0.students_count', 2);
    }
}
