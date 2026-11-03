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
 * Cenário (01/09–31/10/2026; metades 01–30/09 e 01–31/10):
 * - CPM A (12 alunos): 6 com simulados 40% → 60% (+20) e 6 com 70% → 65% (−5); banco de Matemática errado na
 *   1ª metade e certo na 2ª (1 resposta em cada).
 * - CPM B (3 alunos, abaixo do mínimo de 10): 50% → 50%.
 * Evolução média = (6×20 − 6×5 + 3×0) ÷ 15 = 6,0 pp; evolução positiva = 6 de 15 = 40%.
 */
class BiReportTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classA;

    private SchoolClass $classB;

    private Subject $math;

    /** @var list<Student> */
    private array $a = [];

    /** @var list<Student> */
    private array $b = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $e1 = DB::table('exams')->insertGetId(['tenant_id' => $this->tenant->id, 'title' => 'S1', 'created_at' => now(), 'updated_at' => now()]);
        $e2 = DB::table('exams')->insertGetId(['tenant_id' => $this->tenant->id, 'title' => 'S2', 'created_at' => now(), 'updated_at' => now()]);

        for ($i = 0; $i < 15; $i++) {
            $class = $i < 12 ? $this->classA : $this->classB;
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Aluno '.$i, 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            [$first, $second] = $i < 6 ? [40, 60] : ($i < 12 ? [70, 65] : [50, 50]);
            $this->attempt($student, $e1, $first, '2026-09-10');
            $this->attempt($student, $e2, $second, '2026-10-20');
            if ($i < 12) {
                $this->a[] = $student;
                $this->practice($student, false, '2026-09-15');
                $this->practice($student, true, '2026-10-15');
            } else {
                $this->b[] = $student;
            }
        }
    }

    private function coord(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']);
    }

    private function teacherOfB(): User
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id, 'subject_id' => $this->math->id, 'teacher_id' => $teacher->id]);

        return $teacher;
    }

    public function test_results_report_is_aggregated_with_methodology_and_approvals(): void
    {
        $coord = $this->coord();
        Sanctum::actingAs($coord);
        $this->postJson('/api/bi/exam-outcomes', ['student_id' => $this->a[0]->id, 'exam_name' => 'CPM 2026', 'year' => 2026, 'result' => 'approved', 'consent_publish' => true])->assertCreated();
        $this->postJson('/api/bi/exam-outcomes', ['student_id' => $this->a[1]->id, 'exam_name' => 'CPM 2026', 'year' => 2026, 'result' => 'classified'])->assertCreated();

        $body = $this->getJson('/api/bi/reports/results'.self::QUERY.'&export=pdf')->assertOk()->json('body');

        $this->assertSame(6.0, (float) $body['headline']['evolution_pp']);
        $this->assertSame(40.0, (float) $body['headline']['improving_pct']);
        $this->assertSame(30, $body['headline']['assessments_taken']);
        $this->assertSame(2, $body['headline']['online_exams']);
        $this->assertSame(24, $body['headline']['questions_answered']);
        $this->assertSame(100.0, (float) $body['headline']['participation_pct']);
        $this->assertSame(['start' => 0.0, 'end' => 100.0, 'delta_pp' => 100.0], array_map('floatval', array_intersect_key($body['subjects'][0], array_flip(['start', 'end', 'delta_pp']))));
        $this->assertSame(['total' => 2, 'with_consent' => 1], array_intersect_key($body['approvals'], array_flip(['total', 'with_consent'])));
        $this->assertNotEmpty($body['methodology']);
        $this->assertStringNotContainsString('Aluno 0', json_encode($body)); // nenhum aluno identificado

        $log = DB::table('bi_export_logs')->first();
        $this->assertSame(['results', 'pdf', $coord->id], [$log->report, $log->format, (int) $log->user_id]);
        $this->getJson('/api/bi/reports/results'.self::QUERY.'&export=xlsx')->assertStatus(422);

        // Recorte com menos de 10 alunos não gera relatório agregado.
        $this->getJson('/api/bi/reports/results'.self::QUERY.'&school_class_id='.$this->classB->id)
            ->assertStatus(422)
            ->assertJsonPath('body.code', 'report_sample_too_small');
    }

    public function test_institutional_report_hides_small_groups_and_names(): void
    {
        Sanctum::actingAs($this->coord());

        $body = $this->getJson('/api/bi/reports/institutional'.self::QUERY.'&export=xlsx')->assertOk()->json('body');

        $classes = collect($body['classes']['items'])->keyBy('name');
        $this->assertFalse($classes['CPM A']['suppressed']);
        $this->assertTrue($classes['CPM B']['suppressed']);
        $this->assertArrayNotHasKey('metrics', $classes['CPM B']);
        $this->assertArrayNotHasKey('items', $body['overview']['needs_support']);
        $this->assertArrayNotHasKey('lowest', $body['engagement']);
        $this->assertSame(1, DB::table('bi_export_logs')->where('report', 'institutional')->count());

        Sanctum::actingAs($this->teacherOfB());
        $this->getJson('/api/bi/reports/institutional'.self::QUERY)->assertForbidden();
    }

    public function test_individual_class_and_subject_reports_respect_scope(): void
    {
        Sanctum::actingAs($this->coord());
        $individual = $this->getJson('/api/bi/reports/individual'.self::QUERY.'&student_id='.$this->a[0]->id)->assertOk()->json('body');
        $this->assertSame(20.0, (float) $individual['evolution']['student']['evolution_pp']);
        $this->assertNotNull($individual['diagnosis']);
        $this->assertSame(0, DB::table('bi_export_logs')->count()); // prévia não registra
        $this->getJson('/api/bi/reports/individual'.self::QUERY.'&student_id='.$this->a[0]->id.'&export=xlsx')->assertStatus(422);
        $this->getJson('/api/bi/reports/individual'.self::QUERY)->assertStatus(422);

        $this->getJson('/api/bi/reports/class'.self::QUERY.'&report_class_id='.$this->classA->id.'&export=xlsx')
            ->assertOk()
            ->assertJsonPath('body.detail.school_class.name', 'CPM A');
        $this->getJson('/api/bi/reports/subject'.self::QUERY.'&report_subject_id='.$this->math->id)
            ->assertOk()
            ->assertJsonPath('body.analytics.subject.id', $this->math->id);

        $teacher = $this->teacherOfB();
        Sanctum::actingAs($teacher);
        $this->getJson('/api/bi/reports/individual'.self::QUERY.'&student_id='.$this->a[0]->id)->assertForbidden();
        $this->getJson('/api/bi/reports/class'.self::QUERY.'&report_class_id='.$this->classA->id)->assertForbidden();
        $this->getJson('/api/bi/reports/individual'.self::QUERY.'&student_id='.$this->b[0]->id.'&export=pdf')->assertOk();
        $this->assertSame(1, count($this->getJson('/api/bi/exports')->assertOk()->json('body.items'))); // só as próprias
        $this->postJson('/api/bi/exam-outcomes', ['student_id' => $this->b[0]->id, 'exam_name' => 'X', 'year' => 2026, 'result' => 'approved'])->assertForbidden();
    }

    public function test_templates_are_personal_unless_shared_by_coordination(): void
    {
        $coord = $this->coord();
        Sanctum::actingAs($coord);
        $shared = $this->postJson('/api/bi/report-templates', ['name' => 'Institucional semestral', 'report' => 'institutional', 'config' => ['indicators' => ['evolution'], 'executive_summary' => 'Texto revisado.'], 'shared' => true])
            ->assertCreated()->json('body.id');

        $teacher = $this->teacherOfB();
        Sanctum::actingAs($teacher);
        $this->postJson('/api/bi/report-templates', ['name' => 'Minha turma', 'report' => 'class', 'config' => ['charts' => true], 'shared' => true])->assertCreated();
        $items = collect($this->getJson('/api/bi/report-templates')->assertOk()->json('body.items'))->keyBy('name');
        $this->assertSame('Texto revisado.', $items['Institucional semestral']['config']['executive_summary']);
        $this->assertFalse($items['Minha turma']['shared']); // professor não compartilha
        $this->deleteJson("/api/bi/report-templates/{$shared}")->assertForbidden();

        Sanctum::actingAs($coord);
        $this->deleteJson("/api/bi/report-templates/{$shared}")->assertOk();
    }

    private function attempt(Student $student, int $examId, float $pct, string $day): void
    {
        DB::table('exam_attempts')->insert([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'student_id' => $student->id,
            'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
            'started_at' => $day.' 12:00:00', 'finished_at' => $day.' 12:00:00',
            'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function practice(Student $student, bool $correct, string $day): void
    {
        $q = ExamQuestion::create(['tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1]);
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $student->id,
            'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => $day.' 12:00:00',
        ]);
    }
}
