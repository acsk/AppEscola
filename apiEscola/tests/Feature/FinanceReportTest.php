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
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class FinanceReportTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_finance_report_filters_by_class_course_and_due_period(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $class = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
            'name' => 'Extensivo A',
        ]);
        $otherClass = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Outra turma',
        ]);

        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Ana Relatorio',
        ]);
        $otherStudent = Student::factory()->create(['tenant_id' => $tenant->id]);

        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'school_class_id' => $class->id,
        ]);
        $otherEnrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $otherStudent->id,
            'school_class_id' => $otherClass->id,
        ]);

        Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'enrollment_id' => $enrollment->id,
            'description' => 'Mensalidade outubro',
            'amount' => 150.50,
            'status' => 'paid',
            'payment_method' => 'pix',
            'type' => 'monthly',
            'due_date' => '2026-10-05',
            'paid_at' => '2026-10-06 10:00:00',
        ]);

        Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $otherStudent->id,
            'enrollment_id' => $otherEnrollment->id,
            'description' => 'Mensalidade setembro',
            'amount' => 80,
            'status' => 'pending',
            'type' => 'monthly',
            'due_date' => '2026-09-10',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/reports/finance?'.http_build_query([
            'date_basis' => 'due_date',
            'date_from' => '2026-10-01',
            'date_to' => '2026-10-31',
            'school_class_id' => $class->id,
            'course_id' => $course->id,
            'status' => 'paid',
            'payment_method' => 'pix',
            'type' => 'monthly',
            'search' => 'Ana',
        ]));

        $response->assertOk()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.totals.count', 1)
            ->assertJsonPath('body.totals.amount', '150.50')
            ->assertJsonPath('body.by_status.0.key', 'paid')
            ->assertJsonPath('body.by_status.0.count', 1)
            ->assertJsonPath('body.by_month.0.period', '2026-10')
            ->assertJsonPath('body.by_month.0.paid_amount', '150.50')
            ->assertJsonPath('body.by_payment_method.0.key', 'pix')
            ->assertJsonPath('body.by_type.0.key', 'monthly')
            ->assertJsonPath('body.by_class.0.name', 'Extensivo A')
            ->assertJsonPath('body.items.0.student_name', 'Ana Relatorio')
            ->assertJsonPath('body.meta.total', 1);
    }

    public function test_finance_report_rejects_unknown_date_basis_and_long_range(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/reports/finance?date_basis=issued_at')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['date_basis']);

        $this->actingAs($admin)
            ->getJson('/api/reports/finance?date_from=2024-01-01&date_to=2026-06-01')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'O período pode ter no máximo 24 meses.');
    }

    public function test_finance_report_denies_student_role(): void
    {
        $tenant = Tenant::factory()->create();
        $studentUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'aluno',
            'status' => 'active',
        ]);

        $this->actingAs($studentUser)
            ->getJson('/api/reports/finance')
            ->assertForbidden();
    }
}
