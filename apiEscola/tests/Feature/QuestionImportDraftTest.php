<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionImportDraft;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuestionImportDraftTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->owner = User::factory()->admin()->create(['tenant_id' => Tenant::factory()->create()->id, 'status' => 'active']);
        Sanctum::actingAs($this->owner);
    }

    private function subjectId(): int
    {
        return Subject::factory()->create(['tenant_id' => $this->owner->tenant_id])->id;
    }

    private function payload(): array
    {
        return [
            'source_exam_name' => ' Simulado para revisar ', 'active_question_key' => 'pdf-0', 'no_text_pages' => [2],
            'questions' => [[
                'key' => 'pdf-0', 'include' => true, 'sourceNumber' => '8', 'needsImage' => true, 'answerFromPdf' => false,
                'content' => [
                    'type' => 'multiple_choice', 'question_text' => 'Observe a figura e calcule o resultado.',
                    'image_url' => '', 'explanation' => '',
                    'options' => [
                        ['key' => 'a', 'option_text' => '', 'is_correct' => false],
                        ['key' => 'b', 'option_text' => 'Oito', 'is_correct' => false],
                    ],
                ],
                'classification' => [
                    'difficulty_id' => null, 'subject_id' => null, 'topic_ids' => [], 'board_id' => null,
                    'year' => null, 'exam_type_id' => null, 'is_annulled' => false, 'is_outdated' => false, 'tags' => [],
                ],
            ]],
        ];
    }

    public function test_incomplete_import_is_saved_and_resumed_without_creating_exam_or_question(): void
    {
        $saved = $this->postJson('/api/question-bank/import-drafts', $this->payload())->assertCreated()
            ->assertJsonPath('body.source_exam_name', 'Simulado para revisar')->assertJsonPath('body.revision', 1);
        $id = $saved->json('body.id');
        $this->getJson('/api/question-bank/import-drafts')->assertOk()->assertJsonPath('body.items.0.id', $id)
            ->assertJsonPath('body.items.0.question_count', 1);
        $this->getJson('/api/question-bank/import-drafts/'.$id)->assertOk()
            ->assertJsonPath('body.questions.0.needsImage', true)
            ->assertJsonPath('body.questions.0.content.options.0.is_correct', false)
            ->assertJsonPath('body.no_text_pages.0', 2);
        $this->assertSame(0, ExamQuestion::count());
        $this->assertSame(0, Exam::count());
    }

    public function test_revision_conflicts_do_not_overwrite_another_device(): void
    {
        $id = $this->postJson('/api/question-bank/import-drafts', $this->payload())->json('body.id');
        $updated = array_replace($this->payload(), ['revision' => 1, 'source_exam_name' => 'Nome revisado']);
        $this->putJson('/api/question-bank/import-drafts/'.$id, $updated)->assertOk()->assertJsonPath('body.revision', 2);
        $updated['source_exam_name'] = 'Nome obsoleto';
        $this->putJson('/api/question-bank/import-drafts/'.$id, $updated)->assertStatus(409);
        $this->getJson('/api/question-bank/import-drafts/'.$id)->assertJsonPath('body.source_exam_name', 'Nome revisado');
    }

    public function test_drafts_are_private_to_user_and_tenant_and_students_cannot_access(): void
    {
        $id = $this->postJson('/api/question-bank/import-drafts', $this->payload())->json('body.id');
        foreach ([$this->owner->tenant_id, Tenant::factory()->create()->id] as $tenantId) {
            Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $tenantId, 'status' => 'active']));
            $this->getJson('/api/question-bank/import-drafts')->assertOk()->assertJsonCount(0, 'body.items');
            $this->getJson('/api/question-bank/import-drafts/'.$id)->assertNotFound();
            $this->putJson('/api/question-bank/import-drafts/'.$id, $this->payload() + ['revision' => 1])->assertNotFound();
        }
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->owner->tenant_id, 'role' => 'aluno', 'status' => 'active']));
        $this->getJson('/api/question-bank/import-drafts')->assertForbidden();
        $this->postJson('/api/question-bank/import-drafts', $this->payload())->assertForbidden();
    }

    public function test_only_owner_deletes_draft(): void
    {
        $id = $this->postJson('/api/question-bank/import-drafts', $this->payload())->json('body.id');
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $this->owner->tenant_id, 'status' => 'active']));
        $this->deleteJson('/api/question-bank/import-drafts/'.$id)->assertNotFound();

        Sanctum::actingAs($this->owner);
        $this->deleteJson('/api/question-bank/import-drafts/'.$id)->assertOk();
        $this->assertSame(0, QuestionImportDraft::count());
        $this->getJson('/api/question-bank/import-drafts')->assertJsonCount(0, 'body.items');
    }

    public function test_review_state_and_settings_are_saved_and_resumed(): void
    {
        $payload = $this->payload();
        $payload['questions'][0]['reviewed'] = true;
        $payload['questions'][0]['sourcePage'] = 7;
        $payload['settings'] = ['create_exam' => true, 'exam_type_slug' => 'cpm', 'exam_title' => 'CPM 1', 'exam_id' => null, 'subject_ids' => [3, 4], 'topic_ids' => [9], 'pdf_file_name' => 'cpm.pdf'];
        $id = $this->postJson('/api/question-bank/import-drafts', $payload)->assertCreated()->json('body.id');

        $this->getJson('/api/question-bank/import-drafts/'.$id)->assertOk()
            ->assertJsonPath('body.questions.0.reviewed', true)
            ->assertJsonPath('body.questions.0.sourcePage', 7)
            ->assertJsonPath('body.settings.exam_type_slug', 'cpm')
            ->assertJsonPath('body.settings.subject_ids', [3, 4])
            ->assertJsonPath('body.settings.topic_ids', [9]);

        $payload['settings'] = ['unknown' => 1];
        $this->postJson('/api/question-bank/import-drafts', $payload)->assertUnprocessable();
    }

    public function test_invalid_draft_shapes_are_rejected(): void
    {
        $payload = $this->payload();
        $payload['questions'][] = $payload['questions'][0];
        $this->postJson('/api/question-bank/import-drafts', $payload)->assertStatus(422)->assertJsonValidationErrors('questions.0.key');
        $payload = $this->payload();
        $payload['active_question_key'] = 'missing';
        $this->postJson('/api/question-bank/import-drafts', $payload)->assertStatus(422)->assertJsonValidationErrors('active_question_key');
        $payload = $this->payload();
        $payload['questions'][0]['content']['options'][0]['option_text'] = str_repeat('a', 5001);
        $this->postJson('/api/question-bank/import-drafts', $payload)->assertStatus(422);
        $this->assertSame(0, QuestionImportDraft::count());
    }

    public function test_final_inclusion_validates_content_and_atomically_removes_question_without_duplicates(): void
    {
        $payload = $this->payload();
        $payload['questions'][] = array_replace($payload['questions'][0], ['key' => 'pdf-1', 'include' => false]);
        $id = $this->postJson('/api/question-bank/import-drafts', $payload)->json('body.id');
        $url = "/api/question-bank/import-drafts/{$id}/questions/pdf-0/include";
        $content = $payload['questions'][0]['content'] + ['needs_image' => true, 'revision' => 1, 'subject_id' => $this->subjectId()];
        $this->postJson($url, $content)->assertStatus(422)->assertJsonValidationErrors(['options', 'image_url']);
        $this->assertSame(2, count(QuestionImportDraft::findOrFail($id)->questions));
        $content['options'][0] = ['option_text' => 'Seis', 'is_correct' => true];
        $content['image_url'] = 'https://example.test/storage/manual.png';
        $this->postJson($url, $content)->assertCreated()
            ->assertJsonPath('body.question.source_exam_name', 'Simulado para revisar')
            ->assertJsonPath('body.draft.revision', 2)->assertJsonCount(1, 'body.draft.questions');
        $this->postJson($url, $content)->assertStatus(409);
        $content['revision'] = 2;
        $this->postJson($url, $content)->assertStatus(409);
        $this->assertSame(1, ExamQuestion::count());
        $this->assertSame(0, Exam::count());
    }

    public function test_fully_included_draft_is_not_listed_for_resume(): void
    {
        $payload = $this->payload();
        $payload['questions'][0]['needsImage'] = false;
        $id = $this->postJson('/api/question-bank/import-drafts', $payload)->json('body.id');
        $this->postJson("/api/question-bank/import-drafts/{$id}/questions/pdf-0/include", [
            'type' => 'essay', 'question_text' => 'Explique a resposta em suas palavras.', 'revision' => 1, 'subject_id' => $this->subjectId(),
        ])->assertCreated()->assertJsonCount(0, 'body.draft.questions');
        $this->getJson('/api/question-bank/import-drafts')->assertOk()->assertJsonCount(0, 'body.items');
    }

    public function test_required_manual_image_cannot_be_bypassed_by_omitting_the_flag_on_inclusion(): void
    {
        $id = $this->postJson('/api/question-bank/import-drafts', $this->payload())->json('body.id');
        $this->postJson("/api/question-bank/import-drafts/{$id}/questions/pdf-0/include", [
            'type' => 'essay', 'question_text' => 'Observe a figura e explique a resposta.', 'revision' => 1, 'subject_id' => $this->subjectId(),
        ])->assertStatus(422)->assertJsonValidationErrors('image_url');
        $this->assertSame(0, ExamQuestion::count());
        $this->assertSame(1, QuestionImportDraft::findOrFail($id)->revision);
    }
}
