<?php

namespace Tests\Feature;

use App\Models\SaasPlan;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class SaasPerStudentBillingTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_app_students_follow_the_price_schedule_and_gestao_is_optional(): void
    {
        Carbon::setTestNow('2026-11-18 15:00:00');
        $tenant = Tenant::factory()->create();
        $this->studentWithApp($tenant);
        $this->studentWithApp($tenant);
        Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno', 'status' => 'inactive'])->id,
        ]);
        Student::factory()->create(['tenant_id' => $tenant->id, 'user_id' => null]);

        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson('/api/saas/plans', $this->planPayload())->assertCreated()
            ->assertJsonPath('body.billing_basis', 'per_student')
            ->assertJsonPath('body.gestao_price_monthly', '0.00');

        $plan = SaasPlan::query()->where('billing_basis', 'per_student')->where('name', 'Por aluno')->firstOrFail();
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", [
            'saas_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated()
            ->assertJsonPath('body.app_students', 2)
            ->assertJsonPath('body.unit_price', '0.00')
            ->assertJsonPath('body.monthly_revenue', '0.00')
            ->assertJsonPath('body.gestao_enabled', true);

        Carbon::setTestNow('2027-03-10 15:00:00');
        $this->getJson("/api/saas/tenants/{$tenant->id}/subscription")->assertOk()
            ->assertJsonPath('body.subscription.unit_price', '15.00')
            ->assertJsonPath('body.subscription.monthly_revenue', '30.00');

        Carbon::setTestNow('2027-07-15 15:00:00');
        $this->getJson("/api/saas/tenants/{$tenant->id}/subscription")->assertOk()
            ->assertJsonPath('body.subscription.unit_price', '20.00')
            ->assertJsonPath('body.subscription.monthly_revenue', '40.00');

        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription/pricing", [
            'gestao_enabled' => true,
            'gestao_price_monthly' => 10,
            'price' => 15,
            'price_schedule' => [
                ['from' => '2027-01-01', 'until' => '2027-06-30', 'price' => 15],
                ['from' => '2027-07-01', 'until' => null, 'price' => 25],
            ],
        ])->assertOk()
            ->assertJsonPath('body.unit_price', '25.00')
            ->assertJsonPath('body.monthly_revenue', '60.00')
            ->assertJsonPath('body.gestao_price_monthly', '10.00');
    }

    public function test_billing_preview_explains_app_students_gestao_and_free_panel(): void
    {
        Carbon::setTestNow('2027-03-10 15:00:00');
        $tenant = Tenant::factory()->create(['name' => 'Conectivo Preview']);
        $this->studentWithApp($tenant);
        $this->studentWithApp($tenant);
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson('/api/saas/plans', $this->planPayload())->assertCreated();
        $plan = SaasPlan::query()->where('name', 'Por aluno')->firstOrFail();
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", [
            'saas_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated();

        $this->getJson('/api/saas/billing/preview')->assertOk()
            ->assertJsonPath('body.competence', 'Março/2027')
            ->assertJsonPath('body.forecast', '30.00')
            ->assertJsonPath('body.billable_count', 1)
            ->assertJsonPath('body.rows.0.tenant.name', 'Conectivo Preview')
            ->assertJsonPath('body.rows.0.app_students', 2)
            ->assertJsonPath('body.rows.0.total', '30.00')
            ->assertJsonPath('body.rows.0.lines.0.label', 'Acesso ao app')
            ->assertJsonPath('body.rows.0.lines.0.amount', '30.00')
            ->assertJsonPath('body.rows.0.lines.1.label', 'Painel')
            ->assertJsonPath('body.rows.0.lines.1.amount', '0.00')
            ->assertJsonPath('body.rows.0.lines.2.detail', 'contratado grátis');
    }

    public function test_annual_contract_closes_each_month_and_leaves_ai_to_the_client(): void
    {
        Carbon::setTestNow('2026-11-18 15:00:00');
        $tenant = Tenant::factory()->create();
        $this->studentWithApp($tenant);
        $this->studentWithApp($tenant);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->postJson('/api/saas/plans', $this->planPayload([
            'name' => 'Contrato 2026',
            'price_schedule' => [
                ['from' => '2026-01-01', 'until' => '2026-06-30', 'price' => 15],
                ['from' => '2026-07-01', 'until' => '2026-12-31', 'price' => 20],
            ],
        ]))->assertCreated();
        $plan = SaasPlan::query()->where('name', 'Contrato 2026')->firstOrFail();
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", [
            'saas_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated();

        $this->getJson('/api/saas/billing/year?year=2026')->assertOk()
            ->assertJsonPath('body.ai_billed', false)
            ->assertJsonPath('body.rows.0.months.2.competence', '2026-03')
            ->assertJsonPath('body.rows.0.months.2.unit_price', '15.00')
            ->assertJsonPath('body.rows.0.months.2.total', '30.00')
            ->assertJsonPath('body.rows.0.months.2.status', 'preview')
            ->assertJsonPath('body.rows.0.months.6.unit_price', '20.00')
            ->assertJsonPath('body.rows.0.months.6.total', '40.00')
            ->assertJsonPath('body.rows.0.months.11.status', 'forecast')
            ->assertJsonPath('body.rows.0.months.11.can_close', false);

        $this->postJson('/api/saas/billing/closes', [
            'tenant_id' => $tenant->id,
            'competence' => '2026-03',
        ])->assertOk()->assertJsonPath('body.total', '30.00');

        $this->studentWithApp($tenant);

        $this->getJson('/api/saas/billing/year?year=2026')->assertOk()
            ->assertJsonPath('body.rows.0.months.2.status', 'closed')
            ->assertJsonPath('body.rows.0.months.2.total', '30.00')
            ->assertJsonPath('body.rows.0.months.2.app_students', 2)
            ->assertJsonPath('body.rows.0.months.10.total', '60.00')
            ->assertJsonPath('body.rows.0.months.10.app_students', 3);

        $this->postJson('/api/saas/billing/closes', [
            'tenant_id' => $tenant->id,
            'competence' => '2026-03',
        ])->assertUnprocessable();
        $this->postJson('/api/saas/billing/closes', [
            'tenant_id' => $tenant->id,
            'competence' => '2026-12',
        ])->assertUnprocessable();
    }

    public function test_test_students_marked_on_the_tenant_stay_out_of_open_months(): void
    {
        Carbon::setTestNow('2026-11-18 15:00:00');
        $tenant = Tenant::factory()->create();
        $this->studentWithApp($tenant);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno', 'status' => 'active']);
        $testStudent = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'status' => 'active',
            'name' => 'Aluno Teste',
        ]);
        Sanctum::actingAs(User::factory()->superAdmin()->create());

        $this->postJson('/api/saas/plans', $this->planPayload([
            'name' => 'Contrato testes',
            'price_schedule' => [
                ['from' => '2026-01-01', 'until' => '2026-06-30', 'price' => 15],
                ['from' => '2026-07-01', 'until' => '2026-12-31', 'price' => 20],
            ],
        ]))->assertCreated();
        $plan = SaasPlan::query()->where('name', 'Contrato testes')->firstOrFail();
        $this->postJson("/api/saas/tenants/{$tenant->id}/subscription", [
            'saas_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated()->assertJsonPath('body.app_students', 2);

        $this->getJson("/api/saas/tenants/{$tenant->id}/billing-exclusions?search=teste")
            ->assertOk()
            ->assertJsonPath('body.matches.0.id', $testStudent->id)
            ->assertJsonPath('body.matches.0.excluded', false);

        $this->putJson("/api/saas/tenants/{$tenant->id}/billing-exclusions/{$testStudent->id}", ['excluded' => true])
            ->assertOk()
            ->assertJsonPath('body.excluded', true);

        $this->getJson("/api/saas/tenants/{$tenant->id}/subscription")
            ->assertOk()
            ->assertJsonPath('body.subscription.app_students', 1);

        $this->getJson('/api/saas/billing/year?year=2026')->assertOk()
            ->assertJsonPath('body.rows.0.test_students', 1)
            ->assertJsonPath('body.rows.0.months.10.app_students', 1)
            ->assertJsonPath('body.rows.0.months.10.total', '20.00');

        $this->postJson('/api/saas/billing/closes', [
            'tenant_id' => $tenant->id,
            'competence' => '2026-11',
        ])->assertOk()->assertJsonPath('body.app_students', 1);

        $this->putJson("/api/saas/tenants/{$tenant->id}/billing-exclusions/{$testStudent->id}", ['excluded' => false])
            ->assertOk();

        $this->getJson('/api/saas/billing/year?year=2026')->assertOk()
            ->assertJsonPath('body.rows.0.test_students', 0)
            ->assertJsonPath('body.rows.0.months.10.app_students', 1)
            ->assertJsonPath('body.rows.0.months.9.app_students', 2);
    }

    public function test_overlapping_price_schedule_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->superAdmin()->create());
        $this->postJson('/api/saas/plans', $this->planPayload([
            'price_schedule' => [
                ['from' => '2027-01-01', 'until' => '2027-08-01', 'price' => 15],
                ['from' => '2027-07-01', 'until' => null, 'price' => 20],
            ],
        ]))->assertUnprocessable()->assertJsonValidationErrors('price_schedule');
    }

    private function studentWithApp(Tenant $tenant): void
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno', 'status' => 'active']);
        Student::factory()->create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'status' => 'active']);
    }

    /** @param  array<string, mixed>  $override */
    private function planPayload(array $override = []): array
    {
        return $override + [
            'name' => 'Por aluno',
            'price_monthly' => 15,
            'trial_days' => 0,
            'status' => 'active',
            'billing_basis' => 'per_student',
            'offer_gestao' => true,
            'gestao_price_monthly' => 0,
            'features' => ['academic'],
            'limits' => [],
            'price_schedule' => [
                ['from' => '2027-01-01', 'until' => '2027-06-30', 'price' => 15],
                ['from' => '2027-07-01', 'until' => null, 'price' => 20],
            ],
        ];
    }
}
