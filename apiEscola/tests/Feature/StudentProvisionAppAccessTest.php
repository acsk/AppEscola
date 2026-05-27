<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudentProvisionAppAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_provision_app_access_endpoint_creates_user(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => null,
            'enrollment_number' => '202600011',
            'birth_date' => '2008-03-20',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/students/{$student->id}/provision-app-access")
            ->assertOk()
            ->assertJsonPath('body.login', '202600011')
            ->assertJsonPath('body.initial_password', '20032008')
            ->assertJsonPath('body.student.user_id', fn ($id) => $id !== null);

        $student->refresh();
        $this->assertNotNull($student->user_id);
    }

    public function test_provision_app_access_returns_422_when_user_exists(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $alunoUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'aluno',
        ]);
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $alunoUser->id,
            'enrollment_number' => '202600002',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/students/{$student->id}/provision-app-access")
            ->assertStatus(422);
    }
}
