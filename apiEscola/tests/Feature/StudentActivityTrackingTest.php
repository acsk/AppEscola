<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class StudentActivityTrackingTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    private function studentUser(Tenant $tenant): array
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno']);
        $student = Student::factory()->create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'status' => 'active']);

        return [$user, $student];
    }

    public function test_student_use_is_recorded_once_per_window_in_school_timezone(): void
    {
        $tenant = Tenant::factory()->create();
        [$user, $student] = $this->studentUser($tenant);
        Sanctum::actingAs($user);

        // 01:30 UTC de 03/11 ainda é 02/11 em São Paulo.
        Carbon::setTestNow('2026-11-03 01:30:00');
        $this->getJson('/api/me')->assertOk();
        $this->getJson('/api/me')->assertOk();
        Carbon::setTestNow('2026-11-03 01:50:00');
        $this->getJson('/api/me')->assertOk();

        $rows = DB::table('student_activity_days')->get();
        $this->assertCount(1, $rows);
        $this->assertSame($student->id, (int) $rows[0]->student_id);
        $this->assertSame('2026-11-02', (string) $rows[0]->activity_date);
        $this->assertSame(2, (int) $rows[0]->touches);
        $this->assertSame('2026-11-03 01:30:00', (string) $rows[0]->first_seen_at);
        $this->assertSame('2026-11-03 01:50:00', (string) $rows[0]->last_seen_at);

        Carbon::setTestNow('2026-11-03 12:00:00');
        $this->getJson('/api/me')->assertOk();
        $this->assertSame(['2026-11-02', '2026-11-03'], DB::table('student_activity_days')->orderBy('activity_date')->pluck('activity_date')->map(fn ($d) => (string) $d)->all());

        Carbon::setTestNow();
    }

    public function test_staff_and_disabled_tracking_record_nothing(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']));
        $this->getJson('/api/me')->assertOk();

        config()->set('bi.activity_tracking', false);
        [$user] = $this->studentUser($tenant);
        Sanctum::actingAs($user);
        $this->getJson('/api/me')->assertOk();

        $this->assertSame(0, DB::table('student_activity_days')->count());
    }
}
