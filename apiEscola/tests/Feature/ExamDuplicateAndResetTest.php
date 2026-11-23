<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamAttempt;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Models\ExamStatus;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\SupportMaterial;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Duplicar o simulado e redefinir as entregas para os alunos refazerem. */
class ExamDuplicateAndResetTest extends TestCase
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

    public function test_duplicate_is_a_draft_copy_and_reset_clears_deliveries(): void
    {
        $published = ExamStatus::query()->where('slug', 'published')->value('id');
        $courseA = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'CPM 1 DIA']);
        $courseB = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'CPM 2 DIAS']);
        $subject = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $topic = SubjectTopic::create([
            'tenant_id' => $this->tenant->id,
            'subject_id' => $subject->id,
            'name' => 'Frações',
        ]);

        $exam = Exam::create([
            'tenant_id' => $this->tenant->id,
            'title' => 'FRAÇÃO REVISÃO FINAL',
            'description' => 'Revisão',
            'exam_status_id' => $published,
            'duration_minutes' => 90,
            'allow_retake' => false,
        ]);
        $exam->courses()->sync([$courseA->id, $courseB->id]);

        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id,
            'exam_id' => $exam->id,
            'subject_id' => $subject->id,
            'type' => 'multiple_choice',
            'question_text' => 'Quanto é 1/2 + 1/2?',
            'points' => 1,
            'order' => 1,
        ]);
        $question->topics()->sync([$topic->id]);
        $wrong = ExamQuestionOption::create(['question_id' => $question->id, 'option_text' => '1/4', 'is_correct' => false, 'order' => 1]);
        $right = ExamQuestionOption::create(['question_id' => $question->id, 'option_text' => '1', 'is_correct' => true, 'order' => 2]);

        SupportMaterial::create([
            'tenant_id' => $this->tenant->id,
            'exam_id' => $exam->id,
            'title' => 'Lista de frações',
            'type' => 'link',
            'content' => 'https://exemplo.test/fracoes',
        ]);

        $student = Student::factory()->create(['tenant_id' => $this->tenant->id]);
        $attempt = ExamAttempt::create([
            'tenant_id' => $this->tenant->id,
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'started_at' => now()->subHour(),
            'finished_at' => now(),
            'status' => 'completed',
            'score' => 1,
            'max_score' => 1,
            'percentage' => 100,
        ]);
        ExamAnswer::create([
            'attempt_id' => $attempt->id,
            'question_id' => $question->id,
            'option_id' => $right->id,
            'is_correct' => true,
            'points_earned' => 1,
        ]);

        $response = $this->postJson("/api/exams/{$exam->id}/duplicate")
            ->assertCreated()
            ->assertJsonPath('body.status', 'draft')
            ->assertJsonPath('body.title', 'FRAÇÃO REVISÃO FINAL (cópia)')
            ->assertJsonPath('body.duration_minutes', 90);

        $copyId = $response->json('body.id');
        $this->assertNotSame($exam->id, $copyId);
        $this->assertEqualsCanonicalizing(
            [$courseA->id, $courseB->id],
            Exam::find($copyId)->courses()->pluck('courses.id')->all()
        );

        $copyQuestion = ExamQuestion::query()->where('exam_id', $copyId)->first();
        $this->assertSame('Quanto é 1/2 + 1/2?', $copyQuestion->question_text);
        $this->assertSame([$topic->id], $copyQuestion->topics()->pluck('subject_topics.id')->all());
        $this->assertSame(1, $copyQuestion->options()->where('is_correct', true)->where('option_text', '1')->count());
        $this->assertSame(1, SupportMaterial::query()->where('exam_id', $copyId)->where('title', 'Lista de frações')->count());
        $this->assertSame(0, ExamAttempt::query()->where('exam_id', $copyId)->count());
        $this->assertSame($published, $exam->fresh()->exam_status_id);
        $this->assertSame($exam->id, $question->fresh()->exam_id);
        $this->assertNotNull($wrong->fresh());

        $this->postJson("/api/exams/{$exam->id}/reset-deliveries")
            ->assertOk()
            ->assertJsonPath('body.attempts_removed', 1);

        $this->assertSoftDeleted('exam_attempts', ['id' => $attempt->id]);
        $this->assertDatabaseMissing('exam_answers', ['attempt_id' => $attempt->id]);
        $this->assertSame(0, ExamAttempt::query()->where('exam_id', $exam->id)->count());

        $this->postJson("/api/exams/{$exam->id}/reset-deliveries")
            ->assertOk()
            ->assertJsonPath('body.attempts_removed', 0);
    }
}
