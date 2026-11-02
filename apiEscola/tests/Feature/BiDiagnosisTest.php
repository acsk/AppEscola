<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\ExamQuestion;
use App\Models\ExamType;
use App\Models\PracticeAnswer;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (01/09–31/10/2026 = 61 dias; meta da escola 85%; curso da CPM A mira o concurso T):
 * - Ana (CPM A): simulados de T 40% (10/09) e 60% (20/10); banco Frações 3/5 (15/09) e Porcentagem 5/5 (16/09);
 *   frequência 3 presenças + 1 falta (01–04/10). Prioritários de T: Frações peso 3, Porcentagem peso 1.
 * - Bruno (CPM A): simulado de T 80% (10/09). Duda (CPM B): 90%.
 *
 * Aprendizagem Ana = 0,6 × 50 + 0,4 × 80 = 62.
 * Engajamento Ana = 0,4 × 75 + 0,3 × (7 dias ÷ 8,71 semanas ÷ 3 × 100 = 26,8) + 0,3 × 100 (2 de 2 simulados da turma) = 68.
 * Preparação Ana = 0,5 × 70 (domínio (3×60 + 1×100) ÷ 4) + 0,3 × 100 (cobertura) + 0,2 × 90 (tendência 50 + 2 × 20) = 83.
 */
class BiDiagnosisTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classB;

    private Subject $math;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        config()->set('bi.goal_pct', 85);

        $this->tenant = Tenant::factory()->create();
        $examType = ExamType::query()->firstOrFail();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $course->update(['target_exam_type_id' => $examType->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);
        $percent = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Porcentagem']);
        DB::table('bi_priority_topics')->insert([
            ['tenant_id' => $this->tenant->id, 'exam_type_id' => $examType->id, 'subject_topic_id' => $fractions->id, 'weight' => 3, 'created_at' => now(), 'updated_at' => now()],
            ['tenant_id' => $this->tenant->id, 'exam_type_id' => $examType->id, 'subject_topic_id' => $percent->id, 'weight' => 1, 'created_at' => now(), 'updated_at' => now()],
        ]);

        foreach (['ana' => $classA, 'bruno' => $classA, 'duda' => $this->classB] as $name => $class) {
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => ucfirst($name), 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            $this->students[$name] = $student;
        }

        $e1 = $this->exam($examType->id);
        $e2 = $this->exam($examType->id);
        $this->attempt('ana', $e1, 40, '2026-09-10 12:00:00');
        $this->attempt('ana', $e2, 60, '2026-10-20 12:00:00');
        $this->attempt('bruno', $e1, 80, '2026-09-10 12:00:00');
        $this->attempt('duda', $e1, 90, '2026-09-10 12:00:00');

        foreach ([[$fractions, [true, true, true, false, false], '2026-09-15 12:00:00'], [$percent, [true, true, true, true, true], '2026-09-16 12:00:00']] as [$topic, $answers, $at]) {
            foreach ($answers as $correct) {
                $q = ExamQuestion::create([
                    'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q',
                    'subject_id' => $this->math->id, 'exam_type_id' => $examType->id, 'points' => 1, 'order' => 1,
                ]);
                $q->topics()->sync([$topic->id]);
                PracticeAnswer::query()->create([
                    'tenant_id' => $this->tenant->id, 'student_id' => $this->students['ana']->id,
                    'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => $at,
                ]);
            }
        }

        foreach (['2026-10-01' => 'present', '2026-10-02' => 'present', '2026-10-03' => 'late', '2026-10-04' => 'absent'] as $date => $status) {
            DB::table('student_attendances')->insert([
                'tenant_id' => $this->tenant->id, 'school_class_id' => $classA->id, 'student_id' => $this->students['ana']->id,
                'attendance_date' => $date, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function test_diagnosis_combines_the_three_dimensions(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $body = $this->getJson("/api/bi/students/{$this->students['ana']->id}/diagnosis".self::QUERY)->assertOk()->json('body');

        $this->assertSame('CPM A', $body['student']['school_class']['name']);
        $this->assertSame(0.8, (float) $body['student']['active_days_per_week']);
        $this->assertFalse($body['meta']['priorities_provisional']);

        $d = $body['dimensions'];
        $this->assertSame(62.0, (float) $d['learning']['value']);
        $this->assertSame(62.0, (float) $d['learning']['class_avg']); // Bruno sem amostra: fora da média
        $this->assertSame(68.0, (float) $d['engagement']['value']);
        $this->assertSame(83.0, (float) $d['preparation']['value']);
        $this->assertNull($d['learning']['previous']);
        $this->assertSame('score', $d['learning']['unit']);
        $this->assertSame(
            ['assessments' => 50.0, 'practice' => 80.0],
            collect($d['learning']['components'])->mapWithKeys(fn ($c) => [$c['key'] => (float) $c['value']])->all(),
        );

        $this->assertEquals(['subject' => 'MATEMÁTICA', 'accuracy' => 80, 'topics' => ['Frações', 'Porcentagem']], $body['highlight']);
        $this->assertCount(8, $body['history']);
        $this->assertSame('Out', end($body['history'])['label']);

        $domain = $body['domain'][0];
        $this->assertSame(['Frações', 'Porcentagem'], array_column($domain['topics'], 'name')); // por peso
        $this->assertSame([60.0, 100.0], array_map('floatval', array_column($domain['topics'], 'value')));
        $this->assertTrue($domain['topics'][0]['below_goal']);

        $this->assertSame(['practice_list', 'routine'], array_column($body['recommendations'], 'type'));
        $this->assertSame('Lista direcionada: Frações', $body['recommendations'][0]['title']);
    }

    public function test_student_without_enough_data_has_no_index_and_scope_is_enforced(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
        $bruno = $this->getJson("/api/bi/students/{$this->students['bruno']->id}/diagnosis".self::QUERY)->assertOk()->json('body.dimensions');
        $this->assertNull($bruno['learning']['value']);
        $this->assertFalse($bruno['learning']['sufficient']);

        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);
        $this->getJson("/api/bi/students/{$this->students['ana']->id}/diagnosis".self::QUERY)->assertForbidden();
        $this->getJson("/api/bi/students/{$this->students['duda']->id}/diagnosis".self::QUERY)->assertOk();

        TenantSetting::create(['tenant_id' => $this->tenant->id, 'module' => 'bi', 'key' => 'plan', 'value' => TenantSetting::wrapValue('basic')]);
        $this->getJson("/api/bi/students/{$this->students['duda']->id}/diagnosis".self::QUERY)
            ->assertForbidden()
            ->assertJsonPath('body.code', 'bi_feature_disabled');
    }

    private function exam(int $examTypeId): int
    {
        return DB::table('exams')->insertGetId([
            'tenant_id' => $this->tenant->id, 'exam_type_id' => $examTypeId, 'title' => 'Simulado', 'created_at' => now(), 'updated_at' => now(),
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
