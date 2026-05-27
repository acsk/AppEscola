<?php

namespace Tests\Unit;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\StudentAppAccessDiagnosticService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentAppAccessDiagnosticServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_report_flags_paid_enrollment_fee_without_user(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => null,
            'enrollment_number' => '202600100',
        ]);

        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'status' => 'active',
        ]);

        Invoice::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'enrollment_id' => $enrollment->id,
            'type' => 'enrollment_fee',
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        $report = app(StudentAppAccessDiagnosticService::class)->report($tenant->id);

        $this->assertSame(1, $report['summary']['without_app_user']);
        $this->assertSame(1, $report['summary']['with_paid_enrollment_fee_without_user']);
        $this->assertStringContainsString('NÃO ativa login', $report['conclusion']['payment_activation']);
    }
}
