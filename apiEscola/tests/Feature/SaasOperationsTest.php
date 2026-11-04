<?php

namespace Tests\Feature;

use App\Models\SaasAuditLog;
use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasOperationsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    public function test_tenant_admin_cannot_reach_phase_three_endpoints(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenant->id]));

        foreach (['/api/saas/admins', '/api/saas/monitoring', '/api/saas/usage', '/api/saas/reports/commercial', '/api/saas/audit'] as $url) {
            $this->getJson($url)->assertForbidden();
        }
    }

    public function test_global_admin_lifecycle_with_safeguards(): void
    {
        $me = User::factory()->superAdmin()->create(['status' => 'active']);
        Sanctum::actingAs($me);

        // Único administrador ativo: não pode se bloquear.
        $this->putJson("/api/saas/admins/{$me->id}/status", ['status' => 'inactive'])->assertUnprocessable();

        $this->postJson('/api/saas/admins', ['name' => 'Ana', 'email' => 'ana@plataforma.com', 'password' => 'provisoria1', 'password_confirmation' => 'provisoria1'])->assertCreated();
        $ana = User::query()->where('email', 'ana@plataforma.com')->firstOrFail();
        $this->assertSame('super_admin', $ana->role);
        $this->assertNull($ana->tenant_id);
        $this->assertTrue((bool) $ana->password_change_required);

        $ana->createToken('api-token');
        $this->getJson("/api/saas/admins/{$ana->id}/sessions")->assertOk()->assertJsonCount(1, 'body.items');
        $this->putJson("/api/saas/admins/{$ana->id}/status", ['status' => 'inactive'])->assertOk();
        $this->assertSame(0, $ana->tokens()->count());

        // Ana bloqueada: eu volto a ser o único ativo.
        $this->putJson("/api/saas/admins/{$me->id}/status", ['status' => 'inactive'])->assertUnprocessable();

        $tenantUser = User::factory()->admin()->create(['tenant_id' => Tenant::factory()->create()->id]);
        $this->putJson("/api/saas/admins/{$tenantUser->id}/status", ['status' => 'inactive'])->assertNotFound();

        $this->assertSame(2, SaasAuditLog::query()->where('action', 'like', 'admin.%')->count());
    }

    public function test_monitoring_lists_failures_without_exposing_more_than_a_line(): void
    {
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        DB::table('failed_jobs')->insert([
            'uuid' => 'abc', 'connection' => 'database', 'queue' => 'default',
            'payload' => json_encode(['displayName' => 'App\\Jobs\\SendThing']),
            'exception' => "RuntimeException: boom\n#0 stack trace line", 'failed_at' => now(),
        ]);

        $this->getJson('/api/saas/monitoring')->assertOk()
            ->assertJsonPath('body.api.status', 'ok')
            ->assertJsonPath('body.queue.failed_24h', 1)
            ->assertJsonPath('body.incidents.0.title', 'SendThing falhou')
            ->assertJsonPath('body.incidents.0.detail', 'RuntimeException: boom');
    }

    public function test_reports_usage_and_audit(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Escola Alfa']);
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $plan = SaasPlan::query()->create(['name' => 'Pro', 'slug' => 'pro', 'price_monthly' => 300, 'trial_days' => 0, 'status' => 'active', 'features' => ['academic'], 'limits' => ['students' => 10]]);
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", ['saas_plan_id' => $plan->id, 'billing_cycle' => 'monthly'])->assertCreated();
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription/cancel", ['reason' => 'Preço'])->assertOk();

        $this->getJson('/api/saas/reports/commercial')->assertOk()->assertJsonPath('body.new_subscriptions.0.tenant', 'Escola Alfa');
        $this->getJson('/api/saas/reports/retention')->assertOk()->assertJsonPath('body.cancellations_by_reason.0.reason', 'Preço');
        $this->getJson('/api/saas/reports/operational')->assertOk()->assertJsonStructure(['body' => ['most_active', 'module_adoption']]);
        $this->getJson('/api/saas/reports/unknown')->assertNotFound();

        $this->getJson('/api/saas/usage')->assertOk()->assertJsonPath('body.items.0.resources.students.limit', 10);
        $this->getJson('/api/saas/audit?group=subscription')->assertOk()->assertJsonPath('body.meta.total', 2)->assertJsonPath('body.items.0.tenant.name', 'Escola Alfa');
    }
}
