<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnrollmentUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_update_can_change_school_class_without_sending_start_date(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $classA = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
        ]);
        $classB = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
        ]);

        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'school_class_id' => $classA->id,
            'start_date' => '2026-07-24',
            'end_date' => '2026-12-14',
            'status' => 'concluded',
            'monthly_amount' => 175,
            'discount_amount' => 0,
            'payment_due_day' => 10,
        ]);

        Sanctum::actingAs($user);

        $this->putJson("/api/enrollments/{$enrollment->id}", [
            'school_class_id' => $classB->id,
            'status' => 'concluded',
            'payment_due_day' => 10,
        ])
            ->assertOk()
            ->assertJsonMissingValidationErrors(['start_date'])
            ->assertJsonPath('school_class_id', $classB->id)
            ->assertJsonPath('start_date', '2026-07-24');

        $this->assertDatabaseHas('enrollments', [
            'id' => $enrollment->id,
            'school_class_id' => $classB->id,
            'start_date' => '2026-07-24',
        ]);
    }
}
