<?php

namespace Tests\Unit;

use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Services\StudentAppAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class StudentAppAccessServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedDomainLookups();
    }

    public function test_provision_creates_user_with_enrollment_login(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => null,
            'enrollment_number' => '202600099',
            'birth_date' => '2010-05-15',
        ]);

        $service = app(StudentAppAccessService::class);
        $result = $service->provision($student);

        $student->refresh();

        $this->assertSame('202600099', $result['enrollment_number']);
        $this->assertSame('15052010', $result['initial_password']);
        $this->assertSame('202600099@interno', $result['user']->email);
        $this->assertSame($result['user']->id, $student->user_id);

        $this->assertDatabaseHas('users', [
            'id' => $student->user_id,
            'email' => '202600099@interno',
            'role' => 'aluno',
            'password_change_required' => true,
        ]);
    }

    public function test_provision_generates_enrollment_when_missing(): void
    {
        $tenant = Tenant::factory()->create();
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => null,
            'enrollment_number' => null,
            'birth_date' => null,
        ]);

        $expectedEnrollment = now()->year . str_pad((string) $student->id, 5, '0', STR_PAD_LEFT);

        $service = app(StudentAppAccessService::class);
        $result = $service->provision($student);

        $this->assertSame($expectedEnrollment, $result['enrollment_number']);
        $this->assertSame('Aluno@' . str_pad((string) $student->id, 4, '0', STR_PAD_LEFT), $result['initial_password']);
    }

    public function test_provision_rejects_student_that_already_has_user(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno']);
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'enrollment_number' => '202600001',
        ]);

        $this->expectException(RuntimeException::class);

        app(StudentAppAccessService::class)->provision($student);
    }
}
