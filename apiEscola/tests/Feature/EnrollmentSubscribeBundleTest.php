<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseBundle;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnrollmentSubscribeBundleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_subscribe_bundle_creates_single_enrollment_with_full_monthly_amount(): void
    {
        [$user, $payload, $context] = $this->seedBundleContext();

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/enrollments/subscribe-bundle', $payload)
            ->assertCreated();

        $this->assertCount(1, $response->json('enrollments'));
        $this->assertSame(
            $response->json('enrollments.0.id'),
            $response->json('enrollment.id')
        );

        $enrollmentId = (int) $response->json('enrollment.id');

        $this->assertDatabaseCount('enrollments', 1);
        $this->assertDatabaseHas('enrollments', [
            'id' => $enrollmentId,
            'student_id' => $payload['student_id'],
            'bundle_id' => $payload['bundle_id'],
            'monthly_amount' => '175.00',
            'discount_amount' => '5.00',
        ]);

        $this->assertDatabaseCount('enrollment_school_classes', 2);
        $this->assertDatabaseHas('enrollment_school_classes', [
            'enrollment_id' => $enrollmentId,
            'school_class_id' => $context['class_a']->id,
        ]);
        $this->assertDatabaseHas('enrollment_school_classes', [
            'enrollment_id' => $enrollmentId,
            'school_class_id' => $context['class_b']->id,
        ]);

        // Regra nova: não gerar mensalidades automaticamente na matrícula do pacote.
        $this->assertSame(
            0,
            Invoice::query()
                ->where('enrollment_id', $enrollmentId)
                ->where('type', 'monthly')
                ->count()
        );

        $this->assertSame(
            1,
            Invoice::query()
                ->where('enrollment_id', $enrollmentId)
                ->where('type', 'enrollment_fee')
                ->count()
        );
    }

    public function test_subscribe_bundle_blocks_when_fee_is_not_positive(): void
    {
        [$user, $payload] = $this->seedBundleContext(discountAmount: 999);

        Sanctum::actingAs($user);

        $this->postJson('/api/enrollments/subscribe-bundle', $payload)
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Não é possível concluir a matrícula: o pacote precisa ter taxa de matrícula cadastrada (valor de taxa > 0).'
            );

        $this->assertDatabaseCount('enrollments', 0);
        $this->assertDatabaseCount('invoices', 0);
    }

    /**
     * @return array{0: User, 1: array<string, mixed>, 2: array<string, mixed>}
     */
    private function seedBundleContext(float $discountAmount = 5, float $bundlePrice = 175): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);

        $courseA = Course::factory()->create(['tenant_id' => $tenant->id]);
        $courseB = Course::factory()->create(['tenant_id' => $tenant->id]);

        $bundle = CourseBundle::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Pacote IFAL',
            'billing_cycle' => 'monthly',
            'price' => $bundlePrice,
            'status' => 'active',
        ]);
        $bundle->courses()->sync([$courseA->id, $courseB->id]);

        $classA = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $courseA->id,
        ]);
        $classB = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $courseB->id,
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

        $student->guardians()->attach($guardian->id, [
            'tenant_id' => $tenant->id,
            'is_financial_responsible' => true,
            'is_pedagogical_responsible' => true,
            'can_access_portal' => true,
        ]);

        $payload = [
            'student_id' => $student->id,
            'bundle_id' => $bundle->id,
            'school_class_ids' => [$classA->id, $classB->id],
            'discount_amount' => $discountAmount,
            'guardian_id' => $guardian->id,
            'start_date' => now()->toDateString(),
        ];

        return [
            $user,
            $payload,
            [
                'tenant' => $tenant,
                'bundle' => $bundle,
                'class_a' => $classA,
                'class_b' => $classB,
            ],
        ];
    }
}
