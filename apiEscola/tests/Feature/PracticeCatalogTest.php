<?php

namespace Tests\Feature;

use App\Models\ExamQuestion;
use App\Models\QuestionDifficulty;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Banco de questões do aluno (protótipo do app): lista com filtros e contagens, salvas e sessões montadas.
 * Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/PracticeCatalogTest.php
 */
class PracticeCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']);
        $this->student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'user_id' => $user->id, 'status' => 'active']);
        Sanctum::actingAs($user);
    }

    private function question(string $text, ?int $subjectId = null, array $topicIds = [], ?int $difficultyId = null, ?int $year = null): ExamQuestion
    {
        $q = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => null, 'type' => 'multiple_choice', 'question_text' => $text,
            'subject_id' => $subjectId, 'difficulty_id' => $difficultyId, 'year' => $year, 'points' => 1, 'order' => 1, 'explanation' => "Porque {$text}",
        ]);
        $q->options()->createMany([
            ['option_text' => 'Certa', 'is_correct' => true, 'order' => 1],
            ['option_text' => 'Errada', 'is_correct' => false, 'order' => 2],
        ]);
        $q->topics()->sync($topicIds);

        return $q->load('options');
    }

    private function answer(ExamQuestion $q, bool $right): void
    {
        $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $q->options->firstWhere('is_correct', $right)->id])->assertOk();
    }

    public function test_lists_with_filters_status_saved_and_facets_counting_other_filters(): void
    {
        $math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $pt = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);
        $fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $math->id, 'name' => 'Frações']);
        $easy = QuestionDifficulty::query()->orderBy('sort_order')->first();
        $a = $this->question('Pizza dividida em 8 partes', $math->id, [$fractions->id], $easy->id, 2024);
        $b = $this->question('Turma de 36 alunos', $math->id, [$fractions->id], null, 2023);
        $c = $this->question('Substantivos comuns', $pt->id, [], null, 2020);

        $this->answer($a, false);
        $this->answer($b, true);
        $this->postJson("/api/aluno/practice/questions/{$c->id}/save")->assertOk();

        $all = $this->getJson('/api/aluno/practice/questions?facets=1')->assertOk();
        $all->assertJsonPath('body.total', 3);
        $items = collect($all->json('body.items'))->keyBy('id');
        $this->assertSame(['wrong', 'right', 'new'], [$items[$a->id]['status'], $items[$b->id]['status'], $items[$c->id]['status']]);
        $this->assertTrue($items[$c->id]['saved']);
        $this->assertSame(['all' => 3, 'unanswered' => 1, 'wrong' => 1, 'saved' => 1], $all->json('body.facets.situations'));

        // Disciplina filtrada: a contagem de disciplinas ignora o próprio filtro; a de situação respeita.
        $math_only = $this->getJson("/api/aluno/practice/facets?subject_ids[]={$math->id}")->assertOk();
        $this->assertSame(2, collect($math_only->json('body.subjects'))->firstWhere('id', $math->id)['total']);
        $this->assertSame(1, collect($math_only->json('body.subjects'))->firstWhere('id', $pt->id)['total']);
        $this->assertSame(['all' => 2, 'unanswered' => 0, 'wrong' => 1, 'saved' => 0], $math_only->json('body.situations'));

        $this->assertSame([$a->id], array_column($this->getJson('/api/aluno/practice/questions?situation=wrong')->json('body.items'), 'id'));
        $this->assertSame([$c->id], array_column($this->getJson('/api/aluno/practice/questions?situation=saved')->json('body.items'), 'id'));
        $this->assertSame([$a->id], array_column($this->getJson("/api/aluno/practice/questions?difficulty_id={$easy->id}")->json('body.items'), 'id'));
        $this->assertSame([$c->id], array_column($this->getJson('/api/aluno/practice/questions?year_before=2022')->json('body.items'), 'id'));
        $this->assertSame([$a->id], array_column($this->getJson('/api/aluno/practice/questions?search=pizza')->json('body.items'), 'id'));
        $this->assertSame([$b->id], array_column($this->getJson("/api/aluno/practice/questions?search=%23{$b->id}")->json('body.items'), 'id'));

        $this->deleteJson("/api/aluno/practice/questions/{$c->id}/save")->assertOk();
        $this->getJson('/api/aluno/practice/questions?situation=saved')->assertJsonPath('body.total', 0);
    }

    public function test_session_each_mode_reveals_feedback_per_question_and_counts_in_summary(): void
    {
        $qs = collect(range(1, 12))->map(fn ($i) => $this->question("Questão {$i}"));

        $payload = $this->postJson('/api/aluno/practice/sessions', ['quantity' => 10, 'correction_mode' => 'each', 'timed' => true, 'title' => 'Treino'])
            ->assertCreated()->json('body');
        $this->assertSame(10, $payload['attempt']['question_count']);
        $this->assertSame('each', $payload['attempt']['correction_mode']);
        $this->assertSame(90, $payload['attempt']['seconds_per_question']);
        $this->assertCount(10, $payload['questions']);
        $this->assertArrayNotHasKey('correct_option_id', $payload['questions'][0]);
        $attemptId = $payload['attempt']['id'];
        $this->getJson('/api/aluno/practice/summary')->assertJsonPath('body.open_session.id', $attemptId);

        $first = $qs->firstWhere('id', $payload['questions'][0]['id']);
        $wrongId = $first->options->firstWhere('is_correct', false)->id;
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $first->id, 'option_id' => $wrongId])
            ->assertOk()->assertJsonPath('body.feedback.is_correct', false)
            ->assertJsonPath('body.feedback.correct_option_id', $first->options->firstWhere('is_correct', true)->id);
        // Já corrigida: não dá para trocar a resposta.
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $first->id, 'option_id' => $wrongId])->assertStatus(409);
        // Questão fora da sessão.
        $outside = $qs->first(fn ($q) => ! in_array($q->id, array_column($payload['questions'], 'id'), true));
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $outside->id, 'option_id' => $outside->options->first()->id])->assertNotFound();

        // A correção já mostrada conta no desempenho e no "que errei".
        $this->getJson('/api/aluno/practice/questions?situation=wrong')->assertJsonPath('body.total', 1);
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/finish")->assertOk()->assertJsonPath('body.attempt.correct_count', 0);
        $this->getJson('/api/aluno/practice/summary')->assertJsonPath('body.open_session', null);
    }

    public function test_session_end_mode_hides_feedback_until_finish_and_rejects_empty_filters(): void
    {
        $math = Subject::factory()->create(['tenant_id' => $this->tenant->id]);
        $q = $this->question('Única', $math->id);
        $payload = $this->postJson('/api/aluno/practice/sessions', ['subject_ids' => [$math->id], 'correction_mode' => 'end'])->assertCreated()->json('body');
        $attemptId = $payload['attempt']['id'];
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $q->id, 'option_id' => $q->options->first()->id])
            ->assertOk()->assertJsonMissingPath('body.feedback');
        $this->getJson('/api/aluno/practice/questions?situation=wrong')->assertJsonPath('body.total', 0);
        $this->getJson("/api/aluno/practice-attempts/{$attemptId}")->assertJsonMissingPath('body.questions.0.correct_option_id');
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/finish")->assertOk()->assertJsonPath('body.questions.0.is_correct', true);

        $this->postJson('/api/aluno/practice/sessions', ['subject_ids' => [999999], 'correction_mode' => 'end'])->assertStatus(422);
        $this->postJson('/api/aluno/practice/sessions', ['correction_mode' => 'sempre'])->assertStatus(422);
    }
}
