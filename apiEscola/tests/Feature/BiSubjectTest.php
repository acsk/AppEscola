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
use App\Models\TenantSetting;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\AssertsBiFactsParity;
use Tests\TestCase;

/**
 * Cenário de Matemática (período 01/09–31/10/2026; amostras mínimas reduzidas para 2 e 3):
 * - Frações: Q1 (Ana ✓ A, Bruno ✗ B, Duda ✗ B) e Q2 (Ana ✓, Bruno ✓, Duda ✗ C) → 3/6 = 50%.
 * - Porcentagem: Q3 no banco (3 acertos) + Q4 em simulado online (Ana ✗) → 3/4 = 75%.
 * - Período anterior: Frações 2/2 = 100%.
 * Ana e Bruno estão na CPM A; Duda na CPM B. Duda também respondeu História.
 */
class BiSubjectTest extends TestCase
{
    use RefreshDatabase;
    use AssertsBiFactsParity;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classA;

    private SchoolClass $classB;

    private Subject $math;

    private Subject $history;

    private SubjectTopic $fractions;

    private SubjectTopic $percent;

    /** @var array<string, Student> */
    private array $students = [];

    /** @var array<string, ExamQuestion> */
    private array $questions = [];

    /** @var array<string, array<string, int>> letra => id da alternativa, por questão */
    private array $options = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $catalog = config('bi_metrics');
        $catalog['subject.accuracy']['min_sample'] = 2;
        $catalog['questions.recurring_errors']['min_sample'] = 2;
        config()->set('bi_metrics', $catalog);
        config()->set('bi.min_subject_student_answers', 3);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->history = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'História', 'status' => 'active']);
        $this->fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);
        $this->percent = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Porcentagem']);

        foreach (['ana' => $this->classA, 'bruno' => $this->classA, 'duda' => $this->classB] as $name => $class) {
            $this->students[$name] = $this->enrolled(ucfirst($name), $class);
        }

        $at = '2026-09-15 12:00:00';
        $this->question('q1', $this->fractions, '<p>Quanto é <b>3/8 + 1/4</b>?</p>');
        $this->practice('ana', 'q1', 'A', true, $at);
        $this->practice('bruno', 'q1', 'B', false, $at);
        $this->practice('bruno', 'q1', 'A', true, '2026-09-20 12:00:00'); // retentativa: não conta
        $this->practice('duda', 'q1', 'B', false, $at);

        $this->question('q2', $this->fractions);
        $this->practice('ana', 'q2', 'A', true, $at);
        $this->practice('bruno', 'q2', 'A', true, $at);
        $this->practice('duda', 'q2', 'C', false, $at);

        $this->question('q3', $this->percent);
        foreach (['ana', 'bruno', 'duda'] as $student) {
            $this->practice($student, 'q3', 'A', true, $at);
        }

        $examId = DB::table('exams')->insertGetId([
            'tenant_id' => $this->tenant->id, 'title' => 'Simulado CPM 4', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->question('q4', $this->percent, 'Questão', $examId);
        $attemptId = DB::table('exam_attempts')->insertGetId([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'student_id' => $this->students['ana']->id,
            'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
            'started_at' => $at, 'finished_at' => $at, 'score' => 0, 'max_score' => 1, 'percentage' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('exam_answers')->insert([
            'attempt_id' => $attemptId, 'question_id' => $this->questions['q4']->id, 'option_id' => $this->options['q4']['B'],
            'is_correct' => false, 'points_earned' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Período anterior (03/07–31/08).
        $this->question('q5', $this->fractions);
        $this->practice('ana', 'q5', 'A', true, '2026-08-10 12:00:00');
        $this->practice('duda', 'q5', 'A', true, '2026-08-10 12:00:00');

        $this->question('h1', null, 'Questão', null, $this->history);
        $this->practice('duda', 'h1', 'A', true, $at);
    }

    private function admin(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    private function metric(array $body, string $key): array
    {
        return collect($body['metrics'])->firstWhere('key', $key);
    }

    public function test_subjects_are_listed_by_answers(): void
    {
        Sanctum::actingAs($this->admin());

        $subjects = $this->getJson('/api/bi/subjects'.self::QUERY)->assertOk()->json('body.subjects');

        $this->assertSame(['MATEMÁTICA', 'HISTÓRIA'], array_column($subjects, 'name'));
        $this->assertSame([10, 1], array_column($subjects, 'answers'));
    }

    public function test_subject_indicators_ranking_and_heatmap(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/subjects/{$this->math->id}".self::QUERY)->assertOk()->json('body');

        $answers = $this->metric($body, 'subject.answers');
        $this->assertSame(10.0, (float) $answers['value']);
        $this->assertSame(2.0, (float) $answers['previous']);
        $this->assertSame(60.0, (float) $this->metric($body, 'subject.accuracy')['value']);
        $evaluated = $this->metric($body, 'subject.students_evaluated');
        $this->assertSame(3.0, (float) $evaluated['value']);
        $this->assertSame(100.0, (float) $evaluated['sample']['pct_of_active']);
        $below = $this->metric($body, 'subject.topics_below_goal');
        $this->assertSame(1.0, (float) $below['value']);
        $this->assertSame(2, $below['sample']['topics_with_sample']);

        $ranking = $body['ranking']['items'];
        $this->assertSame(['Frações', 'Porcentagem'], array_column($ranking, 'name'));
        $this->assertSame(50.0, (float) $ranking[0]['accuracy']);
        $this->assertTrue($ranking[0]['below_goal']);
        $this->assertSame(-50.0, (float) $ranking[0]['delta_pp']);
        $this->assertSame(3, $ranking[0]['students']);
        $this->assertNull($ranking[1]['delta_pp']);

        $this->assertTrue($body['heatmap_available']);
        $heatmap = $body['heatmap'];
        $this->assertSame(['Frações', 'Porcentagem'], array_column($heatmap['topics'], 'name'));
        $rows = collect($heatmap['rows'])->keyBy('name');
        $this->assertSame([75.0, 66.7], array_map('floatval', array_column($rows['CPM A']['cells'], 'value')));
        $this->assertSame(0.0, (float) $rows['CPM B']['cells'][0]['value']); // amostra suficiente: zero real
        $this->assertNull($rows['CPM B']['cells'][1]['value']); // 1 resposta: insuficiente, não zero
        $this->assertSame(1, $rows['CPM B']['cells'][1]['answers']);
    }

    public function test_source_filter_separates_online_and_practice(): void
    {
        Sanctum::actingAs($this->admin());
        $url = "/api/bi/subjects/{$this->math->id}".self::QUERY;

        $practice = $this->getJson($url.'&source=practice')->assertOk()->json('body');
        $this->assertSame(9.0, (float) $this->metric($practice, 'subject.answers')['value']);
        $this->assertSame(100.0, (float) collect($practice['ranking']['items'])->firstWhere('name', 'Porcentagem')['accuracy']);

        $online = $this->getJson($url.'&source=online')->assertOk()->json('body');
        $this->assertSame(1.0, (float) $this->metric($online, 'subject.answers')['value']);

        $this->getJson($url.'&source=tudo')->assertStatus(422);
    }

    public function test_recurring_errors_show_option_distribution(): void
    {
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/subjects/{$this->math->id}/topics/{$this->fractions->id}/errors".self::QUERY)
            ->assertOk()
            ->json('body');

        $this->assertSame(2, $body['total']);
        $first = $body['items'][0];
        $this->assertSame($this->questions['q1']->id, $first['question_id']);
        $this->assertSame('Quanto é 3/8 + 1/4?', $first['text']);
        $this->assertSame('Banco de questões', $first['source_label']);
        $this->assertSame(66.7, (float) $first['error_rate']);
        $this->assertSame(['A', 'B', 'C', 'D'], array_column($first['options'], 'letter'));
        $this->assertTrue($first['options'][0]['is_correct']);
        $this->assertSame([1, 2, 0, 0], array_column($first['options'], 'count'));
        $this->assertSame('B', $first['main_distractor']['letter']);
        $this->assertSame(33.3, (float) $body['items'][1]['error_rate']);

        $percent = $this->getJson("/api/bi/subjects/{$this->math->id}/topics/{$this->percent->id}/errors".self::QUERY.'&source=online&limit=1')
            ->assertOk()
            ->json('body');
        $this->assertSame(0, $percent['total']); // 1 resposta < mínimo de 2

        $foreignTopic = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->history->id, 'name' => 'Brasil Colônia']);
        $this->getJson("/api/bi/subjects/{$this->math->id}/topics/{$foreignTopic->id}/errors".self::QUERY)->assertNotFound();
    }

    public function test_facts_match_live_calculation(): void
    {
        Sanctum::actingAs($this->admin());
        $base = "/api/bi/subjects/{$this->math->id}".self::QUERY;

        $this->assertFactsMatchLive([
            '/api/bi/subjects'.self::QUERY,
            $base,
            $base.'&source=online',
            $base.'&source=practice',
            "/api/bi/subjects/{$this->math->id}/topics/{$this->fractions->id}/errors".self::QUERY,
        ]);
    }

    public function test_teacher_is_limited_to_their_classes_and_subjects(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $subjects = $this->getJson('/api/bi/subjects'.self::QUERY)->assertOk()->json('body.subjects');
        $this->assertSame(['MATEMÁTICA'], array_column($subjects, 'name'));

        $body = $this->getJson("/api/bi/subjects/{$this->math->id}".self::QUERY)->assertOk()->json('body');
        $this->assertSame(3.0, (float) $this->metric($body, 'subject.answers')['value']);
        $this->assertSame(['CPM B'], array_column($body['heatmap']['rows'], 'name'));

        $this->getJson("/api/bi/subjects/{$this->history->id}".self::QUERY)->assertForbidden();
    }

    public function test_basic_plan_hides_heatmap_and_foreign_subject_is_not_found(): void
    {
        TenantSetting::create([
            'tenant_id' => $this->tenant->id, 'module' => 'bi', 'key' => 'plan', 'value' => TenantSetting::wrapValue('basic'),
        ]);
        Sanctum::actingAs($this->admin());

        $body = $this->getJson("/api/bi/subjects/{$this->math->id}".self::QUERY)->assertOk()->json('body');
        $this->assertFalse($body['heatmap_available']);
        $this->assertNull($body['heatmap']);
        $this->assertCount(2, $body['ranking']['items']);

        $foreign = Subject::create(['tenant_id' => Tenant::factory()->create()->id, 'name' => 'Química', 'status' => 'active']);
        $this->getJson("/api/bi/subjects/{$foreign->id}".self::QUERY)->assertNotFound();
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

    private function question(string $key, ?SubjectTopic $topic, string $text = 'Questão', ?int $examId = null, ?Subject $subject = null): void
    {
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'type' => 'multiple_choice',
            'question_text' => $text, 'subject_id' => ($subject ?? $this->math)->id, 'points' => 1, 'order' => 1,
        ]);
        if ($topic) {
            $question->topics()->sync([$topic->id]);
        }

        foreach (['A', 'B', 'C', 'D'] as $i => $letter) {
            $this->options[$key][$letter] = DB::table('exam_question_options')->insertGetId([
                'question_id' => $question->id, 'option_text' => "Alternativa {$letter}", 'is_correct' => $letter === 'A',
                'order' => $i + 1, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->questions[$key] = $question;
    }

    private function practice(string $student, string $question, string $letter, bool $correct, string $at): void
    {
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->students[$student]->id,
            'exam_question_id' => $this->questions[$question]->id, 'option_id' => $this->options[$question][$letter],
            'is_correct' => $correct, 'answered_at' => $at,
        ]);
    }
}
