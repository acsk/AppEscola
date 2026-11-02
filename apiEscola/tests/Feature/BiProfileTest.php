<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\ExamQuestion;
use App\Models\PracticeAnswer;
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
 * Cenário (01/09–31/10/2026 = 8,71 semanas; meta 70%; dedicação alta ≥ 0,5 dia ativo/semana;
 * amostra mínima 1 avaliação + 5 questões):
 * - Ana: simulado 80% + banco 5/5 em 5 dias → Aprendizagem 88, 6 dias ativos (0,7/sem.) → A1.
 * - Bruno: 80% + 5/5 num só dia → 88, 2 dias (0,2/sem.) → A2.
 * - Caio: 20% + 0/5 em 5 dias → 12, 0,7/sem. → B1.
 * - Duda: 20% + 0/5 num dia → 12, 0,2/sem. → B2.
 * - Edu: sem dados → sem classificação.
 */
class BiProfileTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classB;

    private Subject $math;

    private int $exam;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config()->set('bi.min_student_results', 1);
        config()->set('bi.dedication_days_per_week', 0.5);
        config()->set('bi.profile_min_assessments', 1);
        config()->set('bi.profile_min_questions', 5);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->exam = DB::table('exams')->insertGetId(['tenant_id' => $this->tenant->id, 'title' => 'S1', 'created_at' => now(), 'updated_at' => now()]);

        $plan = [
            'ana' => [$classA, 80, true, 5],
            'bruno' => [$classA, 80, true, 1],
            'caio' => [$classA, 20, false, 5],
            'duda' => [$this->classB, 20, false, 1],
            'edu' => [$this->classB, null, null, 0],
        ];
        foreach ($plan as $name => [$class, $pct, $correct, $days]) {
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => ucfirst($name), 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            $this->students[$name] = $student;
            if ($pct === null) {
                continue;
            }
            DB::table('exam_attempts')->insert([
                'tenant_id' => $this->tenant->id, 'exam_id' => $this->exam, 'student_id' => $student->id,
                'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
                'started_at' => '2026-10-25 12:00:00', 'finished_at' => '2026-10-25 12:00:00',
                'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct, 'created_at' => now(), 'updated_at' => now(),
            ]);
            for ($i = 0; $i < 5; $i++) {
                $q = ExamQuestion::create([
                    'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q',
                    'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
                ]);
                PracticeAnswer::query()->create([
                    'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'exam_question_id' => $q->id,
                    'is_correct' => $correct, 'answered_at' => sprintf('2026-09-%02d 12:00:00', 10 + ($days > 1 ? $i : 0)),
                ]);
            }
        }
    }

    public function test_students_fall_into_quadrants_by_the_school_thresholds(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $body = $this->getJson('/api/bi/profiles'.self::QUERY)->assertOk()->json('body');

        $this->assertSame(['total' => 5, 'classified' => 4, 'unclassified' => 1], $body['summary']);
        $this->assertSame(['A1' => 1, 'A2' => 1, 'B1' => 1, 'B2' => 1], collect($body['quadrants'])->pluck('count', 'key')->all());
        $byName = collect($body['points'])->keyBy('name');
        $this->assertSame('A1', $byName['ANA']['quadrant']);
        $this->assertSame(88.0, (float) $byName['ANA']['performance']);
        $this->assertSame(0.7, (float) $byName['ANA']['dedication']);
        $this->assertSame('A2', $byName['BRUNO']['quadrant']);
        $this->assertSame('B1', $byName['CAIO']['quadrant']);
        $this->assertSame('B2', $byName['DUDA']['quadrant']);
        $this->assertSame(['CPM A'], $byName['ANA']['classes']);
        $this->assertSame(70.0, (float) $body['meta']['criteria']['goal_pct']);
    }

    public function test_teacher_scope_and_class_filter(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $body = $this->getJson('/api/bi/profiles'.self::QUERY)->assertOk()->json('body');
        $this->assertSame(['total' => 2, 'classified' => 1, 'unclassified' => 1], $body['summary']);
        $this->assertSame(['DUDA'], array_column($body['points'], 'name'));
    }
}
