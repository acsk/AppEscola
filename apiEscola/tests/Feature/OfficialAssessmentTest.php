<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\OfficialAssessment;
use App\Models\OfficialAssessmentGrade;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class OfficialAssessmentTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    /**
     * @return array{
     *     tenant: Tenant,
     *     admin: User,
     *     course: Course,
     *     schoolClass: SchoolClass,
     *     student: Student,
     *     enrollment: Enrollment
     * }
     */
    private function seedContext(): array
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->admin()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $schoolClass = SchoolClass::factory()->create([
            'tenant_id' => $tenant->id,
            'course_id' => $course->id,
        ]);
        $student = Student::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);
        $enrollment = Enrollment::factory()->create([
            'tenant_id' => $tenant->id,
            'student_id' => $student->id,
            'school_class_id' => $schoolClass->id,
            'status' => 'active',
        ]);

        return compact('tenant', 'admin', 'course', 'schoolClass', 'student', 'enrollment');
    }

    private function actingAsStaff(User $user): static
    {
        Sanctum::actingAs($user);

        return $this;
    }

    public function test_store_creates_assessment_without_subjects(): void
    {
        $ctx = $this->seedContext();
        $this->actingAsStaff($ctx['admin']);

        $response = $this->postJson('/api/official-assessments', [
            'title' => 'Simulado bimestral',
            'kind' => 'presencial_bimestral',
            'assessment_date' => '2026-05-15',
            'school_class_id' => $ctx['schoolClass']->id,
            'max_score' => 10,
        ]);

        $response->assertCreated()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.title', 'Simulado bimestral')
            ->assertJsonPath('body.status', 'draft');

        $this->assertDatabaseHas('official_assessments', [
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
            'title' => 'Simulado bimestral',
            'status' => 'draft',
        ]);
    }

    public function test_store_accepts_optional_subject_ids(): void
    {
        $ctx = $this->seedContext();
        $subject = Subject::factory()->create(['tenant_id' => $ctx['tenant']->id]);
        $this->actingAsStaff($ctx['admin']);

        $this->postJson('/api/official-assessments', [
            'title' => 'Simulado com disciplinas',
            'kind' => 'presencial_bimestral',
            'assessment_date' => '2026-05-20',
            'school_class_id' => $ctx['schoolClass']->id,
            'subject_ids' => [$subject->id],
        ])
            ->assertCreated()
            ->assertJsonPath('body.subject_ids.0', $subject->id);

        $assessmentId = OfficialAssessment::query()->value('id');
        $this->assertDatabaseHas('official_assessment_subject', [
            'official_assessment_id' => $assessmentId,
            'subject_id' => $subject->id,
        ]);
    }

    public function test_upsert_grades_without_subject_id_keeps_one_row_per_student(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $payload = [
            'grades' => [
                [
                    'student_id' => $ctx['student']->id,
                    'grade' => 7.5,
                    'is_absent' => false,
                ],
            ],
        ];

        $this->postJson("/api/official-assessments/{$assessment->id}/grades", $payload)
            ->assertOk()
            ->assertJsonPath('type', 'success');

        $this->assertDatabaseCount('official_assessment_grades', 1);
        $this->assertDatabaseHas('official_assessment_grades', [
            'official_assessment_id' => $assessment->id,
            'student_id' => $ctx['student']->id,
            'grade' => '7.50',
        ]);

        $payload['grades'][0]['grade'] = 9.0;
        $this->postJson("/api/official-assessments/{$assessment->id}/grades", $payload)
            ->assertOk();

        $this->assertDatabaseCount('official_assessment_grades', 1);
        $this->assertDatabaseHas('official_assessment_grades', [
            'official_assessment_id' => $assessment->id,
            'student_id' => $ctx['student']->id,
            'grade' => '9.00',
        ]);
    }

    public function test_upsert_grades_rejects_student_not_enrolled_in_class(): void
    {
        $ctx = $this->seedContext();
        $otherClass = SchoolClass::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'course_id' => $ctx['course']->id,
        ]);
        $outsider = Student::factory()->create(['tenant_id' => $ctx['tenant']->id]);
        Enrollment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'student_id' => $outsider->id,
            'school_class_id' => $otherClass->id,
            'status' => 'active',
        ]);

        $assessment = OfficialAssessment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $this->postJson("/api/official-assessments/{$assessment->id}/grades", [
            'grades' => [
                [
                    'student_id' => $outsider->id,
                    'grade' => 8,
                    'is_absent' => false,
                ],
            ],
        ])
            ->assertStatus(422)
            ->assertJsonPath('type', 'error');
    }

    public function test_upsert_grades_rejects_when_assessment_is_published(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->published()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        OfficialAssessmentGrade::query()->create([
            'tenant_id' => $ctx['tenant']->id,
            'official_assessment_id' => $assessment->id,
            'student_id' => $ctx['student']->id,
            'grade' => 6,
            'is_absent' => false,
            'graded_at' => now(),
        ]);

        $this->actingAsStaff($ctx['admin']);

        $this->postJson("/api/official-assessments/{$assessment->id}/grades", [
            'grades' => [
                [
                    'student_id' => $ctx['student']->id,
                    'grade' => 10,
                    'is_absent' => false,
                ],
            ],
        ])->assertStatus(422);
    }

    public function test_upsert_grades_rejects_grade_above_max_score(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
            'max_score' => 10,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $this->postJson("/api/official-assessments/{$assessment->id}/grades", [
            'grades' => [
                [
                    'student_id' => $ctx['student']->id,
                    'grade' => 11,
                    'is_absent' => false,
                ],
            ],
        ])->assertStatus(422);
    }

    public function test_publish_requires_at_least_one_grade(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $this->postJson("/api/official-assessments/{$assessment->id}/publish")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Lance ao menos uma nota antes de publicar.');
    }

    public function test_publish_succeeds_after_grades_are_saved(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $this->postJson("/api/official-assessments/{$assessment->id}/grades", [
            'grades' => [
                [
                    'student_id' => $ctx['student']->id,
                    'grade' => 8,
                    'is_absent' => false,
                ],
            ],
        ])->assertOk();

        $this->postJson("/api/official-assessments/{$assessment->id}/publish")
            ->assertOk()
            ->assertJsonPath('body.status', 'published');

        $this->assertDatabaseHas('official_assessments', [
            'id' => $assessment->id,
            'status' => 'published',
        ]);
    }

    public function test_update_is_blocked_when_published(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->published()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
        ]);
        $this->actingAsStaff($ctx['admin']);

        $this->putJson("/api/official-assessments/{$assessment->id}", [
            'title' => 'Título alterado',
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Avaliação já publicada. Edite apenas as notas.');
    }

    public function test_student_report_card_returns_published_grades(): void
    {
        $ctx = $this->seedContext();
        $assessment = OfficialAssessment::factory()->published()->create([
            'tenant_id' => $ctx['tenant']->id,
            'school_class_id' => $ctx['schoolClass']->id,
            'counts_towards_report_card' => true,
        ]);
        OfficialAssessmentGrade::query()->create([
            'tenant_id' => $ctx['tenant']->id,
            'official_assessment_id' => $assessment->id,
            'student_id' => $ctx['student']->id,
            'grade' => 7.5,
            'is_absent' => false,
            'graded_at' => now(),
        ]);

        $this->actingAsStaff($ctx['admin']);

        $this->getJson("/api/students/{$ctx['student']->id}/report-card")
            ->assertOk()
            ->assertJsonPath('type', 'success')
            ->assertJsonPath('body.student.id', $ctx['student']->id)
            ->assertJsonPath('body.summary.assessments_count', 1)
            ->assertJsonPath('body.summary.weighted_average', 7.5);
    }

    public function test_denies_non_staff_role(): void
    {
        $ctx = $this->seedContext();
        $studentUser = User::factory()->create([
            'tenant_id' => $ctx['tenant']->id,
            'role' => 'aluno',
            'status' => 'active',
        ]);
        $this->actingAsStaff($studentUser);

        $this->getJson('/api/official-assessments')->assertForbidden();
    }
}
