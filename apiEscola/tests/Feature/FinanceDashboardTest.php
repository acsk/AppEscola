<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class FinanceDashboardTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_dashboard_kpis_follow_documented_definitions(): void
    {
        Carbon::setTestNow('2026-11-03 10:00:00');

        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        $course = Course::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Militares']);
        $class = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $course->id]);
        $studentA = Student::factory()->create(['tenant_id' => $tenant->id]);
        $studentB = Student::factory()->create(['tenant_id' => $tenant->id]);
        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $studentA->id,
            'school_class_id' => $class->id,
        ]);

        $make = fn (array $attrs) => Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'student_id' => $studentB->id,
            'type' => 'monthly',
        ], $attrs));

        // Pagas em outubro
        $make(['student_id' => $studentA->id, 'enrollment_id' => $enrollment->id, 'amount' => 200, 'status' => 'paid', 'payment_method' => 'pix', 'due_date' => '2026-10-05', 'paid_at' => '2026-10-06 09:00:00']);
        $make(['amount' => 100, 'status' => 'paid', 'payment_method' => 'bank_slip', 'due_date' => '2026-10-10', 'paid_at' => '2026-10-12 09:00:00']);
        // Vencida há 14 dias: entra na inadimplência
        $make(['amount' => 150, 'status' => 'pending', 'due_date' => '2026-10-20']);
        // Vencida há 4 dias: vencida, mas ainda dentro da carência da inadimplência
        $make(['amount' => 80, 'status' => 'pending', 'due_date' => '2026-10-30']);
        // A vencer em 7 dias
        $make(['amount' => 300, 'status' => 'pending', 'due_date' => '2026-11-10']);
        // Cancelada: fora de tudo
        $make(['amount' => 500, 'status' => 'cancelled', 'due_date' => '2026-10-15']);
        // Importada pelo sync Cora: fora de tudo
        $make(['amount' => 999, 'status' => 'pending', 'due_date' => '2026-10-01', 'cora_payload' => ['integration' => ['origin' => 'cora_sync']]]);
        // Período anterior (setembro)
        $make(['student_id' => $studentA->id, 'amount' => 250, 'status' => 'paid', 'payment_method' => 'pix', 'due_date' => '2026-09-10', 'paid_at' => '2026-09-15 09:00:00']);

        // Outro tenant: nunca pode aparecer
        $otherTenant = Tenant::factory()->create();
        Invoice::factory()->create([
            'tenant_id' => $otherTenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $otherTenant->id])->id,
            'amount' => 1000,
            'status' => 'paid',
            'payment_method' => 'pix',
            'due_date' => '2026-10-10',
            'paid_at' => '2026-10-10 09:00:00',
        ]);

        $response = $this->actingAs($admin)
            ->getJson('/api/finance/dashboard?date_from=2026-10-01&date_to=2026-10-31')
            ->assertOk()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.period.previous_from', '2026-09-01')
            ->assertJsonPath('body.period.previous_to', '2026-09-30')
            ->assertJsonPath('body.kpis.receivable.amount', '530.00')
            ->assertJsonPath('body.kpis.receivable.count', 3)
            ->assertJsonPath('body.kpis.received.amount', '300.00')
            ->assertJsonPath('body.kpis.received.count', 2)
            ->assertJsonPath('body.kpis.received.previous_amount', '250.00')
            ->assertJsonPath('body.kpis.received.delta_pct', '20.0')
            ->assertJsonPath('body.kpis.overdue.amount', '230.00')
            ->assertJsonPath('body.kpis.overdue.count', 2)
            ->assertJsonPath('body.kpis.forecast_30d.amount', '300.00')
            ->assertJsonPath('body.kpis.average_ticket.amount', '150.00')
            ->assertJsonPath('body.kpis.average_ticket.payers', 2)
            ->assertJsonPath('body.kpis.average_ticket.previous_amount', '250.00')
            ->assertJsonPath('body.kpis.delinquency.due_amount', '450.00')
            ->assertJsonPath('body.kpis.delinquency.overdue_amount', '150.00')
            ->assertJsonPath('body.kpis.delinquency.rate', '33.3')
            ->assertJsonPath('body.kpis.delinquency.previous_rate', '0.0')
            ->assertJsonPath('body.kpis.pending.count', 3)
            ->assertJsonPath('body.kpis.pending.due_next_7_days', 1)
            ->assertJsonPath('body.kpis.reconciled.available', false)
            ->assertJsonPath('body.charts.aging.0.key', '1_15')
            ->assertJsonPath('body.charts.aging.0.amount', '230.00')
            ->assertJsonPath('body.charts.aging.3.amount', '0.00')
            ->assertJsonPath('body.charts.by_payment_method.0.key', 'pix')
            ->assertJsonPath('body.charts.by_payment_method.0.amount', '200.00')
            ->assertJsonPath('body.charts.by_course.0.amount', '200.00')
            ->assertJsonPath('body.charts.by_course.1.name', 'Sem curso');

        // O model normaliza nomes de curso em maiúsculas.
        $this->assertSame('MILITARES', mb_strtoupper($response->json('body.charts.by_course.0.name')));

        $monthly = collect($response->json('body.charts.monthly'));
        $this->assertCount(6, $monthly);
        $this->assertSame('2026-10', $monthly->last()['period']);
        $this->assertSame('530.00', $monthly->last()['expected_amount']);
        $this->assertSame('300.00', $monthly->last()['received_amount']);
        $this->assertSame('250.00', $monthly->firstWhere('period', '2026-09')['received_amount']);

        $this->assertContains('finance.configure', $response->json('body.permissions'));
    }

    public function test_dashboard_validates_period(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        $this->actingAs($admin)
            ->getJson('/api/finance/dashboard?date_from=2026-10-31&date_to=2026-10-01')
            ->assertUnprocessable();

        $this->actingAs($admin)
            ->getJson('/api/finance/dashboard?date_from=2025-01-01&date_to=2026-06-01')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'O período pode ter no máximo 366 dias.');
    }

    public function test_roles_without_finance_permission_cannot_reach_finance_or_invoices(): void
    {
        $tenant = Tenant::factory()->create();
        $invoice = Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => Student::factory()->create(['tenant_id' => $tenant->id])->id,
        ]);

        foreach (['aluno', 'responsavel', 'professor', 'coordenador'] as $role) {
            $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role, 'status' => 'active']);

            $this->actingAs($user)->getJson('/api/finance/dashboard')->assertForbidden();
            $this->actingAs($user)->getJson('/api/reports/finance')->assertForbidden();
            $this->actingAs($user)->getJson('/api/invoices')->assertForbidden();
            $this->actingAs($user)->getJson('/api/invoices/summary')->assertForbidden();
            $this->actingAs($user)->getJson("/api/invoices/{$invoice->id}")->assertForbidden();
            // 403 antes da validação do Form Request (não 422)
            $this->actingAs($user)->postJson('/api/invoices', [])->assertForbidden();
            $this->actingAs($user)->postJson("/api/invoices/{$invoice->id}/mark-as-paid", [])->assertForbidden();
            $this->actingAs($user)->postJson("/api/invoices/{$invoice->id}/cancel", [])->assertForbidden();
        }
    }

    public function test_staff_roles_keep_invoice_access(): void
    {
        $tenant = Tenant::factory()->create();

        foreach (['admin', 'secretaria'] as $role) {
            $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role, 'status' => 'active']);

            $this->actingAs($user)->getJson('/api/invoices')->assertOk();
            $this->actingAs($user)->getJson('/api/finance/dashboard')->assertOk();
        }

        $secretaria = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'secretaria', 'status' => 'active']);
        $permissions = $this->actingAs($secretaria)->getJson('/api/finance/dashboard')->json('body.permissions');
        $this->assertNotContains('finance.configure', $permissions);
    }
}
