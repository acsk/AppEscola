<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\SaasFeature;
use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasCommercialTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function plan(array $attrs = []): SaasPlan
    {
        return SaasPlan::query()->create($attrs + [
            'name' => 'Plano '.uniqid(), 'slug' => uniqid('p'), 'price_monthly' => 100, 'trial_days' => 0,
            'status' => 'active', 'features' => ['academic'], 'limits' => [],
        ]);
    }

    private function subscribe(Tenant $tenant, SaasPlan $plan, array $extra = []): void
    {
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", ['saas_plan_id' => $plan->id, 'billing_cycle' => 'monthly'] + $extra)->assertCreated();
    }

    public function test_blocked_user_loses_open_session(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $token = $admin->createToken('api-token')->plainTextToken;
        $this->withToken($token)->getJson('/api/me')->assertOk();

        $admin->update(['status' => 'inactive']);
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/me')->assertUnauthorized()->assertJsonPath('code', 'user_blocked');
        $this->assertSame(0, PersonalAccessToken::query()->where('tokenable_id', $admin->id)->count());
    }

    public function test_blocking_through_user_management_revokes_tokens(): void
    {
        $tenant = Tenant::factory()->create();
        $target = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'professor', 'status' => 'active']);
        $target->createToken('api-token');
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->putJson("/api/users/{$target->id}", ['status' => 'inactive'])->assertOk();
        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_suspended_tenant_blocks_students_and_is_read_only_for_staff(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'suspended']);
        $student = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno', 'status' => 'active']);
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        Sanctum::actingAs($student);
        $this->getJson('/api/me')->assertUnauthorized()->assertJsonPath('code', 'tenant_suspended');

        Sanctum::actingAs($admin);
        $this->getJson('/api/courses')->assertOk();
        $this->postJson('/api/courses', ['name' => 'Novo'])->assertForbidden()->assertJsonPath('code', 'tenant_suspended');
        $this->postJson('/api/logout')->assertOk();
    }

    public function test_student_of_suspended_tenant_cannot_log_in(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'suspended']);
        User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno', 'status' => 'active', 'email' => 'aluno@x.com', 'password' => 'segredo123']);

        $this->postJson('/api/login', ['login' => 'aluno@x.com', 'password' => 'segredo123'])->assertForbidden()->assertJsonPath('code', 'tenant_suspended');
    }

    public function test_plan_endpoints_are_super_admin_only(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenant->id]));
        $this->getJson('/api/saas/plans')->assertForbidden();

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson('/api/saas/plans', [
            'name' => 'Básico', 'price_monthly' => 199.9, 'trial_days' => 14, 'status' => 'active',
            'features' => ['academic', 'exams'], 'limits' => ['students' => 100, 'courses' => ''],
        ])->assertCreated()->assertJsonPath('body.slug', 'basico')->assertJsonPath('body.limits.students', 100)->assertJsonPath('body.limits.courses', null);
    }

    public function test_feature_gate_follows_plan_override_and_global_status(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/bi/meta')->assertOk(); // legado: tudo liberado

        $this->subscribe($tenant, $this->plan(['features' => ['academic']]));
        Sanctum::actingAs($admin);
        $this->getJson('/api/bi/meta')->assertForbidden()->assertJsonPath('code', 'feature_unavailable');

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->putJson("/api/saas/tenants/{$tenant->id}/features/bi", ['enabled' => true, 'reason' => 'Piloto'])->assertOk();
        Sanctum::actingAs($admin);
        $this->getJson('/api/bi/meta')->assertOk();

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->putJson('/api/saas/features/bi', ['global_status' => 'disabled'])->assertOk();
        Sanctum::actingAs($admin);
        $this->getJson('/api/bi/meta')->assertForbidden();
        $this->assertSame('disabled', SaasFeature::query()->where('key', 'bi')->value('global_status'));
    }

    public function test_quota_blocks_only_creation(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id]);
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $this->subscribe($tenant, $this->plan(['limits' => ['courses' => 1]]));

        Sanctum::actingAs($admin);
        $this->postJson('/api/courses', ['name' => 'Segundo'])->assertUnprocessable()->assertJsonPath('body.code', 'quota_exceeded');
        $this->putJson("/api/courses/{$course->id}", ['name' => 'Renomeado'])->assertOk();
        $this->getJson('/api/tenant/entitlements')->assertOk()->assertJsonPath('body.quota_alerts.0.resource', 'courses');

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->putJson("/api/saas/tenants/{$tenant->id}/quotas/courses", ['limit' => 5])->assertOk();
        Sanctum::actingAs($admin);
        $this->postJson('/api/courses', ['name' => 'Segundo'])->assertCreated();
    }

    public function test_downgrade_is_refused_when_usage_exceeds_new_limits(): void
    {
        $tenant = Tenant::factory()->create();
        Course::factory()->count(3)->create(['tenant_id' => $tenant->id]);
        $this->subscribe($tenant, $this->plan(['price_monthly' => 300]));
        $small = $this->plan(['price_monthly' => 50, 'limits' => ['courses' => 2]]);

        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription/change-plan", ['saas_plan_id' => $small->id, 'billing_cycle' => 'monthly'])
            ->assertUnprocessable()->assertJsonValidationErrors('saas_plan_id');
    }

    public function test_trial_expires_and_mrr_counts_only_paying(): void
    {
        $trialTenant = Tenant::factory()->create();
        $payingTenant = Tenant::factory()->create();
        $this->subscribe($trialTenant, $this->plan(), ['trial_days' => 7]);
        $this->subscribe($payingTenant, $this->plan(['price_monthly' => 200]), ['discount_percent' => 10]);

        Carbon::setTestNow(now()->addDays(10));
        $this->artisan('saas:expire-subscriptions')->assertSuccessful();
        $this->assertSame(TenantSubscription::EXPIRED, TenantSubscription::query()->where('tenant_id', $trialTenant->id)->value('status'));

        $this->getJson('/api/saas/dashboard?months=6')->assertOk()
            ->assertJsonPath('body.revenue.mrr', '180.00')
            ->assertJsonPath('body.revenue.active_subscriptions', 1);
    }
}
