<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\ExamQuestion;
use App\Models\PracticeAnswer;
use App\Models\QuestionGenerationJob;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\StudentReviewItem;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use App\Services\Learning\LearningReviewService;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Minha Aprendizagem: primeira tentativa, reforço e geração só quando falta conteúdo.
 * Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/LearningDiagnosisTest.php
 */
class LearningDiagnosisTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
    }

    public function test_diagnosis_uses_the_first_attempt_and_keeps_retakes_apart(): void
    {
        [$student, $topic] = $this->topic('Frações');
        $questions = [];
        foreach (range(1, 10) as $n) {
            $questions[] = $this->question("Questão {$n} de frações com enunciado longo", $topic);
        }
        foreach ($questions as $index => $question) {
            $this->record($student, $question, $index < 3, Carbon::parse('2026-08-02 15:00:00'));
        }
        foreach (array_slice($questions, 3) as $question) {
            $this->record($student, $question, true, Carbon::parse('2026-08-10 15:00:00'));
        }
        $this->actingAsStudent($student);

        $overview = $this->getJson('/api/aluno/learning/overview')->assertOk()->json('body');
        $this->assertSame(10, $overview['questions']);
        $this->assertSame(3, $overview['first_correct']);
        $this->assertSame(7, $overview['first_wrong']);
        $this->assertSame(7, $overview['retakes']);
        $this->assertSame(30, $overview['accuracy']);
        $this->assertSame(1, $overview['reinforcement_topics']);

        $row = $this->getJson('/api/aluno/learning/topics')->assertOk()->json('body.0');
        $this->assertSame('critical', $row['level']);
        $this->assertSame('Crítico', $row['label']);
        $this->assertSame(30, $row['accuracy']);
        $this->assertSame(7, $row['retakes']);
    }

    public function test_levels_follow_the_configured_cuts_and_a_small_sample_stays_insufficient(): void
    {
        $student = $this->student();
        $subject = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $cases = [
            'Crítico' => [2, 10, 'critical'],
            'Atenção' => [6, 10, 'attention'],
            'Bom' => [8, 10, 'good'],
            'Excelente' => [9, 10, 'excellent'],
            'Poucos' => [4, 4, 'insufficient'],
        ];
        foreach ($cases as $name => [$correct, $total, $level]) {
            $topic = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $subject->id, 'name' => $name]);
            foreach (range(1, $total) as $n) {
                $question = $this->question("{$name} questão {$n} com texto suficiente", $topic);
                $this->record($student, $question, $n <= $correct, Carbon::parse('2026-09-01 15:00:00'));
            }
            if (in_array($level, ['critical', 'attention', 'insufficient'], true)) {
                $this->question("{$name} questão inédita ainda não respondida", $topic);
            }
        }
        $this->inClass($student);
        $this->actingAsStudent($student);

        $rows = collect($this->getJson('/api/aluno/learning/topics')->assertOk()->json('body'))->keyBy('topic_name');
        foreach ($cases as $name => [$correct, $total, $level]) {
            $this->assertSame($level, $rows[$name]['level']);
        }
        $plan = collect($this->getJson('/api/aluno/learning/recommendations')->assertOk()->json('body'))->pluck('level')->all();
        $this->assertSame(['critical', 'attention', 'insufficient'], $plan);
        $this->assertSame(0, QuestionGenerationJob::query()->count());
    }

    public function test_recommendations_prefer_unseen_questions_and_ignore_other_students(): void
    {
        [$student, $topic] = $this->topic('Porcentagem');
        $seen = $this->question('Porcentagem já respondida pelo aluno neste assunto', $topic);
        $unseen = [
            $this->question('Porcentagem inédita número um para o plano de reforço', $topic),
            $this->question('Porcentagem inédita número dois para o plano de reforço', $topic),
        ];
        $this->record($student, $seen, false, now());
        $other = $this->student('JOÃO OUTRO');
        $this->inClass($student);
        $this->actingAsStudent($student);

        $plan = $this->getJson('/api/aluno/learning/recommendations')->assertOk()->json('body.0');
        $this->assertSame('insufficient', $plan['level']);
        $this->assertSame('unseen', $plan['source']);
        $this->assertSame(2, $plan['quantity']);

        $ids = collect($this->postJson('/api/aluno/learning/reinforcement', ['topic_id' => $topic->id])
            ->assertCreated()
            ->json('body.questions'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect($unseen)->pluck('id')->sort()->values()->all(), $ids);

        $this->actingAsStudent($other);
        $this->inClass($other);
        $this->assertSame(0, $this->getJson('/api/aluno/learning/overview')->assertOk()->json('body.questions'));
        $this->postJson('/api/aluno/learning/reinforcement', ['topic_id' => $topic->id])->assertStatus(422);
    }

    public function test_review_intervals_move_forward_on_a_hit_and_reset_on_a_miss(): void
    {
        Carbon::setTestNow('2026-10-09 15:00:00');
        [$student, $topic] = $this->topic('Equações');
        $question = $this->question('Equação do primeiro grau com uma incógnita', $topic);
        $this->inClass($student);
        $this->actingAsStudent($student);
        $this->postJson("/api/aluno/practice/questions/{$question->id}/answer", ['option_id' => $this->wrong($question)])->assertOk();

        $item = StudentReviewItem::query()->where('student_id', $student->id)->firstOrFail();
        $this->assertSame(0, $item->box);
        $this->assertSame('2026-10-10', $item->next_review_on->toDateString());

        Carbon::setTestNow('2026-10-10 15:00:00');
        $this->postJson("/api/aluno/practice/questions/{$question->id}/answer", ['option_id' => $this->correct($question)])->assertOk();
        $item->refresh();
        $this->assertSame(1, $item->box);
        $this->assertSame('2026-10-13', $item->next_review_on->toDateString());

        Carbon::setTestNow('2026-10-13 15:00:00');
        $this->postJson("/api/aluno/practice/questions/{$question->id}/answer", ['option_id' => $this->wrong($question)])->assertOk();
        $item->refresh();
        $this->assertSame(0, $item->box);
        $this->assertSame('2026-10-14', $item->next_review_on->toDateString());
        $this->assertCount(3, $item->history);

        $this->actingAsStudent($student);
        $ranking = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body.ranking.0');
        $this->assertSame(1, $ranking['questions']);
        $this->assertSame(0, $ranking['first_attempt_correct']);
    }

    public function test_due_review_is_offered_only_after_unseen_questions_run_out(): void
    {
        Carbon::setTestNow('2026-10-09 15:00:00');
        [$student, $topic] = $this->topic('Regra de três');
        $wrong = $this->question('Regra de três simples que o aluno errou na estreia', $topic);
        $this->record($student, $wrong, false, now());
        app(LearningReviewService::class)->record(PracticeAnswer::query()->firstOrFail());
        StudentReviewItem::query()->where('exam_question_id', $wrong->id)->update(['next_review_on' => '2026-10-09']);
        $this->inClass($student);
        $this->actingAsStudent($student);

        $plan = $this->getJson('/api/aluno/learning/recommendations')->assertOk()->json('body.0');
        $this->assertSame('review', $plan['source']);
        $this->assertSame('Iniciar revisão', $plan['action']);
        $this->assertSame(0, QuestionGenerationJob::query()->count());
    }

    public function test_ai_is_not_called_while_questions_exist_and_invalid_batches_stay_unpublished(): void
    {
        Http::preventStrayRequests();
        [$student, $topic] = $this->topic('Geometria');
        $only = $this->question('Área do triângulo retângulo com medidas inteiras', $topic);
        $this->record($student, $only, true, now());
        $this->inClass($student);
        $this->actingAsStudent($student);

        $plan = $this->getJson('/api/aluno/learning/recommendations')->assertOk()->json('body.0');
        $this->assertSame('preparing', $plan['source']);
        $this->assertSame(1, QuestionGenerationJob::query()->where('status', 'pending')->count());
        Http::assertNothingSent();

        TenantAiCredential::query()->create([
            'tenant_id' => $this->tenant->id,
            'provider' => 'openrouter',
            'api_key' => 'sk-test-learning',
            'key_hint' => 'ning',
            'model' => 'openai/gpt-4o-mini',
            'active' => true,
            'configured_at' => now(),
        ]);
        Http::fake([
            '*/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => json_encode(['questions' => [
                    ['question_text' => 'curta', 'explanation' => 'sem', 'difficulty' => 'Fácil', 'options' => [
                        ['text' => 'A', 'is_correct' => true],
                        ['text' => 'B', 'is_correct' => true],
                    ]],
                    ['question_text' => 'Área do triângulo retângulo com medidas inteiras', 'explanation' => 'É a mesma questão que já existe no banco.', 'difficulty' => 'Média', 'options' => [
                        ['text' => 'Base vezes altura sobre dois', 'is_correct' => true],
                        ['text' => 'Base mais altura', 'is_correct' => false],
                    ]],
                    ['question_text' => 'Qual é a soma dos ângulos internos de um triângulo qualquer?', 'explanation' => 'A soma dos ângulos internos é 180 graus.', 'difficulty' => 'Fácil', 'options' => [
                        ['text' => '180 graus', 'is_correct' => true],
                        ['text' => '90 graus', 'is_correct' => false],
                        ['text' => '360 graus', 'is_correct' => false],
                    ]],
                ]])]]],
                'usage' => ['prompt_tokens' => 120, 'completion_tokens' => 80],
            ]),
        ]);

        $this->artisan('learning:generate')->assertSuccessful();
        $this->assertSame(1, ExamQuestion::query()->where('source_exam_name', 'Reforço adaptativo')->count());
        $job = QuestionGenerationJob::query()->firstOrFail();
        $this->assertSame('done', $job->status);
        $this->assertSame(1, $job->created_count);
        $this->assertSame(2, $job->rejected_count);
        $this->assertSame(120, $job->prompt_tokens);
        $this->assertNotNull($job->rejected);
    }

    public function test_evolution_groups_first_attempts_by_month(): void
    {
        [$student, $topic] = $this->topic('Funções');
        $first = $this->question('Função do primeiro grau no mês de agosto', $topic);
        $second = $this->question('Função do segundo grau no mês de setembro', $topic);
        $this->record($student, $first, true, Carbon::parse('2026-08-20 15:00:00'));
        $this->record($student, $second, false, Carbon::parse('2026-09-20 15:00:00'));
        $this->record($student, $second, true, Carbon::parse('2026-09-21 15:00:00'));
        $this->actingAsStudent($student);

        $body = $this->getJson('/api/aluno/learning/evolution')->assertOk()->json('body');
        $this->assertSame(['2026-08', '2026-09'], array_column($body['months'], 'month'));
        $this->assertSame(1, $body['months'][1]['questions']);
        $this->assertSame(0, $body['months'][1]['first_correct']);
        $this->assertSame(1, $body['months'][1]['first_wrong']);
    }

    private function topic(string $name): array
    {
        $subject = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $topic = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $subject->id, 'name' => $name]);

        return [$this->student(), $topic];
    }

    private function question(string $text, SubjectTopic $topic): ExamQuestion
    {
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id,
            'exam_id' => null,
            'type' => 'multiple_choice',
            'question_text' => $text,
            'subject_id' => $topic->subject_id,
            'points' => 1,
            'order' => 1,
            'explanation' => "Porque {$text}",
        ]);
        $question->options()->createMany([
            ['option_text' => 'Certa', 'is_correct' => true, 'order' => 1],
            ['option_text' => 'Errada', 'is_correct' => false, 'order' => 2],
        ]);
        $question->topics()->sync([$topic->id]);

        return $question->load('options');
    }

    private function record(Student $student, ExamQuestion $question, bool $correct, Carbon $at): void
    {
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => $student->id,
            'exam_question_id' => $question->id,
            'is_correct' => $correct,
            'answered_at' => $at,
        ]);
    }

    private function student(string $name = 'MARIA DA SILVA'): Student
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']);

        return Student::factory()->create(['tenant_id' => $this->tenant->id, 'user_id' => $user->id, 'name' => $name, 'status' => 'active']);
    }

    private function actingAsStudent(Student $student): void
    {
        Sanctum::actingAs($student->user);
    }

    private function inClass(Student $student): void
    {
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'CPM']);
        $class = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id]);
        foreach (Subject::query()->where('tenant_id', $this->tenant->id)->pluck('id') as $subjectId) {
            ClassSchedule::factory()->create([
                'tenant_id' => $this->tenant->id,
                'school_class_id' => $class->id,
                'subject_id' => $subjectId,
            ]);
        }
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => $student->id,
            'school_class_id' => $class->id,
            'start_date' => '2020-01-01',
            'end_date' => null,
            'status' => 'active',
        ]);
    }

    private function correct(ExamQuestion $question): int
    {
        return (int) $question->options->firstWhere('is_correct', true)->id;
    }

    private function wrong(ExamQuestion $question): int
    {
        return (int) $question->options->firstWhere('is_correct', false)->id;
    }
}
