<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CoursePlan;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnrollmentSubscribeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_subscribe_creates_enrollment_with_guardian_from_request(): void
    {
        [$user, $payload] = $this->seedSubscribeContext();

        Sanctum::actingAs($user);

        $this->postJson('/api/enrollments/subscribe', $payload)
            ->assertCreated()
            ->assertJsonPath('student_id', $payload['student_id'])
            ->assertJsonPath('financial_guardian_id', $payload['guardian_id']);

        $this->assertDatabaseHas('enrollments', [
            'student_id' => $payload['student_id'],
            'school_class_id' => $payload['school_class_id'],
            'course_plan_id' => $payload['course_plan_id'],
            'status' => 'active',
        ]);
    }

    public function test_subscribe_rejects_guardian_not_linked_to_student(): void
    {
        [$user, $payload] = $this->seedSubscribeContext(linkGuardian: false);

        Sanctum::actingAs($user);

        $this->postJson('/api/enrollments/subscribe', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['guardian_id']);
    }

    public function test_subscribe_without_enrollment_payment_payload(): void
    {
        [$user, $payload] = $this->seedSubscribeContext();

        Sanctum::actingAs($user);

        unset($payload['enrollment_payment']);

        $this->postJson('/api/enrollments/subscribe', $payload)
            ->assertCreated();
    }

    public function test_subscribe_rejects_plan_from_another_course(): void
    {
        [$user, $payload, $context] = $this->seedSubscribeContext(returnContext: true);

        $otherCourse = Course::factory()->create(['tenant_id' => $context['tenant']->id]);
        $otherPlan = CoursePlan::query()->create([
            'tenant_id' => $context['tenant']->id,
            'course_id' => $otherCourse->id,
            'name' => 'Plano outro curso',
            'billing_cycle' => 'monthly',
            'price' => 500,
            'enrollment_fee_amount' => 100,
            'status' => 'active',
        ]);

        $payload['course_plan_id'] = $otherPlan->id;

        Sanctum::actingAs($user);

        $this->postJson('/api/enrollments/subscribe', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['course_plan_id']);
    }

    /**
     * @return array{0: User, 1: array<string, mixed>}|array{0: User, 1: array<string, mixed>, 2: array<string, mixed>}
     */
    private function seedSubscribeContext(bool $linkGuardian = true, bool $returnContext = false): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);

        $course = Course::factory()->create([
            'tenant_id' => $tenant->id,
            'enrollment_fee_amount' => 150,
        ]);

        $plan = CoursePlan::query()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
            'name' => 'Plano mensal',
            'billing_cycle' => 'monthly',
            'price' => 300,
            'enrollment_fee_amount' => 150,
            'status' => 'active',
        ]);

        $schoolClass = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
        ]);

        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'is_minor' => true,
            'document' => '529.982.247-25',
        ]);

        $guardian = Guardian::factory()->create([
            'tenant_id' => $tenant->id,
            'document' => '390.533.447-05',
        ]);

        if ($linkGuardian) {
            $student->guardians()->attach($guardian->id, [
                'tenant_id' => $tenant->id,
                'is_financial_responsible' => true,
                'is_pedagogical_responsible' => true,
                'can_access_portal' => true,
            ]);
        }

        $payload = [
            'student_id' => $student->id,
            'school_class_id' => $schoolClass->id,
            'course_plan_id' => $plan->id,
            'discount_amount' => 0,
            'guardian_id' => $guardian->id,
        ];

        $context = [
            'tenant' => $tenant,
            'student' => $student,
            'guardian' => $guardian,
        ];

        return $returnContext
            ? [$user, $payload, $context]
            : [$user, $payload];
    }
}
