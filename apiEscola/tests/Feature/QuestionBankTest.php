<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamType;
use App\Models\QuestionBoard;
use App\Models\QuestionDifficulty;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Database\Seeders\DomainSeeder;
use Tests\TestCase;

/** Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/QuestionBankTest.php */
class QuestionBankTest extends TestCase
{
    use RefreshDatabase;

    /** A view vw_dashboard_tenant_summary não é removida pelo migrate:fresh padrão. */
    protected bool $dropViews = true;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
        Sanctum::actingAs($this->admin);
    }

    private function question(array $attributes = []): ExamQuestion
    {
        return ExamQuestion::create(array_merge([
            'tenant_id'     => $this->tenant->id,
            'exam_id'       => null,
            'type'          => 'multiple_choice',
            'question_text' => 'Enunciado de teste',
            'points'        => 1,
            'order'         => 1,
        ], $attributes));
    }

    private function subjectWithTopics(string $name, array $topics): array
    {
        $subject = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name]);
        $models = array_map(fn ($topic) => SubjectTopic::create([
            'tenant_id'  => $this->tenant->id,
            'subject_id' => $subject->id,
            'name'       => $topic,
        ]), $topics);

        return [$subject, ...$models];
    }

    private function patchClassification(ExamQuestion $question, array $payload)
    {
        return $this->patchJson("/api/question-bank/questions/{$question->id}/classification", $payload);
    }

    // ── Disciplina e assuntos ──────────────────────────────────────────────

    public function test_subject_is_deduced_from_topics(): void
    {
        [$math, $algebra, $geometry] = $this->subjectWithTopics('Matemática', ['Álgebra', 'Geometria']);
        $question = $this->question();

        $this->patchClassification($question, ['topic_ids' => [$algebra->id, $geometry->id]])
            ->assertOk()
            ->assertJsonPath('body.subject_id', $math->id)
            ->assertJsonCount(2, 'body.topic_ids');
    }

    public function test_topics_from_different_subjects_without_subject_return_422(): void
    {
        [, $algebra] = $this->subjectWithTopics('Matemática', ['Álgebra']);
        [, $grammar] = $this->subjectWithTopics('Português', ['Gramática']);

        $this->patchClassification($this->question(), ['topic_ids' => [$algebra->id, $grammar->id]])
            ->assertStatus(422)
            ->assertJsonPath('type', 'error')
            ->assertJsonPath('message', 'Os assuntos informados são de disciplinas diferentes.');
    }

    public function test_topic_outside_informed_subject_returns_422(): void
    {
        [$math] = $this->subjectWithTopics('Matemática', []);
        [, $grammar] = $this->subjectWithTopics('Português', ['Gramática']);

        $this->patchClassification($this->question(), ['subject_id' => $math->id, 'topic_ids' => [$grammar->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Todos os assuntos precisam ser da disciplina selecionada.');
    }

    public function test_unknown_topic_or_subject_returns_422(): void
    {
        $question = $this->question();

        $this->patchClassification($question, ['topic_ids' => [999999]])
            ->assertStatus(422)->assertJsonPath('message', 'Assunto não encontrado.');
        $this->patchClassification($question, ['subject_id' => 999999])
            ->assertStatus(422)->assertJsonPath('message', 'Disciplina não encontrada.');
    }

    public function test_changing_subject_drops_topics_from_other_subject(): void
    {
        [$math, $algebra] = $this->subjectWithTopics('Matemática', ['Álgebra']);
        [$portuguese] = $this->subjectWithTopics('Português', []);
        $question = $this->question(['subject_id' => $math->id]);
        $question->topics()->attach($algebra->id);

        $this->patchClassification($question, ['subject_id' => $portuguese->id])
            ->assertOk()
            ->assertJsonPath('body.subject_id', $portuguese->id)
            ->assertJsonCount(0, 'body.topic_ids');
    }

    // ── Atualização parcial ────────────────────────────────────────────────

    public function test_null_removes_value_and_absent_field_keeps_it(): void
    {
        $board = QuestionBoard::create(['tenant_id' => $this->tenant->id, 'name' => 'FUVEST']);
        $difficulty = QuestionDifficulty::where('name', 'Média')->firstOrFail();
        $question = $this->question(['board_id' => $board->id, 'year' => 2020, 'difficulty_id' => $difficulty->id]);

        $this->patchClassification($question, ['board_id' => null, 'is_annulled' => true])
            ->assertOk()
            ->assertJsonPath('body.board_id', null)
            ->assertJsonPath('body.year', 2020)
            ->assertJsonPath('body.difficulty_id', $difficulty->id)
            ->assertJsonPath('body.is_annulled', true);
    }

    public function test_year_out_of_range_returns_422(): void
    {
        $this->patchClassification($this->question(), ['year' => 1800])->assertStatus(422);
    }

    public function test_tags_are_created_by_name_and_reused(): void
    {
        $first = $this->question();
        $second = $this->question();

        $this->patchClassification($first, ['tags' => ['  Revisão   ENEM ', 'Funções']])
            ->assertOk()
            ->assertJsonPath('body.tags', ['Funções', 'Revisão ENEM']);
        $this->patchClassification($second, ['tags' => ['Funções']])->assertOk();

        $this->assertDatabaseCount('question_tags', 2);
    }

    public function test_question_from_another_tenant_is_not_found(): void
    {
        $otherTenant = Tenant::factory()->create();
        $foreign = $this->question(['tenant_id' => $otherTenant->id]);

        $this->patchClassification($foreign, ['year' => 2020])->assertNotFound();
    }

    // ── Cadastros (409) ────────────────────────────────────────────────────

    public function test_catalog_duplicate_name_and_in_use_delete_return_409(): void
    {
        $this->postJson('/api/question-bank/catalogs/boards', ['name' => 'CESPE'])->assertCreated();
        $this->postJson('/api/question-bank/catalogs/boards', ['name' => 'CESPE'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Já existe Banca com o nome "CESPE".');

        $board = QuestionBoard::where('name', 'CESPE')->firstOrFail();
        $this->question(['board_id' => $board->id]);

        $this->deleteJson("/api/question-bank/catalogs/boards/{$board->id}")->assertStatus(409);
        $this->getJson('/api/question-bank/catalogs/boards')
            ->assertOk()
            ->assertJsonPath('body.0.questions_count', 1);
    }

    public function test_difficulties_are_read_only_and_ordered(): void
    {
        $this->getJson('/api/question-bank/catalogs/difficulties')
            ->assertOk()
            ->assertJsonPath('body.0.name', 'Muito fácil')
            ->assertJsonPath('body.4.name', 'Muito difícil');

        $this->postJson('/api/question-bank/catalogs/difficulties', ['name' => 'Extrema'])->assertStatus(403);
        $this->getJson('/api/question-bank/catalogs/unknown')->assertNotFound();
    }

    public function test_topic_name_is_unique_per_subject_and_in_use_topic_cannot_move(): void
    {
        [$math, $algebra] = $this->subjectWithTopics('Matemática', ['Álgebra']);
        [$physics] = $this->subjectWithTopics('Física', []);

        $this->postJson('/api/question-bank/topics', ['subject_id' => $physics->id, 'name' => 'Álgebra'])->assertCreated();
        $this->postJson('/api/question-bank/topics', ['subject_id' => $math->id, 'name' => 'Álgebra'])->assertStatus(409);

        $this->question(['subject_id' => $math->id])->topics()->attach($algebra->id);

        $this->putJson("/api/question-bank/topics/{$algebra->id}", ['subject_id' => $physics->id])->assertStatus(409);
        $this->putJson("/api/question-bank/topics/{$algebra->id}", ['name' => 'Álgebra linear'])->assertOk();
        $this->deleteJson("/api/question-bank/topics/{$algebra->id}")->assertStatus(409);
    }

    public function test_subjects_endpoint_counts_questions(): void
    {
        [$math] = $this->subjectWithTopics('Matemática', []);
        $this->question(['subject_id' => $math->id]);
        $this->question(['subject_id' => $math->id]);

        $this->getJson('/api/question-bank/subjects')
            ->assertOk()
            ->assertJsonPath('body.0.id', $math->id)
            ->assertJsonPath('body.0.questions_count', 2);
    }

    // ── Listagem e filtros ─────────────────────────────────────────────────

    public function test_filters_combine_or_within_field_and_and_between_fields(): void
    {
        $cespe = QuestionBoard::create(['tenant_id' => $this->tenant->id, 'name' => 'CESPE']);
        $fgv = QuestionBoard::create(['tenant_id' => $this->tenant->id, 'name' => 'FGV']);
        $vunesp = QuestionBoard::create(['tenant_id' => $this->tenant->id, 'name' => 'VUNESP']);

        $a = $this->question(['board_id' => $cespe->id, 'year' => 2023]);
        $b = $this->question(['board_id' => $fgv->id, 'year' => 2023]);
        $this->question(['board_id' => $fgv->id, 'year' => 2022]);
        $this->question(['board_id' => $vunesp->id, 'year' => 2023]);

        $ids = fn ($response) => collect($response->json('data'))->pluck('id')->sort()->values()->all();

        $commaSeparated = $this->getJson("/api/question-bank/questions?board_id={$cespe->id},{$fgv->id}&year=2023")->assertOk();
        $this->assertSame([$a->id, $b->id], $ids($commaSeparated));

        $repeated = $this->getJson("/api/question-bank/questions?board_id[]={$cespe->id}&board_id[]={$fgv->id}&year[]=2023")->assertOk();
        $this->assertSame([$a->id, $b->id], $ids($repeated));
    }

    public function test_topic_and_tag_filters_use_exists(): void
    {
        [, $algebra, $geometry] = $this->subjectWithTopics('Matemática', ['Álgebra', 'Geometria']);
        $a = $this->question();
        $a->topics()->attach([$algebra->id, $geometry->id]);
        $this->patchClassification($a, ['tags' => ['enem']]);
        $b = $this->question();
        $b->topics()->attach($geometry->id);

        $this->getJson("/api/question-bank/questions?topic_id={$algebra->id},{$geometry->id}")
            ->assertOk()->assertJsonCount(2, 'data');
        $this->getJson("/api/question-bank/questions?topic_id={$geometry->id}&tag=enem")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a->id);
    }

    public function test_tab_counts_ignore_tab_but_respect_filters(): void
    {
        [$math, $algebra] = $this->subjectWithTopics('Matemática', ['Álgebra']);
        $difficulty = QuestionDifficulty::firstOrFail();

        $classified = $this->question(['subject_id' => $math->id, 'difficulty_id' => $difficulty->id, 'year' => 2023]);
        $classified->topics()->attach($algebra->id);
        $this->question(['is_annulled' => true, 'year' => 2023]);
        $this->question(['is_outdated' => true, 'year' => 2023]);
        $this->question(['year' => 2010]);

        $this->getJson('/api/question-bank/questions?year=2023&tab=anuladas')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.tab_counts', [
                'todas'             => 3,
                'regulares'         => 1,
                'anuladas'          => 1,
                'desatualizadas'    => 1,
                'sem_classificacao' => 2,
            ]);
    }

    public function test_search_by_id_and_text_and_difficulty_sort_uses_its_order(): void
    {
        $hard = QuestionDifficulty::where('name', 'Difícil')->firstOrFail();
        $easy = QuestionDifficulty::where('name', 'Fácil')->firstOrFail();
        $a = $this->question(['question_text' => 'Calcule a derivada', 'difficulty_id' => $hard->id]);
        $b = $this->question(['question_text' => 'Interprete o texto', 'difficulty_id' => $easy->id]);

        $this->getJson("/api/question-bank/questions?search=%23{$a->id}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a->id);
        $this->getJson('/api/question-bank/questions?search=derivada')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a->id);
        $this->getJson('/api/question-bank/questions?search=CÁLCULE')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a->id);
        $this->getJson('/api/question-bank/questions?sort=difficulty&direction=asc')->assertJsonPath('data.0.id', $b->id);
    }

    public function test_questions_of_deleted_exam_are_left_out(): void
    {
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Simulado antigo']);
        $fromDeletedExam = $this->question(['exam_id' => $exam->id, 'year' => 2001]);
        $standalone = $this->question();
        $exam->delete();

        $this->getJson('/api/question-bank/questions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $standalone->id);
        $this->getJson("/api/question-bank/questions/{$fromDeletedExam->id}")->assertNotFound();
        $this->getJson('/api/question-bank/questions/years')->assertJsonPath('body', []);
    }

    public function test_years_are_distinct_and_descending(): void
    {
        $this->question(['year' => 2020]);
        $this->question(['year' => 2023]);
        $this->question(['year' => 2020]);

        $this->getJson('/api/question-bank/questions/years')->assertOk()->assertJsonPath('body', [2023, 2020]);
    }

    // ── Lote ───────────────────────────────────────────────────────────────

    public function test_batch_reports_partial_failure_and_returns_previous_values(): void
    {
        [, $algebra] = $this->subjectWithTopics('Matemática', ['Álgebra']);
        $ok = $this->question(['year' => 2019]);
        $otherTenant = $this->question(['tenant_id' => Tenant::factory()->create()->id]);

        $response = $this->patchJson('/api/question-bank/questions/classification', ['items' => [
            ['id' => $ok->id, 'year' => 2024, 'topic_ids' => [$algebra->id]],
            ['id' => $otherTenant->id, 'year' => 2024],
            ['id' => $this->question()->id, 'topic_ids' => [999999]],
        ]])->assertOk();

        $response->assertJsonPath('body.updated', 1)
            ->assertJsonPath('body.failed', 2)
            ->assertJsonPath('body.results.0.previous.year', 2019)
            ->assertJsonPath('body.results.1.message', 'Questão não encontrada.')
            ->assertJsonPath('body.results.2.message', 'Assunto não encontrado.');

        $this->assertSame(2024, $ok->fresh()->year);
        $this->assertNull($otherTenant->fresh()->year);
    }

    public function test_undo_restores_inactive_exam_type_kept_by_question(): void
    {
        $inactive = ExamType::create(['slug' => 'antigo', 'label' => 'Antigo', 'is_active' => false]);
        $question = $this->question(['exam_type_id' => $inactive->id]);

        $this->patchClassification($question, ['exam_type_id' => $inactive->id, 'year' => 2020])->assertOk();

        $other = $this->question();
        $this->patchClassification($other, ['exam_type_id' => $inactive->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Classificação de prova inválida ou inativa.');
    }

    public function test_taxonomy_import_is_idempotent_and_uses_aliases(): void
    {
        Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);
        $data = [
            'disciplinas' => [
                ['nome' => 'Língua Portuguesa', 'aliases' => ['Português'], 'assuntos' => ['Crase', 'Crase', 'Pontuação']],
                ['nome' => 'Informática', 'assuntos' => ['Linux']],
            ],
            'bancas' => [['nome' => 'CEBRASPE', 'nome_anterior' => 'CESPE'], ['nome' => 'ESAF', 'ativo' => false]],
        ];
        $importer = app(\App\Services\QuestionTaxonomyImporter::class);

        $dry = $importer->import($this->tenant->id, $data, dryRun: true);
        $this->assertSame(3, $dry['topics_created']);
        $this->assertDatabaseCount('subject_topics', 0);

        $first = $importer->import($this->tenant->id, $data);
        $this->assertSame([1, 1, 3, 2], [$first['subjects_created'], $first['subjects_existing'], $first['topics_created'], $first['boards_created']]);
        $this->assertSame(2, Subject::where('tenant_id', $this->tenant->id)->count());
        $this->assertDatabaseHas('question_boards', ['name' => 'CEBRASPE', 'description' => 'Antiga CESPE']);
        $this->assertDatabaseHas('question_boards', ['name' => 'ESAF', 'description' => 'Banca inativa']);

        $second = $importer->import($this->tenant->id, $data);
        $this->assertSame([0, 0, 0], [$second['subjects_created'], $second['topics_created'], $second['boards_created']]);
    }

    // ── Segurança ──────────────────────────────────────────────────────────

    public function test_student_cannot_access_question_bank(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']));

        $this->getJson('/api/question-bank/questions')->assertForbidden();
        $this->patchClassification($this->question(), ['year' => 2020])->assertForbidden();
    }

    public function test_exam_route_rejects_question_from_another_exam_or_standalone(): void
    {
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Simulado A']);
        $standalone = $this->question();

        $this->getJson("/api/exams/{$exam->id}/questions/{$standalone->id}")->assertNotFound();
        $this->deleteJson("/api/exams/{$exam->id}/questions/{$standalone->id}")->assertNotFound();
        $this->assertNotSoftDeleted($standalone);
    }
}
