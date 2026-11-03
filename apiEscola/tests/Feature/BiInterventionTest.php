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
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (hoje = 20/11/2026; período dos indicadores 01/09–31/10):
 * - Ana (CPM A): simulados 40% e 50% (abaixo da meta); Frações no banco 1/5 em 15/09 e 4/5 em 10/10.
 * - Duda (CPM B): simulados 30% e 20%.
 * Intervenção em Frações para a Ana a partir de 01/10: antes (60 dias) 20%, depois 80%.
 */
class BiInterventionTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const PERIOD = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private Subject $math;

    private SubjectTopic $fractions;

    private SchoolClass $classA;

    /** @var array<string, Student> */
    private array $students = [];

    /** @var array<string, User> */
    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-11-20 12:00:00');

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);

        foreach (['ana' => $this->classA, 'duda' => $classB] as $name => $class) {
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => ucfirst($name), 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            $this->students[$name] = $student;
        }
        foreach (['coord' => 'coordenador', 'teacher' => 'professor', 'other' => 'professor', 'office' => 'secretaria'] as $key => $role) {
            $this->users[$key] = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => $role]);
        }
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id,
            'subject_id' => $this->math->id, 'teacher_id' => $this->users['teacher']->id,
        ]);

        $exam = fn () => DB::table('exams')->insertGetId(['tenant_id' => $this->tenant->id, 'title' => 'S', 'created_at' => now(), 'updated_at' => now()]);
        foreach (['ana' => [40, 50], 'duda' => [30, 20]] as $name => $results) {
            foreach ($results as $i => $pct) {
                DB::table('exam_attempts')->insert([
                    'tenant_id' => $this->tenant->id, 'exam_id' => $exam(), 'student_id' => $this->students[$name]->id,
                    'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
                    'started_at' => '2026-09-1'.$i.' 12:00:00', 'finished_at' => '2026-09-1'.$i.' 12:00:00',
                    'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        foreach ([['2026-09-15', [true, false, false, false, false]], ['2026-10-10', [true, true, true, true, false]]] as [$day, $answers]) {
            foreach ($answers as $correct) {
                $q = ExamQuestion::create([
                    'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q',
                    'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
                ]);
                $q->topics()->sync([$this->fractions->id]);
                PracticeAnswer::query()->create([
                    'tenant_id' => $this->tenant->id, 'student_id' => $this->students['ana']->id,
                    'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => $day.' 12:00:00',
                ]);
            }
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'student_ids' => [$this->students['ana']->id],
            'type' => 'practice_list',
            'reason_code' => 'below_goal',
            'reason_detail' => 'Erro de denominador comum recorrente',
            'subject_id' => $this->math->id,
            'subject_topic_id' => $this->fractions->id,
            'school_class_id' => $this->classA->id,
            'responsible_user_id' => $this->users['teacher']->id,
            'starts_on' => '2026-10-01',
            'reassess_on' => '2026-11-15',
            'status' => 'in_progress',
        ];
    }

    public function test_full_flow_from_suggestion_to_effectiveness(): void
    {
        Sanctum::actingAs($this->users['coord']);
        $this->assertSame(2, $this->getJson('/api/bi/interventions/summary'.self::PERIOD)->assertOk()->json('body.suggestions'));

        $this->postJson("/api/bi/interventions/suggestions/{$this->students['duda']->id}/dismiss", ['reason' => 'Já acompanhada pela família'])->assertOk();
        $suggestions = $this->getJson('/api/bi/interventions/suggestions'.self::PERIOD)->assertOk()->json('body.items');
        $this->assertSame([$this->students['ana']->id], array_column($suggestions, 'student_id'));

        $created = $this->postJson('/api/bi/interventions', $this->payload())->assertCreated()->json('body');
        $this->assertSame('individual', $created['kind']);
        $this->assertSame(20.0, (float) $created['students'][0]['baseline']['pct']);
        $this->assertSame(80.0, (float) $created['students'][0]['current']['pct']); // parcial
        $this->assertSame('done', $created['steps'][2]['state']); // criada pela coordenação
        $this->assertSame('current', $created['steps'][5]['state']);
        $this->assertSame(0, $this->getJson('/api/bi/interventions/summary'.self::PERIOD)->json('body.suggestions'));

        // Responsável registra progresso e conclui; outro professor não vê.
        Sanctum::actingAs($this->users['other']);
        $this->getJson("/api/bi/interventions/{$created['id']}")->assertNotFound();

        Sanctum::actingAs($this->users['teacher']);
        $this->postJson("/api/bi/interventions/{$created['id']}/events", ['type' => 'progress', 'description' => 'Lista 14/20'])->assertOk();
        $done = $this->postJson("/api/bi/interventions/{$created['id']}/complete", ['note' => 'Reavaliado no simulado'])->assertOk()->json('body');
        $this->assertSame('completed', $done['status']);
        $this->assertSame(80.0, (float) $done['students'][0]['result']['pct']);
        $this->assertSame('done', $done['steps'][7]['state']);
        $this->postJson("/api/bi/interventions/{$created['id']}/complete")->assertStatus(422);

        Sanctum::actingAs($this->users['coord']);
        $effectiveness = $this->getJson('/api/bi/interventions/effectiveness?from=2026-11-01&to=2026-11-30')->assertOk()->json('body');
        $this->assertSame(1, $effectiveness['completed']);
        $this->assertSame(['before' => 20.0, 'after' => 80.0, 'delta_pp' => 60.0], array_map('floatval', array_intersect_key($effectiveness['items'][0], array_flip(['before', 'after', 'delta_pp']))));
        $this->assertSame(1, count($this->getJson('/api/bi/interventions?tab=completed')->json('body.items')));
    }

    public function test_teacher_and_office_permissions(): void
    {
        Sanctum::actingAs($this->users['teacher']);
        $this->postJson('/api/bi/interventions', $this->payload(['student_ids' => [$this->students['duda']->id]]))->assertForbidden();
        $mine = $this->postJson('/api/bi/interventions', $this->payload(['responsible_user_id' => $this->users['office']->id]))->assertCreated()->json('body');

        Sanctum::actingAs($this->users['office']);
        $this->getJson('/api/bi/meta')->assertForbidden(); // fora do BI
        $this->assertSame([$mine['id']], array_column($this->getJson('/api/bi/interventions')->assertOk()->json('body.items'), 'id'));
        $this->postJson('/api/bi/interventions', $this->payload())->assertForbidden();
        $this->putJson("/api/bi/interventions/{$mine['id']}", ['status' => 'reassessment'])->assertOk()->assertJsonPath('body.status', 'reassessment');
        $this->assertSame(0, $this->getJson('/api/bi/interventions/summary'.self::PERIOD)->json('body.suggestions'));

        $this->putJson("/api/bi/interventions/{$mine['id']}", ['status' => 'completed'])->assertStatus(422);
    }
}
