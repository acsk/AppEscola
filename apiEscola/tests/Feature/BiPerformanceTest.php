<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (período 01/09–31/10/2026; amostras mínimas reduzidas para 1):
 * - P1 (CPM A, máx. 10): Ana Mat. 8 / Hist. 6; Bruno Mat. 6 / Hist. falta.
 * - P2 (CPM B, máx. 20): Duda Mat. 18 / Hist. 10.
 * - P0 (CPM A, agosto, máx. 10): Ana Mat. 5, Bruno Mat. 5.
 */
class BiPerformanceTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const URL = '/api/bi/performance?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classB;

    private Subject $math;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $catalog = config('bi_metrics');
        foreach (['grades.avg', 'grades.at_goal_share', 'grades.absence_rate'] as $key) {
            $catalog[$key]['min_sample'] = 1;
        }
        config()->set('bi_metrics', $catalog);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $history = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'História', 'status' => 'active']);

        $ana = $this->enrolled('Ana', $classA);
        $bruno = $this->enrolled('Bruno', $classA);
        $duda = $this->enrolled('Duda', $this->classB);

        $p1 = $this->assessment($classA, '2026-10-05', 10);
        $this->grade($p1, $ana, $this->math, 8);
        $this->grade($p1, $ana, $history, 6);
        $this->grade($p1, $bruno, $this->math, 6);
        $this->grade($p1, $bruno, $history, null, true);

        $p2 = $this->assessment($this->classB, '2026-09-20', 20);
        $this->grade($p2, $duda, $this->math, 18);
        $this->grade($p2, $duda, $history, 10);

        $p0 = $this->assessment($classA, '2026-08-10', 10);
        $this->grade($p0, $ana, $this->math, 5);
        $this->grade($p0, $bruno, $this->math, 5);

        // Rascunho não entra.
        $draft = $this->assessment($classA, '2026-10-10', 10, 'draft');
        $this->grade($draft, $ana, $this->math, 0);
    }

    private function metric(array $body, string $key): array
    {
        return collect($body['metrics'])->firstWhere('key', $key);
    }

    public function test_grades_by_subject_and_class_keep_absences_apart(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $body = $this->getJson(self::URL)->assertOk()->json('body');

        $avg = $this->metric($body, 'grades.avg');
        $this->assertSame(68.0, (float) $avg['value']);
        $this->assertSame(50.0, (float) $avg['previous']);
        $this->assertSame(18.0, (float) $avg['delta']);
        $this->assertSame(40.0, (float) $this->metric($body, 'grades.at_goal_share')['value']);
        $this->assertSame(16.7, (float) $this->metric($body, 'grades.absence_rate')['value']);

        $subjects = $body['subjects'];
        $this->assertSame(['HISTÓRIA', 'MATEMÁTICA'], array_column($subjects, 'name'));
        $this->assertSame(55.0, (float) $subjects[0]['avg']);
        $this->assertSame(33.3, (float) $subjects[0]['absence_rate']);
        $this->assertNull($subjects[0]['delta_pp']);
        $this->assertSame(76.7, (float) $subjects[1]['avg']);
        $this->assertSame(26.7, (float) $subjects[1]['delta_pp']);

        $this->assertSame(['HISTÓRIA', 'MATEMÁTICA'], array_column($body['matrix']['topics'], 'name'));
        $rows = collect($body['matrix']['rows'])->keyBy('name');
        $this->assertSame([60.0, 70.0], array_map('floatval', array_column($rows['CPM A']['cells'], 'value')));
        $this->assertSame([50.0, 90.0], array_map('floatval', array_column($rows['CPM B']['cells'], 'value')));
    }

    public function test_teacher_only_sees_their_class(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $body = $this->getJson(self::URL)->assertOk()->json('body');
        $this->assertSame(70.0, (float) $this->metric($body, 'grades.avg')['value']);
        $this->assertSame(['CPM B'], array_column($body['matrix']['rows'], 'name'));
    }

    private function enrolled(string $name, SchoolClass $class): Student
    {
        $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name, 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
            'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
        ]);

        return $student;
    }

    private function assessment(SchoolClass $class, string $date, float $max, string $status = 'published'): int
    {
        return DB::table('official_assessments')->insertGetId([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $class->id, 'title' => "Avaliação {$date}",
            'kind' => 'presencial_bimestral', 'assessment_date' => $date, 'max_score' => $max, 'weight' => 1,
            'status' => $status, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function grade(int $assessmentId, Student $student, Subject $subject, ?float $grade, bool $absent = false): void
    {
        DB::table('official_assessment_grades')->insert([
            'tenant_id' => $this->tenant->id, 'official_assessment_id' => $assessmentId, 'student_id' => $student->id,
            'subject_id' => $subject->id, 'grade' => $grade, 'is_absent' => $absent, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
