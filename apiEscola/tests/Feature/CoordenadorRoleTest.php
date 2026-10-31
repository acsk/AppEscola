<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

/** Coordenação tem as mesmas permissões do admin do tenant. */
class CoordenadorRoleTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    protected bool $dropViews = true;

    private function user(Tenant $tenant, string $role): User
    {
        return User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role]);
    }

    public function test_coordinator_reaches_admin_screens(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs($this->user($tenant, 'coordenador'));

        $this->getJson('/api/dashboard')->assertOk();
        $this->getJson('/api/users')->assertOk();
        $this->getJson('/api/reports/class-students')->assertOk();
    }

    public function test_coordinator_cannot_create_super_admin(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs($this->user($tenant, 'coordenador'));

        $this->postJson('/api/users', [
            'name' => 'Teste',
            'email' => 'novo@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'role' => 'super_admin',
        ])->assertStatus(422);
    }

    public function test_secretaria_still_cannot_manage_users(): void
    {
        $tenant = Tenant::factory()->create();
        Sanctum::actingAs($this->user($tenant, 'secretaria'));

        $this->getJson('/api/users')->assertForbidden();
    }
}
