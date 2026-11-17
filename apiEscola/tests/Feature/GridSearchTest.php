<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\User;
use App\Support\GridSearch;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GridSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
    }

    public function test_fold_ignores_case_and_accents(): void
    {
        $this->assertSame('jose da conceicao', GridSearch::fold('  José DA Conceição  '));
        $this->assertSame('joao', GridSearch::fold('JOÃO'));
    }

    public function test_student_search_is_global_and_ignores_case_and_accents(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $course = Course::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Pré-Militar']);

        $jose = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'José da Conceição',
            'document' => '123.456.789-00',
            'email' => 'Jose@Escola.com',
            'phone' => '(11) 98888-7777',
            'enrollment_number' => 'MAT-100',
        ]);
        $jose->desiredCourses()->attach($course->id, ['tenant_id' => $tenant->id]);

        $maria = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Maria Oliveira',
            'document' => '999.888.777-66',
            'email' => 'maria@escola.com',
        ]);

        $other = Tenant::factory()->create();
        Student::factory()->create([
            'tenant_id' => $other->id,
            'name' => 'José da Conceição',
            'email' => 'jose@outro.com',
        ]);

        $ids = fn (string $search) => collect(
            $this->actingAs($admin)->getJson('/api/students?search='.urlencode($search))->assertOk()->json('data')
        )->pluck('id')->all();

        $this->assertSame([$jose->id], $ids('jose'));
        $this->assertSame([$jose->id], $ids('CONCEICAO'));
        $this->assertSame([$jose->id], $ids('jose@escola.com'));
        $this->assertSame([$jose->id], $ids('12345678900'));
        $this->assertSame([$jose->id], $ids('988887777'));
        $this->assertSame([$jose->id], $ids('mat-100'));
        $this->assertSame([$jose->id], $ids('pre-militar'));
        $this->assertSame([$maria->id], $ids('MARIA'));

        $byCourse = collect(
            $this->actingAs($admin)->getJson('/api/students?course_id='.$course->id)->assertOk()->json('data')
        )->pluck('id')->all();
        $this->assertSame([$jose->id], $byCourse);
    }

    public function test_enrollment_search_is_global_and_ignores_case_and_accents(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $course = Course::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Pré-ENEM']);
        $otherCourse = Course::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Redação']);
        $class = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
            'name' => 'Turma Manhã',
        ]);
        $otherClass = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $otherCourse->id,
            'name' => 'Turma Noite',
        ]);
        $jose = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'José da Conceição',
            'document' => '123.456.789-00',
        ]);
        $maria = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Maria Oliveira',
        ]);

        $joseEnrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $jose->id,
            'school_class_id' => $class->id,
            'enrollment_number' => 'ENR-20',
        ]);
        $mariaEnrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $maria->id,
            'school_class_id' => $otherClass->id,
            'enrollment_number' => 'ENR-99',
        ]);

        $ids = fn (string $search) => collect(
            $this->actingAs($admin)->getJson('/api/enrollments?search='.urlencode($search))->assertOk()->json('data')
        )->pluck('id')->all();

        $this->assertSame([$joseEnrollment->id], $ids('jose'));
        $this->assertSame([$joseEnrollment->id], $ids('CONCEIÇÃO'));
        $this->assertSame([$joseEnrollment->id], $ids('12345678900'));
        $this->assertSame([$joseEnrollment->id], $ids('enr-20'));
        $this->assertSame([$joseEnrollment->id], $ids('manha'));
        $this->assertSame([$joseEnrollment->id], $ids('PRE-ENEM'));
        $this->assertSame([$mariaEnrollment->id], $ids('redacao'));
    }
}
