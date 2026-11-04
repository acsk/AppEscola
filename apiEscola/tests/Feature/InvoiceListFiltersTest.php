<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Database\Seeders\DomainSeeder;
use Tests\TestCase;

class InvoiceListFiltersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-11-03 10:00:00');

        $tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        $course = Course::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Militares']);
        $class = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $course->id]);
        $laura = Student::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Laura Siqueira']);
        $levi = Student::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Levi Santana']);
        $joana = Guardian::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Joana Ferreira']);
        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $laura->id,
            'school_class_id' => $class->id,
        ]);

        $make = fn (array $attrs) => Invoice::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'student_id' => $levi->id,
            'type' => 'monthly',
        ], $attrs))->id;

        $this->ids = [
            'overdue' => $make(['student_id' => $laura->id, 'guardian_id' => $joana->id, 'enrollment_id' => $enrollment->id, 'amount' => 175, 'status' => 'pending', 'due_date' => '2026-10-20']),
            'due_soon' => $make(['amount' => 120, 'status' => 'pending', 'due_date' => '2026-11-05']),
            'later' => $make(['amount' => 300, 'status' => 'pending', 'due_date' => '2026-12-10']),
            'paid' => $make(['amount' => 200, 'status' => 'paid', 'payment_method' => 'pix', 'due_date' => '2026-10-05', 'paid_at' => '2026-10-06 09:00:00']),
            'cancelled' => $make(['amount' => 90, 'status' => 'cancelled', 'due_date' => '2026-10-15']),
        ];

        // Outro tenant: nunca entra nas contagens.
        $other = Tenant::factory()->create();
        Invoice::factory()->create([
            'tenant_id' => $other->id,
            'student_id' => Student::factory()->create(['tenant_id' => $other->id])->id,
            'amount' => 999,
            'status' => 'pending',
            'due_date' => '2026-10-01',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function listIds(array $query): array
    {
        return collect($this->actingAs($this->admin)->getJson('/api/invoices?' . http_build_query($query))->assertOk()->json('data'))
            ->pluck('id')
            ->all();
    }

    public function test_situations_are_derived_from_due_date(): void
    {
        $this->assertSame([$this->ids['overdue']], $this->listIds(['situation' => 'overdue']));
        $this->assertSame([$this->ids['due_soon']], $this->listIds(['situation' => 'due_soon']));
        $this->assertSame([$this->ids['paid']], $this->listIds(['situation' => 'paid']));
        $this->assertSame([$this->ids['cancelled']], $this->listIds(['situation' => 'cancelled']));
        $this->assertSame(
            [$this->ids['overdue'], $this->ids['due_soon'], $this->ids['later']],
            $this->listIds(['situation' => 'open', 'order' => 'asc'])
        );

        $this->actingAs($this->admin)->getJson('/api/invoices?situation=foo')->assertUnprocessable();
    }

    public function test_situation_totals_respect_filters_and_tenant(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/invoices/situations')
            ->assertOk()
            ->assertJsonPath('body.situations.open.count', 3)
            ->assertJsonPath('body.situations.open.amount', '595.00')
            ->assertJsonPath('body.situations.overdue.amount', '175.00')
            ->assertJsonPath('body.situations.due_soon.count', 1)
            ->assertJsonPath('body.situations.paid.amount', '200.00')
            ->assertJsonPath('body.situations.cancelled.count', 1);

        $this->actingAs($this->admin)
            ->getJson('/api/invoices/situations?due_date_from=2026-10-01&due_date_to=2026-10-31')
            ->assertOk()
            ->assertJsonPath('body.situations.open.count', 1)
            ->assertJsonPath('body.situations.paid.count', 1);
    }

    public function test_search_and_course_filters(): void
    {
        $this->assertSame([$this->ids['overdue']], $this->listIds(['search' => 'Joana']));
        $this->assertSame([$this->ids['overdue']], $this->listIds(['search' => '#' . $this->ids['overdue']]));
        $this->assertSame([$this->ids['overdue']], $this->listIds(['course_id' => Course::first()->id]));

        $row = $this->actingAs($this->admin)->getJson('/api/invoices?situation=overdue')->json('data.0');
        $this->assertNotNull($row['enrollment']['school_class']);
        $this->assertSame('MILITARES', mb_strtoupper($row['enrollment']['course']['name']));
    }

    public function test_due_today_is_not_overdue_late_at_night_in_brasilia(): void
    {
        // 22h de 03/11 em Brasília = 01h de 04/11 em UTC (fuso da aplicação).
        Carbon::setTestNow('2026-11-04 01:00:00');
        $dueToday = Invoice::factory()->create([
            'tenant_id' => $this->admin->tenant_id,
            'student_id' => Student::first()->id,
            'amount' => 50,
            'status' => 'pending',
            'due_date' => '2026-11-03',
        ])->id;

        $this->assertNotContains($dueToday, $this->listIds(['situation' => 'overdue']));
        $this->assertContains($dueToday, $this->listIds(['situation' => 'due_soon']));
        $this->actingAs($this->admin)->getJson('/api/invoices/situations')->assertJsonPath('body.today', '2026-11-03');
    }

    public function test_roles_without_finance_cannot_read_situations(): void
    {
        $professor = User::factory()->create(['tenant_id' => $this->admin->tenant_id, 'role' => 'professor', 'status' => 'active']);

        $this->actingAs($professor)->getJson('/api/invoices/situations')->assertForbidden();
    }
}
