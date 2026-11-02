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
use Tests\Concerns\AssertsBiFactsParity;
use Tests\TestCase;

/**
 * Cenário (período 01/09–31/10/2026; amostras mínimas de médias e participação reduzidas para 2):
 * - CPM A: Ana (online 40 → 60, presencial 70, banco 3/5), Bruno (online 80 → 50), Caio (frequência 2/4).
 * - CPM B: Duda (online 90).
 */
class BiClassTest extends TestCase
{
    use RefreshDatabase;
    use AssertsBiFactsParity;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classA;

    private SchoolClass $classB;

    private Subject $math;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $catalog = config('bi_metrics');
        foreach (['assessments.avg_online', 'assessments.avg_presencial', 'exams.participation'] as $key) {
            $catalog[$key]['min_sample'] = 2;
        }
        config()->set('bi_metrics', $catalog);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);

        foreach (['ana' => $this->classA, 'bruno' => $this->classA, 'caio' => $this->classA, 'duda' => $this->classB] as $name => $class) {
            $this->students[$name] = $this->enrolled(ucfirst($name), $class);
        }

        $e1 = $this->examId('Simulado 1');
        $e2 = $this->examId('Simulado 2');
        $this->attempt('ana', $e1, 40, '2026-09-10 12:00:00');
        $this->attempt('ana', $e2, 60, '2026-10-20 12:00:00');
        $this->attempt('bruno', $e1, 80, '2026-09-10 12:00:00');
        $this->attempt('bruno', $e2, 50, '2026-10-20 12:00:00');
        $this->attempt('duda', $e1, 90, '2026-09-11 12:00:00');

        $assessment = DB::table('official_assessments')->insertGetId([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id, 'title' => 'Bimestral',
            'kind' => 'presencial_bimestral', 'assessment_date' => '2026-10-05', 'max_score' => 10, 'weight' => 1,
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('official_assessment_grades')->insert([
            'tenant_id' => $this->tenant->id, 'official_assessment_id' => $assessment, 'student_id' => $this->students['ana']->id,
            'subject_id' => $this->math->id, 'grade' => 7, 'is_absent' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);

        foreach ([true, true, true, false, false] as $correct) {
            $question = ExamQuestion::create([
                'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Questão',
                'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
            ]);
            PracticeAnswer::query()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $this->students['ana']->id,
                'exam_question_id' => $question->id, 'is_correct' => $correct, 'answered_at' => '2026-09-15 12:00:00',
            ]);
        }

        foreach (['2026-10-01' => 'present', '2026-10-02' => 'absent', '2026-10-03' => 'late', '2026-10-04' => 'absent'] as $date => $status) {
            DB::table('student_attendances')->insert([
                'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id, 'student_id' => $this->students['caio']->id,
                'attendance_date' => $date, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    private function admin(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    public function test_classes_are_compared_with_the_same_rules_as_the_overview(): void
    {
        Sanctum::actingAs($this->admin());

        $items = collect($this->getJson('/api/bi/classes'.self::QUERY)->assertOk()->json('body.items'))->keyBy('name');

        $this->assertSame(['CPM A', 'CPM B'], $items->keys()->all());
        $a = $items['CPM A']['metrics'];
        $this->assertSame(3.0, (float) $a['students']['value']);
        $this->assertSame(57.5, (float) $a['avg_online']['value']);
        $this->assertNull($a['avg_presencial']['value']); // 1 resultado < mínimo
        $this->assertSame(60.0, (float) $a['practice']['value']);
        $this->assertSame(50.0, (float) $a['attendance']['value']);
        $this->assertSame(66.7, (float) $a['participation']['value']);
        $this->assertSame(3.0, (float) $a['needs_support']['value']);

        $b = $items['CPM B']['metrics'];
        $this->assertNull($b['avg_online']['value']);
        $this->assertFalse($b['avg_online']['sufficient']);
        $this->assertSame(0.0, (float) $b['needs_support']['value']);
    }

    public function test_class_detail_lists_students_with_signals(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/classes/{$this->classA->id}".self::QUERY)->assertOk()->json('body');

        $this->assertSame('CPM A', $body['school_class']['name']);
        $this->assertSame(3, $body['students']['total']);
        $this->assertSame(3, $body['students']['needs_support']);

        $students = collect($body['students']['items']);
        $this->assertSame($this->students['bruno']->id, $students[0]['student_id']); // 2 motivos primeiro
        $byId = $students->keyBy('student_id');
        $bruno = $byId[$this->students['bruno']->id];
        $this->assertSame(65.0, (float) $bruno['online']['value']);
        $this->assertSame(-30.0, (float) $bruno['evolution_pp']);
        $ana = $byId[$this->students['ana']->id];
        $this->assertNull($ana['presencial']['value']);
        $this->assertSame(1, $ana['presencial']['n']);
        $this->assertSame(60.0, (float) $ana['practice']['value']);
        $this->assertSame(20.0, (float) $ana['evolution_pp']);
        $caio = $byId[$this->students['caio']->id];
        $this->assertSame(50.0, (float) $caio['attendance']['value']);
        $this->assertSame(['low_attendance'], array_column($caio['reasons'], 'code'));
    }

    public function test_facts_match_live_calculation(): void
    {
        Sanctum::actingAs($this->admin());

        $this->assertFactsMatchLive([
            '/api/bi/classes'.self::QUERY,
            "/api/bi/classes/{$this->classA->id}".self::QUERY,
        ]);
    }

    public function test_teacher_scope_and_not_found(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $this->assertSame(['CPM B'], array_column($this->getJson('/api/bi/classes'.self::QUERY)->assertOk()->json('body.items'), 'name'));
        $this->getJson("/api/bi/classes/{$this->classB->id}".self::QUERY)
            ->assertOk()
            ->assertJsonPath('body.school_class.teachers.0', $teacher->name);
        $this->getJson("/api/bi/classes/{$this->classA->id}".self::QUERY)->assertForbidden();

        $foreign = SchoolClass::factory()->create([
            'tenant_id' => ($other = Tenant::factory()->create())->id,
            'course_id' => Course::factory()->create(['tenant_id' => $other->id])->id,
        ]);
        $this->getJson("/api/bi/classes/{$foreign->id}".self::QUERY)->assertNotFound();
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

    private function attempt(string $student, int $examId, float $pct, string $finishedAt): void
    {
        DB::table('exam_attempts')->insert([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'student_id' => $this->students[$student]->id,
            'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
            'started_at' => $finishedAt, 'finished_at' => $finishedAt,
            'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
