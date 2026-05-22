<?php

namespace Tests\Unit;

use App\Models\Course;
use App\Models\CourseBundle;
use App\Models\Enrollment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Services\StudentPerformanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class StudentPerformanceServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_empty_student_returns_zeroed_structure(): void
    {
        $student = Student::factory()->create();

        $service = new StudentPerformanceService;
        $result = $service->build($student, 3);

        $this->assertSame($student->id, $result['student_id']);
        $this->assertSame($student->id, $result['student']['id']);
        $this->assertSame($student->name, $result['student']['name']);
        $this->assertSame(3, $result['months']);
        $this->assertSame(0, $result['overview']['total_attempts']);
        $this->assertCount(3, $result['monthly_evolution']);
        $this->assertSame([], $result['by_subject']);
    }

    public function test_active_enrollments_payload_includes_bundle_and_classes(): void
    {
        $student = Student::factory()->create();
        $tenantId = $student->tenant_id;

        $courseA = Course::factory()->create(['tenant_id' => $tenantId, 'name' => 'IFAL']);
        $courseB = Course::factory()->create(['tenant_id' => $tenantId, 'name' => 'IFAL Revisão']);

        $bundle = CourseBundle::query()->create([
            'tenant_id' => $tenantId,
            'name' => 'Pacote IFAL Completo',
            'billing_cycle' => 'monthly',
            'price' => 175,
            'status' => 'active',
        ]);
        $bundle->courses()->sync([$courseA->id, $courseB->id]);

        $classA = SchoolClass::factory()->create(['tenant_id' => $tenantId, 'course_id' => $courseA->id, 'name' => 'Turma A']);
        $classB = SchoolClass::factory()->create(['tenant_id' => $tenantId, 'course_id' => $courseB->id, 'name' => 'Turma B']);

        $enrollment = Enrollment::query()->create([
            'tenant_id' => $tenantId,
            'student_id' => $student->id,
            'school_class_id' => $classA->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00099',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
        ]);
        $enrollment->syncSchoolClasses([$classA->id, $classB->id]);

        $service = new StudentPerformanceService;
        $payload = $service->activeEnrollmentsPayload($student->fresh());

        $this->assertCount(1, $payload);
        $this->assertSame('bundle', $payload[0]['enrollment_type']);
        $this->assertSame('Pacote IFAL Completo', $payload[0]['bundle']['name']);
        $this->assertCount(2, $payload[0]['school_classes']);
        $this->assertCount(2, $payload[0]['courses']);
        $this->assertSame('MAT-1-00099', $payload[0]['enrollment_number']);
    }
}
