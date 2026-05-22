<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseBundle;
use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\MergeDuplicateBundleEnrollmentsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MergeDuplicateBundleEnrollmentsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_merge_consolidates_legacy_duplicate_bundle_enrollments(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        $courseA = Course::factory()->create(['tenant_id' => $tenant->id]);
        $courseB = Course::factory()->create(['tenant_id' => $tenant->id]);

        $bundle = CourseBundle::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Pacote',
            'billing_cycle' => 'monthly',
            'price' => 175,
            'status' => 'active',
        ]);
        $bundle->courses()->sync([$courseA->id, $courseB->id]);

        $classA = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseA->id]);
        $classB = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseB->id]);

        $first = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classA->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00001',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        $second = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classB->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00002',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        Invoice::query()->create([
            'tenant_id' => $tenant->id,
            'enrollment_id' => $first->id,
            'student_id' => $student->id,
            'type' => 'monthly',
            'description' => 'Mensalidade',
            'amount' => 82.50,
            'due_date' => now()->addDays(10)->toDateString(),
            'status' => 'pending',
        ]);

        $result = app(MergeDuplicateBundleEnrollmentsService::class)->run(dryRun: false);

        $this->assertSame(1, $result['merged_groups']);
        $this->assertSame(1, $result['removed_enrollments']);
        $this->assertSame(1, Enrollment::query()->count());
        $this->assertSoftDeleted('enrollments', ['id' => $second->id]);

        $keeper = $first->fresh();
        $this->assertSame('175.00', $keeper->monthly_amount);
        $this->assertDatabaseCount('enrollment_school_classes', 2);
        $this->assertDatabaseHas('enrollment_school_classes', [
            'enrollment_id' => $first->id,
            'school_class_id' => $classA->id,
        ]);
        $this->assertDatabaseHas('enrollment_school_classes', [
            'enrollment_id' => $first->id,
            'school_class_id' => $classB->id,
        ]);
        $this->assertDatabaseHas('invoices', [
            'enrollment_id' => $first->id,
            'type' => 'monthly',
        ]);
    }

    public function test_merge_moves_invoice_when_only_soft_deleted_conflict_exists_on_keeper(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        $courseA = Course::factory()->create(['tenant_id' => $tenant->id]);
        $courseB = Course::factory()->create(['tenant_id' => $tenant->id]);

        $bundle = CourseBundle::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Pacote',
            'billing_cycle' => 'monthly',
            'price' => 175,
            'status' => 'active',
        ]);
        $bundle->courses()->sync([$courseA->id, $courseB->id]);

        $classA = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseA->id]);
        $classB = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseB->id]);

        $dueDate = now()->addDays(10)->toDateString();

        $keeper = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classA->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00001',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        $duplicate = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classB->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00002',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        $trashedOnKeeper = Invoice::query()->create([
            'tenant_id' => $tenant->id,
            'enrollment_id' => $keeper->id,
            'student_id' => $student->id,
            'type' => 'monthly',
            'description' => 'Mensalidade antiga',
            'amount' => 82.50,
            'due_date' => $dueDate,
            'status' => 'pending',
        ]);
        $trashedOnKeeper->delete();

        $activeOnDuplicate = Invoice::query()->create([
            'tenant_id' => $tenant->id,
            'enrollment_id' => $duplicate->id,
            'student_id' => $student->id,
            'type' => 'monthly',
            'description' => 'Mensalidade ativa',
            'amount' => 82.50,
            'due_date' => $dueDate,
            'status' => 'pending',
        ]);

        app(MergeDuplicateBundleEnrollmentsService::class)->run(dryRun: false);

        $activeOnDuplicate->refresh();

        $this->assertNull($activeOnDuplicate->deleted_at);
        $this->assertSame($keeper->id, $activeOnDuplicate->enrollment_id);
        $this->assertSame(1, Invoice::query()->where('enrollment_id', $keeper->id)->where('type', 'monthly')->count());
    }

    public function test_dry_run_invoice_counts_match_actual_execution(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create(['tenant_id' => $tenant->id]);

        $courseA = Course::factory()->create(['tenant_id' => $tenant->id]);
        $courseB = Course::factory()->create(['tenant_id' => $tenant->id]);
        $courseC = Course::factory()->create(['tenant_id' => $tenant->id]);

        $bundle = CourseBundle::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Pacote',
            'billing_cycle' => 'monthly',
            'price' => 175,
            'status' => 'active',
        ]);
        $bundle->courses()->sync([$courseA->id, $courseB->id, $courseC->id]);

        $classA = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseA->id]);
        $classB = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseB->id]);
        $classC = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $courseC->id]);

        $dueDate = now()->addDays(10)->toDateString();

        $keeper = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classA->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00001',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        $duplicateOne = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classB->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00002',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        $duplicateTwo = $student->enrollments()->create([
            'tenant_id' => $tenant->id,
            'school_class_id' => $classC->id,
            'bundle_id' => $bundle->id,
            'enrollment_number' => 'MAT-1-00003',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(11)->toDateString(),
            'status' => 'active',
            'monthly_amount' => 87.50,
            'discount_amount' => 5,
            'payment_due_day' => 10,
        ]);

        foreach ([$duplicateOne, $duplicateTwo] as $enrollment) {
            Invoice::query()->create([
                'tenant_id' => $tenant->id,
                'enrollment_id' => $enrollment->id,
                'student_id' => $student->id,
                'type' => 'monthly',
                'description' => 'Mensalidade',
                'amount' => 82.50,
                'due_date' => $dueDate,
                'status' => 'pending',
            ]);
        }

        $service = app(MergeDuplicateBundleEnrollmentsService::class);

        $duplicateOneInvoiceId = Invoice::query()
            ->where('enrollment_id', $duplicateOne->id)
            ->value('id');

        $dryRun = $service->run(dryRun: true);

        $this->assertSame(3, Enrollment::query()->count());
        $this->assertSame(
            $duplicateOne->id,
            (int) Invoice::query()->whereKey($duplicateOneInvoiceId)->value('enrollment_id')
        );

        $actual = $service->run(dryRun: false);

        $this->assertSame($keeper->id, $dryRun['details'][0]['keeper_id']);
        $this->assertSame(1, $dryRun['invoices_moved']);
        $this->assertSame(1, $dryRun['invoices_dropped']);
        $this->assertSame($dryRun['invoices_moved'], $actual['invoices_moved']);
        $this->assertSame($dryRun['invoices_dropped'], $actual['invoices_dropped']);
    }
}
