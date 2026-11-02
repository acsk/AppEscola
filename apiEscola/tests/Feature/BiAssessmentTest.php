<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\ExamQuestion;
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
 * Cenário (período 01/09–31/10/2026; amostra mínima reduzida para 2):
 * - Simulado online E1 (Matemática 1 pt + História 1 pt): Ana 50% (acerta Mat.), Bruno 100%, Duda 0%.
 *   Retentativa da Ana (100%) não conta. Em agosto, Ana fez E0 (60%).
 * - Presencial P1 da CPM A (nota máx. 10): Ana Mat. 7 + Hist. 9 = 80%, Bruno faltou, Caio Mat. 4 = 40%.
 * CPM A: Ana, Bruno, Caio. CPM B: Duda, Edu.
 */
class BiAssessmentTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classA;

    private SchoolClass $classB;

    private Subject $math;

    private Subject $history;

    private int $exam;

    private int $presencial;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $catalog = config('bi_metrics');
        foreach (['assessments.avg_online', 'assessments.avg_presencial', 'assessments.below_goal_share'] as $key) {
            $catalog[$key]['min_sample'] = 2;
        }
        config()->set('bi_metrics', $catalog);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->history = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'História', 'status' => 'active']);

        foreach (['ana' => $this->classA, 'bruno' => $this->classA, 'caio' => $this->classA, 'duda' => $this->classB, 'edu' => $this->classB] as $name => $class) {
            $this->students[$name] = $this->enrolled(ucfirst($name), $class);
        }

        $this->exam = $this->examId('Simulado E1');
        $qMath = $this->question($this->exam, $this->math);
        $qHistory = $this->question($this->exam, $this->history);
        foreach (['ana' => [true, false], 'bruno' => [true, true], 'duda' => [false, false]] as $student => [$math, $history]) {
            $attempt = $this->attempt($student, $this->exam, ($math + $history) * 50, '2026-09-10 12:00:00');
            $this->answer($attempt, $qMath, $math);
            $this->answer($attempt, $qHistory, $history);
        }
        $this->attempt('ana', $this->exam, 100, '2026-09-20 12:00:00'); // retentativa: não conta

        $old = $this->examId('Simulado E0');
        $this->attempt('ana', $old, 60, '2026-08-10 12:00:00');

        $this->presencial = DB::table('official_assessments')->insertGetId([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id, 'title' => 'Bimestral',
            'kind' => 'presencial_bimestral', 'assessment_date' => '2026-10-05', 'max_score' => 10, 'weight' => 1,
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->grade('ana', $this->math, 7);
        $this->grade('ana', $this->history, 9);
        $this->grade('bruno', $this->math, null, true);
        $this->grade('bruno', $this->history, null, true);
        $this->grade('caio', $this->math, 4);
    }

    private function admin(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    private function metric(array $body, string $key): array
    {
        return collect($body['metrics'])->firstWhere('key', $key);
    }

    public function test_overview_metrics_and_list_keep_modalities_apart(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson('/api/bi/assessments'.self::QUERY)->assertOk()->json('body');

        $count = $this->metric($body, 'assessments.count');
        $this->assertSame(2.0, (float) $count['value']);
        $this->assertSame(1.0, (float) $count['previous']);
        $this->assertSame(50.0, (float) $this->metric($body, 'assessments.avg_online')['value']);
        $this->assertNull($this->metric($body, 'assessments.avg_online')['previous']); // 1 resultado em agosto < mínimo
        $this->assertSame(60.0, (float) $this->metric($body, 'assessments.avg_presencial')['value']);
        $this->assertSame(60.0, (float) $this->metric($body, 'assessments.below_goal_share')['value']); // 3 de 5
        $participation = $this->metric($body, 'exams.participation');
        $this->assertNull($participation['value']); // 5 ativos < 10
        $this->assertSame(3, $participation['sample']['students']);

        $items = $body['items']['items'];
        $this->assertSame(['presencial', 'online'], array_column($items, 'modality'));
        $this->assertSame('CPM A', $items[0]['school_class']);
        $this->assertSame(2, $items[0]['participants']);
        $this->assertSame(1, $items[0]['absent']);
        $this->assertSame(60.0, (float) $items[0]['avg']);
        $this->assertSame('Simulado E1', $items[1]['title']);
        $this->assertSame(3, $items[1]['participants']);
        $this->assertNull($items[1]['absent']);
        $this->assertSame(2, $items[1]['below_goal']);

        $months = collect($body['monthly'])->keyBy('month');
        $this->assertSame(50.0, (float) $months['2026-09']['online']['value']);
        $this->assertNull($months['2026-09']['presencial']['value']);
        $this->assertSame(60.0, (float) $months['2026-10']['presencial']['value']);
    }

    public function test_online_detail_distribution_classes_and_subjects(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/assessments/online/{$this->exam}".self::QUERY)->assertOk()->json('body');

        $this->assertSame('Simulado E1', $body['assessment']['title']);
        $stats = $body['stats'];
        $this->assertSame(3, $stats['participants']);
        $this->assertSame(50.0, (float) $stats['avg']);
        $this->assertSame(50.0, (float) $stats['median']);
        $this->assertSame(0.0, (float) $stats['min']);
        $this->assertSame(100.0, (float) $stats['max']);
        $this->assertSame(33.3, (float) $stats['at_goal_pct']);
        $this->assertSame([1, 0, 0, 0, 0, 1, 0, 0, 0, 1], array_column($body['histogram'], 'count'));

        $classes = collect($body['classes'])->keyBy('name');
        $this->assertSame(75.0, (float) $classes['CPM A']['avg']);
        $this->assertNull($classes['CPM B']['avg']); // 1 participante < mínimo

        $this->assertSame(['HISTÓRIA', 'MATEMÁTICA'], array_column($body['subjects'], 'name'));
        $this->assertSame([33.3, 66.7], array_map('floatval', array_column($body['subjects'], 'pct')));

        $this->assertSame(
            [$this->students['duda']->id, $this->students['ana']->id, $this->students['bruno']->id],
            array_column($body['students']['items'], 'student_id'),
        );
    }

    public function test_presencial_detail_ignores_absences(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/assessments/presencial/{$this->presencial}".self::QUERY)->assertOk()->json('body');

        $this->assertSame(2, $body['stats']['participants']);
        $this->assertSame(1, $body['stats']['absent']);
        $this->assertSame(60.0, (float) $body['stats']['avg']);
        $this->assertSame(10.0, (float) $body['assessment']['max_score']);
        $subjects = collect($body['subjects'])->keyBy('name');
        $this->assertSame(55.0, (float) $subjects['MATEMÁTICA']['pct']);
        $this->assertSame(90.0, (float) $subjects['HISTÓRIA']['pct']);
        $this->assertSame([], $body['topics']);
    }

    public function test_teacher_scope_and_not_found(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $items = $this->getJson('/api/bi/assessments'.self::QUERY)->assertOk()->json('body.items.items');
        $this->assertCount(1, $items);
        $this->assertSame(1, $items[0]['participants']);

        $this->getJson("/api/bi/assessments/presencial/{$this->presencial}".self::QUERY)->assertForbidden();
        $this->getJson("/api/bi/assessments/online/{$this->exam}".self::QUERY)
            ->assertOk()
            ->assertJsonPath('body.stats.participants', 1);

        $foreign = Tenant::factory()->create();
        $foreignExam = DB::table('exams')->insertGetId(['tenant_id' => $foreign->id, 'title' => 'X', 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson("/api/bi/assessments/online/{$foreignExam}".self::QUERY)->assertNotFound();
        $this->getJson('/api/bi/assessments/outro/1'.self::QUERY)->assertNotFound();
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

    private function examId(string $title): int
    {
        return DB::table('exams')->insertGetId([
            'tenant_id' => $this->tenant->id, 'title' => $title, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function question(int $examId, Subject $subject): ExamQuestion
    {
        return ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'type' => 'multiple_choice',
            'question_text' => 'Questão', 'subject_id' => $subject->id, 'points' => 1, 'order' => 1,
        ]);
    }

    private function attempt(string $student, int $examId, float $pct, string $finishedAt): int
    {
        return DB::table('exam_attempts')->insertGetId([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'student_id' => $this->students[$student]->id,
            'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
            'started_at' => $finishedAt, 'finished_at' => $finishedAt,
            'score' => $pct / 50, 'max_score' => 2, 'percentage' => $pct,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function answer(int $attemptId, ExamQuestion $question, bool $correct): void
    {
        DB::table('exam_answers')->insert([
            'attempt_id' => $attemptId, 'question_id' => $question->id, 'is_correct' => $correct,
            'points_earned' => $correct ? 1 : 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function grade(string $student, Subject $subject, ?float $grade, bool $absent = false): void
    {
        DB::table('official_assessment_grades')->insert([
            'tenant_id' => $this->tenant->id, 'official_assessment_id' => $this->presencial,
            'student_id' => $this->students[$student]->id, 'subject_id' => $subject->id,
            'grade' => $grade, 'is_absent' => $absent, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
