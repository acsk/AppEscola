<?php

namespace Tests\Unit;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Services\StudentNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentNotificationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolve_students_by_school_class_only_includes_active_with_user(): void
    {
        $tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $schoolClass = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
        ]);

        $alunoComApp = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id'   => User::factory()->create([
                'tenant_id' => $tenant->id,
                'role'      => 'aluno',
            ])->id,
            'status' => 'active',
        ]);

        $alunoSemApp = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id'   => null,
            'status'    => 'active',
        ]);

        foreach ([$alunoComApp, $alunoSemApp] as $student) {
            Enrollment::factory()->create([
                'tenant_id'       => $tenant->id,
                'student_id'      => $student->id,
                'school_class_id' => $schoolClass->id,
                'status'          => 'active',
            ]);
        }

        $service = app(StudentNotificationService::class);
        $ids = $service->resolveStudentIds($tenant->id, 'school_class', [
            'school_class_id' => $schoolClass->id,
        ]);

        $this->assertCount(1, $ids);
        $this->assertTrue($ids->contains($alunoComApp->id));
    }

    public function test_send_creates_broadcast_and_notifications(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role'      => 'admin',
        ]);

        $studentUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role'      => 'aluno',
        ]);

        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'user_id'   => $studentUser->id,
            'status'    => 'active',
        ]);

        $service = app(StudentNotificationService::class);
        $broadcast = $service->send(
            tenantId: $tenant->id,
            sender: $admin,
            type: 'general',
            title: 'Aviso',
            body: 'Mensagem de teste',
            audienceType: 'student',
            audienceParams: ['student_id' => $student->id],
        );

        $this->assertSame(1, $broadcast->recipients_count);
        $this->assertDatabaseHas('student_notifications', [
            'student_id' => $student->id,
            'user_id'    => $studentUser->id,
            'title'      => 'Aviso',
            'read_at'    => null,
        ]);
    }
}
