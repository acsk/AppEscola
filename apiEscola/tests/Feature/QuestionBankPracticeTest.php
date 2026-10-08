<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamType;
use App\Models\Student;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Simulados do banco (montados pelo admin ou pela importação de PDF), prática do aluno,
 * desempenho por disciplina/assunto e ranking de participação.
 * Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/QuestionBankPracticeTest.php
 */
class QuestionBankPracticeTest extends TestCase
{
    use RefreshDatabase;

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

    private function practicable(string $text, ?int $subjectId = null, array $topicIds = [], ?int $tenantId = null): ExamQuestion
    {
        $question = ExamQuestion::create([
            'tenant_id' => $tenantId ?? $this->tenant->id, 'exam_id' => null, 'type' => 'multiple_choice',
            'question_text' => $text, 'subject_id' => $subjectId, 'points' => 1, 'order' => 1, 'explanation' => "Porque {$text}",
        ]);
        $question->options()->createMany([
            ['option_text' => 'Certa', 'is_correct' => true, 'order' => 1],
            ['option_text' => 'Errada', 'is_correct' => false, 'order' => 2],
        ]);
        $question->topics()->sync($topicIds);

        return $question->load('options');
    }

    private function correct(ExamQuestion $q): int
    {
        return $q->options->firstWhere('is_correct', true)->id;
    }

    private function wrong(ExamQuestion $q): int
    {
        return $q->options->firstWhere('is_correct', false)->id;
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

    private function publishedSet(array $questions, string $title = 'Simulado do banco'): int
    {
        $id = $this->postJson('/api/question-bank/question-sets', [
            'title' => $title, 'question_ids' => array_map(fn ($q) => $q->id, $questions),
        ])->assertCreated()->json('body.id');
        $this->putJson("/api/question-bank/question-sets/{$id}", ['status' => 'published'])->assertOk();

        return $id;
    }

    public function test_admin_builds_set_referencing_questions_without_moving_them(): void
    {
        $a = $this->practicable('A');
        $b = $this->practicable('B');
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Oficial']);
        $official = $this->practicable('Oficial');
        $official->update(['exam_id' => $exam->id]);
        $foreign = $this->practicable('Outra escola', tenantId: Tenant::factory()->create()->id);

        $message = fn (int $badId) => $this->postJson('/api/question-bank/question-sets', ['title' => 'X', 'question_ids' => [$a->id, $badId]])
            ->assertStatus(422)->json('message');
        $this->assertStringContainsString("#{$official->id} já pertence(m) a simulado oficial (\"Oficial\")", $message($official->id));
        $this->assertStringContainsString("#{$foreign->id} não existe(m) ou não é(são) desta escola", $message($foreign->id));
        $this->assertSame(0, \App\Models\QuestionSet::count());

        $id = $this->postJson('/api/question-bank/question-sets', ['title' => 'Revisão', 'question_ids' => [$a->id, $b->id]])
            ->assertCreated()
            ->assertJsonPath('body.status', 'draft')
            ->assertJsonPath('body.origin', 'admin')
            ->assertJsonPath('body.questions_count', 2)
            ->json('body.id');
        $this->assertNull($a->fresh()->exam_id);

        $this->putJson("/api/question-bank/question-sets/{$id}/questions/order", ['question_ids' => [$b->id, $a->id]])->assertOk();
        $this->assertSame([$b->id, $a->id], array_column($this->getJson("/api/question-bank/question-sets/{$id}")->json('body.questions'), 'id'));

        $this->deleteJson("/api/question-bank/question-sets/{$id}/questions/{$b->id}")->assertOk()->assertJsonPath('body.questions_count', 1);
        $this->deleteJson("/api/question-bank/question-sets/{$id}")->assertOk();
        $this->assertNotNull($a->fresh());
    }

    public function test_pdf_import_set_requires_exam_type_and_applies_it_to_questions(): void
    {
        $q = $this->practicable('Importada');
        $this->postJson('/api/question-bank/question-sets', ['title' => 'IFAL', 'origin' => 'pdf_import', 'question_ids' => [$q->id]])
            ->assertStatus(422);

        $this->postJson('/api/question-bank/question-sets', [
            'title' => 'IFAL 2024', 'origin' => 'pdf_import', 'exam_type' => 'enem', 'question_ids' => [$q->id],
        ])->assertCreated()->assertJsonPath('body.origin', 'pdf_import');

        $this->assertSame(ExamType::where('slug', 'enem')->value('id'), $q->fresh()->exam_type_id);
        $this->assertNull($q->fresh()->exam_id);
    }

    public function test_generates_set_by_subject_filter(): void
    {
        $math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $this->practicable('M1', $math->id);
        $this->practicable('M2', $math->id);
        $this->practicable('Sem disciplina');

        $this->postJson('/api/question-bank/question-sets/generate', ['title' => 'Mat', 'quantity' => 5, 'subject_ids' => [$math->id]])
            ->assertCreated()
            ->assertJsonPath('body.questions_count', 2);
    }

    public function test_cannot_publish_set_without_practicable_questions_and_student_cannot_manage(): void
    {
        $essay = ExamQuestion::create(['tenant_id' => $this->tenant->id, 'type' => 'essay', 'question_text' => 'Disserte', 'points' => 1, 'order' => 1]);
        $id = $this->postJson('/api/question-bank/question-sets', ['title' => 'Só discursiva', 'question_ids' => [$essay->id]])
            ->assertCreated()->json('body.id');
        $this->putJson("/api/question-bank/question-sets/{$id}", ['status' => 'published'])->assertStatus(422);

        $this->actingAsStudent($this->student());
        $this->getJson('/api/question-bank/question-sets')->assertForbidden();
        $this->getJson('/api/question-bank/practice-ranking')->assertForbidden();
    }

    public function test_student_practices_single_questions_with_immediate_feedback_and_never_sees_official_ones(): void
    {
        $q = $this->practicable('Avulsa');
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Oficial']);
        $this->practicable('Oficial')->update(['exam_id' => $exam->id]);
        $this->practicable('Outra escola', tenantId: Tenant::factory()->create()->id);

        $this->actingAsStudent($this->student());
        for ($i = 0; $i < 5; $i++) {
            $next = $this->getJson('/api/aluno/practice/next-question')->assertOk()->json('body');
            $this->assertSame($q->id, $next['id']);
            $this->assertArrayNotHasKey('is_correct', $next['options'][0]);
            $this->assertArrayNotHasKey('explanation', $next);
        }

        $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $this->wrong($q)])
            ->assertOk()
            ->assertJsonPath('body.is_correct', false)
            ->assertJsonPath('body.correct_option_id', $this->correct($q))
            ->assertJsonPath('body.explanation', 'Porque Avulsa');

        $official = ExamQuestion::where('question_text', 'Oficial')->first();
        $this->postJson("/api/aluno/practice/questions/{$official->id}/answer", ['option_id' => $official->options()->value('id')])
            ->assertNotFound();
    }

    public function test_student_practices_only_subjects_from_their_class_schedule(): void
    {
        $math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática CPM']);
        $portuguese = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português CPM']);
        $history = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'História']);
        $m = $this->practicable('Mat', $math->id);
        $this->practicable('Port', $portuguese->id);
        $h = $this->practicable('Hist', $history->id);

        $class = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => Course::factory()->create(['tenant_id' => $this->tenant->id])->id]);
        foreach ([$math, $portuguese] as $subject) {
            ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $class->id, 'subject_id' => $subject->id]);
        }
        $other = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $class->course_id]);
        ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $other->id, 'subject_id' => $history->id]);

        $enrolled = $this->student();
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $enrolled->id, 'school_class_id' => $class->id,
            'start_date' => now()->subMonth()->toDateString(), 'status' => 'active',
        ]);
        $this->actingAsStudent($enrolled);

        $filters = $this->getJson('/api/aluno/practice/filters')->assertOk()->json('body');
        $this->assertSame(2, $filters['total']);
        $this->assertEqualsCanonicalizing([$math->id, $portuguese->id], array_column($filters['subjects'], 'id'));
        for ($i = 0; $i < 5; $i++) {
            $this->assertNotSame($h->id, $this->getJson('/api/aluno/practice/next-question')->assertOk()->json('body.id'));
        }
        $this->getJson("/api/aluno/practice/next-question?subject_id={$history->id}")->assertOk()->assertJsonPath('body', null);
        $this->postJson("/api/aluno/practice/questions/{$h->id}/answer", ['option_id' => $this->correct($h)])->assertNotFound();
        $this->postJson("/api/aluno/practice/questions/{$m->id}/answer", ['option_id' => $this->correct($m)])->assertOk();

        // Sem turma com grade: o banco inteiro da escola continua disponível.
        $this->actingAsStudent($this->student('JOÃO SEM TURMA'));
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 3);
    }

    public function test_student_answers_published_set_and_gets_correction_only_after_finishing(): void
    {
        $a = $this->practicable('A');
        $b = $this->practicable('B');
        $setId = $this->publishedSet([$a, $b]);
        $this->postJson('/api/question-bank/question-sets', ['title' => 'Rascunho', 'question_ids' => [$a->id]])->assertCreated();

        $student = $this->student();
        $this->actingAsStudent($student);
        $sets = $this->getJson('/api/aluno/question-sets')->assertOk()->json('body');
        $this->assertSame([$setId], array_column($sets, 'id'));

        $attempt = $this->postJson("/api/aluno/question-sets/{$setId}/start")->assertOk()->json('body');
        $attemptId = $attempt['attempt']['id'];
        $this->assertArrayNotHasKey('correct_option_id', $attempt['questions'][0]);
        $this->assertSame($attemptId, $this->postJson("/api/aluno/question-sets/{$setId}/start")->json('body.attempt.id'));

        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $a->id, 'option_id' => $this->correct($a)])
            ->assertOk()->assertJsonPath('body.answered_count', 1)->assertJsonPath('body.correct_count', null);
        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $b->id, 'option_id' => $this->wrong($b)])->assertOk();

        // Respostas de simulado em andamento não entram no desempenho (não revelam a correção).
        $this->assertSame(0, $this->getJson('/api/aluno/practice/summary')->json('body.answered'));

        $finished = $this->postJson("/api/aluno/practice-attempts/{$attemptId}/finish")->assertOk()
            ->assertJsonPath('body.attempt.correct_count', 1)
            ->assertJsonPath('body.attempt.question_count', 2)
            ->json('body.questions');
        $this->assertSame($this->correct($b), collect($finished)->firstWhere('id', $b->id)['correct_option_id']);
        $this->assertSame(2, $this->getJson('/api/aluno/practice/summary')->json('body.answered'));

        $this->postJson("/api/aluno/practice-attempts/{$attemptId}/answer", ['question_id' => $a->id, 'option_id' => $this->wrong($a)])
            ->assertStatus(409);

        $this->actingAsStudent($this->student('OUTRO ALUNO'));
        $this->getJson("/api/aluno/practice-attempts/{$attemptId}")->assertNotFound();
    }

    public function test_performance_by_subject_and_topic_points_what_to_study(): void
    {
        $port = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);
        $interp = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $port->id, 'name' => 'Interpretação']);
        $crase = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $port->id, 'name' => 'Crase']);
        $nunca = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $port->id, 'name' => 'Ortografia']);
        $interpQs = collect(range(1, 5))->map(fn ($i) => $this->practicable("I{$i}", $port->id, [$interp->id]));
        $craseQs = collect(range(1, 5))->map(fn ($i) => $this->practicable("C{$i}", $port->id, [$crase->id]));
        $this->practicable('O1', $port->id, [$nunca->id]);

        $this->actingAsStudent($this->student());
        $interpQs->each(fn ($q) => $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $this->correct($q)])->assertOk());
        $craseQs->each(fn ($q, $i) => $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", [
            'option_id' => $i === 0 ? $this->correct($q) : $this->wrong($q),
        ])->assertOk());

        $body = $this->getJson('/api/aluno/practice/performance')->assertOk()->json('body');
        $this->assertSame(10, $body['overall']['answered']);
        $subject = collect($body['subjects'])->firstWhere('id', $port->id);
        $this->assertSame(60.0, (float) $subject['accuracy']);
        $topics = collect($subject['topics'])->keyBy('name');
        $this->assertSame('good', $topics['Interpretação']['level']);
        $this->assertSame('weak', $topics['Crase']['level']);
        $this->assertSame('not_started', $topics['Ortografia']['level']);
        $this->assertSame('Crase', $subject['topics'][0]['name']);

        $this->assertSame(['Crase', 'Ortografia'], array_column(array_column($body['study_focus'], 'topic'), 'name'));
        $this->assertSame(['low_accuracy', 'not_started'], array_column($body['study_focus'], 'reason'));
    }

    public function test_ranking_counts_distinct_questions_and_hides_full_names_from_students(): void
    {
        $qs = collect(range(1, 3))->map(fn ($i) => $this->practicable("Q{$i}"));
        $maria = $this->student('MARIA DA SILVA');
        $joao = $this->student('JOAO PEREIRA');
        $other = Student::factory()->create(['tenant_id' => Tenant::factory()->create()->id]);

        $this->actingAsStudent($joao);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson("/api/aluno/practice/questions/{$qs[0]->id}/answer", ['option_id' => $this->correct($qs[0])])->assertOk();
        }
        $this->actingAsStudent($maria);
        $qs->each(fn ($q) => $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $this->wrong($q)])->assertOk());

        $body = $this->getJson('/api/aluno/practice/ranking?period=week')->assertOk()->json('body');
        $this->assertSame(2, $body['participants']);
        $this->assertSame(['MARIA S.', 'JOAO P.'], array_column($body['ranking'], 'name'));
        $this->assertSame([3, 1], array_column($body['ranking'], 'questions'));
        $this->assertArrayNotHasKey('student_id', $body['ranking'][0]);
        $this->assertSame(1, $body['me']['position']);
        $this->assertTrue($body['me']['is_me']);

        Sanctum::actingAs($this->admin);
        $staff = $this->getJson('/api/question-bank/practice-ranking?period=all')->assertOk()->json('body.ranking');
        $this->assertSame([$maria->id, $joao->id], array_column($staff, 'student_id'));
        $this->assertSame('MARIA DA SILVA', $staff[0]['name']);
        $this->assertNotContains($other->id, array_column($staff, 'student_id'));
    }
}
