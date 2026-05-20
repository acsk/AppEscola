<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_dashboard_returns_metrics_for_tenant_admin(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        Student::factory()->count(3)->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.stats.0.key', 'students')
            ->assertJsonPath('body.stats.0.value', 3)
            ->assertJsonPath('body.students_breakdown.total', 3);
    }

    public function test_dashboard_denies_student_role(): void
    {
        $tenant = Tenant::factory()->create();
        $studentUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'aluno',
            'status' => 'active',
        ]);

        $this->actingAs($studentUser)
            ->getJson('/api/dashboard')
            ->assertForbidden();
    }
}
