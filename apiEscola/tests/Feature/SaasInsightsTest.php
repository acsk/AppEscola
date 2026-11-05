<?php

namespace Tests\Feature;

use App\Models\SaasAlert;
use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasInsightsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    private function plan(float $price): SaasPlan
    {
        return SaasPlan::query()->create(['name' => 'P'.$price, 'slug' => 'p'.(int) $price, 'price_monthly' => $price, 'trial_days' => 0, 'status' => 'active', 'features' => ['academic'], 'limits' => []]);
    }

    public function test_mrr_movements_and_projection(): void
    {
        $tenant = Tenant::factory()->create();
        $small = $this->plan(100);
        $big = $this->plan(300);
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $url = "/api/saas/tenants/{$tenant->id}/subscription";

        $this->postJson($url, ['saas_plan_id' => $small->id, 'billing_cycle' => 'monthly', 'trial_days' => 7])->assertCreated();
        $this->postJson("{$url}/renew")->assertOk();                                                  // teste → pagante: novo +100
        $this->postJson("{$url}/change-plan", ['saas_plan_id' => $big->id, 'billing_cycle' => 'monthly'])->assertOk(); // expansão +200
        $this->putJson("{$url}/discount", ['discount_percent' => 10])->assertOk();                   // contração −30

        $body = $this->getJson('/api/saas/insights')->assertOk()->json('body');
        $month = end($body['movements']);
        $this->assertEquals(100, $month['new']);
        $this->assertEquals(200, $month['expansion']);
        $this->assertEquals(-30, $month['contraction']);
        $this->assertEquals(270, $body['mrr']);
        $this->assertEquals(270, $body['net_new_mrr']);
        $this->assertCount(6, $body['projection']);

        $this->postJson("{$url}/cancel", ['reason' => 'Preço'])->assertOk();                          // churn −270
        \Illuminate\Support\Facades\Cache::forget('saas:insights');
        $month = collect($this->getJson('/api/saas/insights')->json('body.movements'))->last();
        $this->assertEquals(-270, $month['churn']);
        $this->assertEquals(0, $month['net']);
    }

    public function test_health_flags_inactive_tenant_as_risk(): void
    {
        $quiet = Tenant::factory()->create(['name' => 'Escola Parada']);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $item = collect($this->getJson('/api/saas/health')->assertOk()->json('body.items'))->firstWhere('tenant.id', $quiet->id);
        $this->assertSame('risk', $item['level']);
        $this->assertContains('Nenhum aluno ativo nos últimos 14 dias', $item['reasons']);
    }

    public function test_alerts_open_notify_once_resolve_and_are_super_admin_only(): void
    {
        Event::fake([MessageSent::class]);
        config(['mail.default' => 'array']);
        User::factory()->superAdmin()->create(['status' => 'active', 'email' => 'a@plataforma.com']);
        User::factory()->superAdmin()->create(['status' => 'inactive', 'email' => 'bloqueado@plataforma.com']);
        foreach (range(1, 5) as $i) {
            DB::table('failed_jobs')->insert(['uuid' => "u{$i}", 'connection' => 'database', 'queue' => 'default', 'payload' => '{}', 'exception' => 'Erro', 'failed_at' => now()]);
        }

        $this->artisan('saas:operational-alerts')->assertSuccessful();
        $alert = SaasAlert::query()->where('fingerprint', 'queue_failures')->sole();
        $this->assertSame('critical', $alert->severity);
        $this->assertNotNull($alert->notified_at);
        Event::assertDispatchedTimes(MessageSent::class, 1); // só o administrador ativo

        $this->artisan('saas:operational-alerts')->assertSuccessful();
        $this->assertSame(2, $alert->fresh()->occurrences);
        Event::assertDispatchedTimes(MessageSent::class, 1); // não repete o e-mail

        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenant->id]));
        $this->getJson('/api/saas/alerts')->assertForbidden();

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->getJson('/api/saas/alerts')->assertOk()->assertJsonPath('body.items.0.fingerprint', null)->assertJsonPath('body.counts.critical', 1);
        $this->postJson("/api/saas/alerts/{$alert->id}/acknowledge")->assertOk();
        $this->assertSame('acknowledged', $alert->fresh()->status);

        DB::table('failed_jobs')->delete();
        $this->artisan('saas:operational-alerts')->assertSuccessful();
        $this->assertSame('resolved', $alert->fresh()->status);
    }
}
