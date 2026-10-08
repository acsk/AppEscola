<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionBoard;
use App\Models\QuestionDifficulty;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Classificação completa (disciplina, assuntos, dificuldade, banca, ano, situação, tags) no formulário de questão de simulado.
 * Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/ExamQuestionClassificationTest.php
 */
class ExamQuestionClassificationTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private Exam $exam;

    private Subject $math;

    private SubjectTopic $algebra;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $this->tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']));
        $this->exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Simulado ENEM']);
        $this->math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $this->algebra = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Álgebra']);
    }

    private function payload(array $extra = []): array
    {
        return array_merge([
            'subject_id'    => $this->math->id,
            'topic_ids'     => [$this->algebra->id],
            'type'          => 'multiple_choice',
            'exam_type'     => 'enem',
            'question_text' => 'Quanto é 2 + 2?',
            'options'       => [['option_text' => '3', 'is_correct' => false], ['option_text' => '4', 'is_correct' => true]],
        ], $extra);
    }

    public function test_create_question_with_full_classification(): void
    {
        $difficulty = QuestionDifficulty::where('name', 'Média')->firstOrFail();
        $board = QuestionBoard::create(['tenant_id' => $this->tenant->id, 'name' => 'FUVEST']);

        $response = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload([
            'subject_id'    => null,
            'topic_ids'     => [$this->algebra->id], // disciplina deduzida do assunto
            'difficulty_id' => $difficulty->id,
            'board_id'      => $board->id,
            'year'          => 2023,
            'tags'          => ['soma', 'aritmética'],
        ]))
            ->assertCreated()
            ->assertJsonPath('body.subject_id', $this->math->id)
            ->assertJsonPath('body.topic_ids', [$this->algebra->id])
            ->assertJsonPath('body.difficulty.name', 'Média')
            ->assertJsonPath('body.board.name', 'FUVEST')
            ->assertJsonPath('body.year', 2023);
        $this->assertEqualsCanonicalizing(['soma', 'aritmética'], $response->json('body.tags'));
        $id = $response->json('body.id');

        // A listagem do simulado e o banco de questões enxergam a mesma classificação.
        $this->getJson("/api/exams/{$this->exam->id}/questions")->assertOk()->assertJsonPath('body.0.topics.0.name', 'Álgebra');
        $this->getJson("/api/question-bank/questions/{$id}")->assertOk()->assertJsonPath('body.difficulty_id', $difficulty->id);
    }

    public function test_questions_of_archived_exam_stay_in_question_bank(): void
    {
        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload())->assertCreated()->json('body.id');

        $this->putJson("/api/exams/{$this->exam->id}", ['status' => 'archived'])->assertOk();

        $this->getJson('/api/question-bank/questions?origin=simulado')->assertOk()->assertJsonPath('data.0.id', $id);
        $this->getJson("/api/question-bank/questions?exam_id={$this->exam->id}")->assertOk()->assertJsonPath('data.0.id', $id);
    }

    public function test_update_changes_classification_and_keeps_content(): void
    {
        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['topic_ids' => [$this->algebra->id]]))->json('body.id');
        $portuguese = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);

        // Trocar a disciplina sem informar assuntos descarta os assuntos da disciplina anterior.
        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['subject_id' => $portuguese->id, 'is_outdated' => true])
            ->assertOk()
            ->assertJsonPath('body.subject_id', $portuguese->id)
            ->assertJsonPath('body.topic_ids', [])
            ->assertJsonPath('body.is_outdated', true)
            ->assertJsonPath('body.question_text', 'Quanto é 2 + 2?');
    }

    public function test_topic_from_another_subject_or_tenant_is_rejected(): void
    {
        $portuguese = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);

        $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['subject_id' => $portuguese->id, 'topic_ids' => [$this->algebra->id]]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Todos os assuntos precisam ser da disciplina selecionada.');

        $otherBoard = QuestionBoard::create(['tenant_id' => Tenant::factory()->create()->id, 'name' => 'Outra']);
        $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['board_id' => $otherBoard->id]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Banca não encontrada.');

        $this->assertSame(0, ExamQuestion::where('exam_id', $this->exam->id)->count());
    }

    public function test_formatting_is_normalized_and_preview_is_plain(): void
    {
        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload([
            'question_text' => 'Se <strong>x < 3</strong>, calcule <em>y</em>.',
            'explanation'   => '<b class="a">Resolução</b>',
        ]))
            ->assertCreated()
            ->assertJsonPath('body.question_text', 'Se <b>x < 3</b>, calcule <i>y</i>.')
            ->assertJsonPath('body.explanation', '<b>Resolução</b>')
            ->json('body.id');

        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['question_text' => '<b> </b>'])->assertStatus(422);

        $this->getJson("/api/exams/{$this->exam->id}/question-errors-report")
            ->assertOk()
            ->assertJsonPath('body.questions.0.question_text_preview', 'Se x < 3, calcule y.');
    }

    public function test_question_modality_follows_the_exam(): void
    {
        $enem = \App\Models\ExamType::where('slug', 'enem')->firstOrFail();
        $this->exam->update(['exam_type_id' => $enem->id]);

        // Mesmo enviando outra modalidade, a questão fica com a do simulado.
        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['exam_type' => 'custom']))
            ->assertCreated()
            ->assertJsonPath('body.exam_type', 'enem')
            ->json('body.id');

        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['exam_type' => 'custom'])
            ->assertOk()
            ->assertJsonPath('body.exam_type', 'enem');
    }

    public function test_subject_and_topic_are_required(): void
    {
        $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['subject_id' => null, 'topic_ids' => []]))
            ->assertStatus(422)->assertJsonPath('errors.subject_id.0', 'Selecione a disciplina da questão.');
        $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload(['topic_ids' => []]))
            ->assertStatus(422)->assertJsonPath('errors.topic_ids.0', 'Selecione pelo menos um assunto da disciplina.');

        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload())->assertCreated()->json('body.id');
        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['subject_id' => null])->assertStatus(422)->assertJsonValidationErrors('subject_id');
        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['topic_ids' => []])->assertStatus(422)->assertJsonValidationErrors('topic_ids');
        $this->assertSame(0, ExamQuestion::whereNull('subject_id')->count());
    }

    public function test_update_ignores_unvalidated_input(): void
    {
        $id = $this->postJson("/api/exams/{$this->exam->id}/questions", $this->payload())->json('body.id');
        $otherTenant = Tenant::factory()->create();

        // Campos fora das regras não chegam mais ao model (antes ia todo o input).
        $this->putJson("/api/exams/{$this->exam->id}/questions/{$id}", ['tenant_id' => $otherTenant->id, 'exam_id' => 999999])->assertOk();

        $question = ExamQuestion::findOrFail($id);
        $this->assertSame($this->tenant->id, (int) $question->tenant_id);
        $this->assertSame($this->exam->id, (int) $question->exam_id);
    }
}
