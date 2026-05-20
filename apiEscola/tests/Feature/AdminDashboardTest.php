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

    private function actingAsSanctum(User $user, array $abilities = ['*']): static
    {
        $plainTextToken = $user->createToken('test', $abilities)->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$plainTextToken);
    }

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

    public function test_dashboard_requires_tenant_for_super_admin_without_context(): void
    {
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);

        $this->actingAsSanctum($superAdmin, ['*'])
            ->getJson('/api/dashboard')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'tenant_id é obrigatório para esta operação.');
    }

    public function test_dashboard_returns_metrics_for_super_admin_with_tenant_token(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);

        Student::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $this->actingAsSanctum($superAdmin, ["tenant:{$tenant->id}"])
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.stats.0.value', 2);
    }

    public function test_dashboard_accepts_tenant_id_query_for_super_admin(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        $superAdmin = User::factory()->superAdmin()->create(['status' => 'active']);

        Student::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $this->actingAsSanctum($superAdmin, ['*'])
            ->getJson("/api/dashboard?tenant_id={$tenant->id}")
            ->assertOk()
            ->assertJsonPath('body.stats.0.value', 1);
    }
}
