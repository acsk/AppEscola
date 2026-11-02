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
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (período 01/09–31/10/2026; anterior 03/07–31/08):
 * - CPM A: Ana (online 40 → 60, presencial 70; Frações no banco: 1/5 antes, 4/5 agora), Bruno (online 80 → 50), Caio (sem dados).
 * - CPM B: Duda (online 90).
 */
class BiStudentTest extends TestCase
{
    use RefreshDatabase;

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

        $fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);
        foreach ([true, false, false, false, false] as $correct) {
            $this->practice($fractions, $correct, '2026-08-10 12:00:00');
        }
        foreach ([true, true, true, true, false] as $correct) {
            $this->practice($fractions, $correct, '2026-09-15 12:00:00');
        }
    }

    private function admin(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    public function test_list_summarizes_and_filters_students(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson('/api/bi/students'.self::QUERY)->assertOk()->json('body');
        $this->assertSame(['total' => 4, 'attention' => 2, 'improving' => 1, 'declining' => 1, 'with_evolution' => 2], $body['summary']);
        $this->assertSame($this->students['bruno']->id, $body['items'][0]['student_id']); // 2 motivos primeiro
        $this->assertSame(['CPM A'], $body['items'][0]['classes']);

        $attention = $this->getJson('/api/bi/students'.self::QUERY.'&filter=attention')->assertOk()->json('body.items');
        $this->assertSame([$this->students['bruno']->id, $this->students['ana']->id], array_column($attention, 'student_id'));

        $improving = $this->getJson('/api/bi/students'.self::QUERY.'&filter=improving')->assertOk()->json('body.items');
        $this->assertSame([20.0], array_map('floatval', array_column($improving, 'evolution_pp')));

        $search = $this->getJson('/api/bi/students'.self::QUERY.'&search=dud')->assertOk()->json('body');
        $this->assertSame([$this->students['duda']->id], array_column($search['items'], 'student_id'));

        $page = $this->getJson('/api/bi/students'.self::QUERY.'&per_page=5&page=9')->assertOk()->json('body.pagination');
        $this->assertSame(['page' => 1, 'per_page' => 5, 'total' => 4, 'last_page' => 1], $page);

        $this->getJson('/api/bi/students'.self::QUERY.'&filter=outro')->assertStatus(422);
    }

    public function test_student_evolution_compares_with_classmates(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/students/{$this->students['ana']->id}/evolution".self::QUERY)->assertOk()->json('body');

        $this->assertSame(20.0, (float) $body['student']['evolution_pp']);
        $this->assertSame(3, $body['peers']['students']);

        $series = collect($body['series'])->keyBy('modality');
        $online = $series['online']['points'];
        $this->assertSame([40.0, 60.0], array_map('floatval', array_column($online, 'pct')));
        $this->assertSame([80.0, 50.0], array_map('floatval', array_column($online, 'peers_avg'))); // só Bruno (Duda é da CPM B)
        $this->assertSame('Simulado 1', $online[0]['title']);
        $this->assertSame(70.0, (float) $series['presencial']['points'][0]['pct']);
        $this->assertNull($series['presencial']['points'][0]['peers_avg']);

        $this->assertSame(80.0, (float) $body['subjects'][0]['accuracy']);
        $this->assertNull($body['subjects'][0]['peers_accuracy']);

        $this->assertSame('Frações', $body['topics']['critical'][0]['name']);
        $this->assertSame(60.0, (float) $body['topics']['improving'][0]['delta_pp']);
        $this->assertSame(20.0, (float) $body['topics']['improving'][0]['previous']);
    }

    public function test_teacher_scope_and_not_found(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $this->assertSame(1, $this->getJson('/api/bi/students'.self::QUERY)->assertOk()->json('body.summary.total'));
        $this->getJson("/api/bi/students/{$this->students['duda']->id}/evolution".self::QUERY)->assertOk();
        $this->getJson("/api/bi/students/{$this->students['ana']->id}/evolution".self::QUERY)->assertForbidden();

        $foreign = Student::factory()->create(['tenant_id' => Tenant::factory()->create()->id]);
        $this->getJson("/api/bi/students/{$foreign->id}/evolution".self::QUERY)->assertNotFound();
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

    private function practice(SubjectTopic $topic, bool $correct, string $at): void
    {
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Questão',
            'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
        $question->topics()->sync([$topic->id]);
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->students['ana']->id,
            'exam_question_id' => $question->id, 'is_correct' => $correct, 'answered_at' => $at,
        ]);
    }
}
