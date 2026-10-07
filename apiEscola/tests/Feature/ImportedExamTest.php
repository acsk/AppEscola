<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamType;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Prova importada de PDF vira simulado (rascunho) + logo da modalidade.
 * Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/ImportedExamTest.php
 */
class ImportedExamTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']));
    }

    private function standalone(string $text, ?int $tenantId = null): ExamQuestion
    {
        return ExamQuestion::create([
            'tenant_id' => $tenantId ?? $this->tenant->id, 'exam_id' => null, 'type' => 'essay',
            'question_text' => $text, 'points' => 1, 'order' => 1,
        ]);
    }

    public function test_creates_draft_exam_moving_questions_in_order_with_exam_modality(): void
    {
        $a = $this->standalone('A');
        $b = $this->standalone('B');

        $response = $this->postJson('/api/question-bank/exams-from-questions', [
            'title' => 'IFAL 2024 — 1ª fase', 'exam_type' => 'enem', 'question_ids' => [$b->id, $a->id],
        ])->assertCreated()
            ->assertJsonPath('body.title', 'IFAL 2024 — 1ª fase')
            ->assertJsonPath('body.exam_type', 'enem')
            ->assertJsonPath('body.status', 'draft');

        $examId = $response->json('body.id');
        $enem = ExamType::where('slug', 'enem')->value('id');
        $this->assertSame([$examId, 1, $enem], [$b->fresh()->exam_id, $b->fresh()->order, $b->fresh()->exam_type_id]);
        $this->assertSame([$examId, 2], [$a->fresh()->exam_id, $a->fresh()->order]);
    }

    public function test_rejects_questions_of_other_tenant_or_already_in_exam(): void
    {
        $mine = $this->standalone('mine');
        $foreign = $this->standalone('foreign', Tenant::factory()->create()->id);
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Outro']);
        $inExam = $this->standalone('in exam');
        $inExam->update(['exam_id' => $exam->id]);

        foreach ([$foreign->id, $inExam->id] as $badId) {
            $this->postJson('/api/question-bank/exams-from-questions', [
                'title' => 'X', 'exam_type' => 'enem', 'question_ids' => [$mine->id, $badId],
            ])->assertStatus(422);
        }
        $this->assertNull($mine->fresh()->exam_id); // nada foi movido (transação)
        $this->assertSame(1, Exam::where('tenant_id', $this->tenant->id)->count());
    }

    private function importExam(string $title, int $questions = 2): int
    {
        $ids = [];
        for ($i = 0; $i < $questions; $i++) {
            $ids[] = $this->standalone("{$title} q{$i}")->id;
        }

        return $this->postJson('/api/question-bank/exams-from-questions', [
            'title' => $title, 'exam_type' => 'enem', 'question_ids' => $ids,
        ])->assertCreated()->assertJsonPath('body.origin', 'pdf_import')->json('body.id');
    }

    public function test_lists_only_imported_exams_of_tenant_filtered_by_status(): void
    {
        $draftId = $this->importExam('IFAL 2023');
        $publishedId = $this->importExam('CPM 2024', 1);
        Exam::whereKey($publishedId)->update(['exam_status_id' => \App\Models\ExamStatus::where('slug', 'published')->value('id')]);
        Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Manual']); // não importado
        Exam::create(['tenant_id' => Tenant::factory()->create()->id, 'title' => 'Outra escola', 'origin' => 'pdf_import']);

        $all = $this->getJson('/api/question-bank/imported-exams')->assertOk();
        $this->assertEqualsCanonicalizing([$draftId, $publishedId], array_column($all->json('data'), 'id'));
        $this->assertSame(2, collect($all->json('data'))->firstWhere('id', $draftId)['questions_count']);

        $drafts = $this->getJson('/api/question-bank/imported-exams?status=draft')->assertOk();
        $this->assertSame([$draftId], array_column($drafts->json('data'), 'id'));
        $this->assertSame([$publishedId], array_column($this->getJson('/api/question-bank/imported-exams?search=CPM')->json('data'), 'id'));
    }

    public function test_deletes_imported_exam_keeping_or_dropping_questions(): void
    {
        $keepId = $this->importExam('Manter', 2);
        $dropId = $this->importExam('Descartar', 1);

        $this->deleteJson("/api/question-bank/imported-exams/{$keepId}?keep_questions=1")->assertOk();
        $this->assertSoftDeleted('exams', ['id' => $keepId]);
        $this->assertSame(2, ExamQuestion::where('question_text', 'like', 'Manter%')->whereNull('exam_id')->count());

        $this->deleteJson("/api/question-bank/imported-exams/{$dropId}")->assertOk();
        $this->assertSoftDeleted('exams', ['id' => $dropId]);
        $this->getJson('/api/question-bank/questions?search=Descartar')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_cannot_keep_questions_of_answered_exam_nor_delete_manual_or_foreign_exam(): void
    {
        $id = $this->importExam('Respondido', 1);
        $student = \App\Models\Student::factory()->create(['tenant_id' => $this->tenant->id]);
        \App\Models\ExamAttempt::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $id, 'student_id' => $student->id, 'started_at' => now(),
            'attempt_status_id' => \Illuminate\Support\Facades\DB::table('exam_attempt_statuses')->value('id'),
        ]);

        $this->deleteJson("/api/question-bank/imported-exams/{$id}?keep_questions=1")->assertStatus(422);
        $this->assertNotSoftDeleted('exams', ['id' => $id]);

        $manual = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Manual']);
        $foreign = Exam::create(['tenant_id' => Tenant::factory()->create()->id, 'title' => 'X', 'origin' => 'pdf_import']);
        $this->deleteJson("/api/question-bank/imported-exams/{$manual->id}")->assertNotFound();
        $this->deleteJson("/api/question-bank/imported-exams/{$foreign->id}")->assertNotFound();
    }

    public function test_only_super_admin_uploads_modality_logo_and_it_reaches_exam_payload(): void
    {
        Storage::fake('public');
        $type = ExamType::where('slug', 'enem')->firstOrFail();
        $logo = UploadedFile::fake()->image('ifal.png', 200, 200);

        $this->postJson("/api/admin/exam-types/{$type->id}/logo", ['logo' => $logo])->assertForbidden();

        Sanctum::actingAs(User::factory()->superAdmin()->create(['status' => 'active']));
        $this->postJson("/api/admin/exam-types/{$type->id}/logo", ['logo' => UploadedFile::fake()->create('x.svg', 10, 'image/svg+xml')])
            ->assertStatus(422);
        $url = $this->postJson("/api/admin/exam-types/{$type->id}/logo", ['logo' => $logo])->assertOk()->json('body.logo_url');
        $this->assertStringContainsString('/storage/uploads/exam-types/', $url);
        Storage::disk('public')->assertExists('uploads/exam-types/'.basename($url));

        $this->getJson('/api/exam-types')->assertOk()->assertJsonFragment(['slug' => 'enem', 'logo_url' => $url]);

        $this->deleteJson("/api/admin/exam-types/{$type->id}/logo")->assertOk()->assertJsonPath('body.logo_url', null);
        Storage::disk('public')->assertMissing('uploads/exam-types/'.basename($url));
    }
}
