<?php

namespace Tests\Feature;

use App\Services\PracticeRankingHistoryService;
use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Exam;
use App\Models\PracticeAnswer;
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
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

        return $this->approveQuestionForPractice($question->load('options'));
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

    /** Matricula o aluno numa turma cuja grade cobre as disciplinas das questões da escola. */
    private function inClass(Student $student, ?Course $course = null): Course
    {
        $tenantId = (int) $student->tenant_id;
        if (ExamQuestion::query()->where('tenant_id', $tenantId)->whereNull('subject_id')->exists()) {
            $geral = Subject::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'name' => 'GRADE DO ALUNO'],
                ['status' => 'active'],
            );
            ExamQuestion::query()->where('tenant_id', $tenantId)->whereNull('subject_id')->update(['subject_id' => $geral->id]);
        }
        $subjectIds = ExamQuestion::query()->where('tenant_id', $tenantId)->whereNotNull('subject_id')->distinct()->pluck('subject_id');
        $course ??= Course::factory()->create(['tenant_id' => $tenantId, 'name' => 'CPM']);
        $class = SchoolClass::factory()->create([
            'tenant_id' => $tenantId,
            'course_id' => $course->id,
        ]);
        foreach ($subjectIds->values() as $subjectId) {
            ClassSchedule::factory()->create([
                'tenant_id' => $tenantId,
                'school_class_id' => $class->id,
                'subject_id' => $subjectId,
            ]);
        }
        Enrollment::factory()->create([
            'tenant_id' => $tenantId,
            'student_id' => $student->id,
            'school_class_id' => $class->id,
            'start_date' => '2020-01-01',
            'end_date' => null,
            'status' => 'active',
        ]);

        return $course;
    }

    /** Coloca os alunos na mesma turma do mesmo curso, para o ranking não separá-los. */
    private function sameCourse(Student ...$students): Course
    {
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'CPM']);
        $class = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id]);
        foreach ($students as $student) {
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id,
                'student_id' => $student->id,
                'school_class_id' => $class->id,
                'start_date' => '2020-01-01',
                'end_date' => null,
                'status' => 'active',
            ]);
        }

        return $course;
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

        $student = $this->student();
        $this->inClass($student);
        $this->actingAsStudent($student);
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

    public function test_only_archived_official_exam_questions_become_available_for_practice(): void
    {
        $status = fn (string $slug) => DB::table('exam_statuses')->where('slug', $slug)->value('id');
        $exam = fn (string $slug, ?string $endsAt) => Exam::create([
            'tenant_id' => $this->tenant->id, 'title' => "Oficial {$slug}", 'exam_status_id' => $status($slug), 'ends_at' => $endsAt,
        ]);
        $inExam = function (string $text, Exam $exam) {
            $q = $this->practicable($text);
            $q->update(['exam_id' => $exam->id]);

            return $q;
        };
        $ended = $inExam('Encerrado', $exam('published', now()->subDay()->toDateTimeString()));
        $archived = $inExam('Arquivado', $exam('archived', null));
        $running = $inExam('Em andamento', $exam('published', now()->addDay()->toDateTimeString()));
        $draft = $inExam('Rascunho', $exam('draft', now()->subDay()->toDateTimeString()));

        $student = $this->student();
        $this->inClass($student);
        $this->actingAsStudent($student);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 1);
        for ($i = 0; $i < 4; $i++) {
            $body = $this->getJson('/api/aluno/practice/next-question')->assertOk()->json('body');
            $this->assertSame($archived->id, $body['id']);
            $this->assertSame('Oficial archived', $body['exam_title']);
        }
        $this->postJson("/api/aluno/practice/questions/{$archived->id}/answer", ['option_id' => $this->correct($archived)])
            ->assertOk()->assertJsonPath('body.is_correct', true);
        foreach ([$ended, $running, $draft] as $hidden) {
            $this->postJson("/api/aluno/practice/questions/{$hidden->id}/answer", ['option_id' => $this->correct($hidden)])->assertNotFound();
        }

        // Simulados do banco continuam aceitando só questões avulsas.
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/question-bank/question-sets', ['title' => 'X', 'question_ids' => [$ended->id]])->assertStatus(422);
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

        Sanctum::actingAs($this->admin);
        $setId = $this->publishedSet([$m, $h], 'Misto');
        $this->actingAsStudent($enrolled);
        $listed = collect($this->getJson('/api/aluno/question-sets')->assertOk()->json('body'))->firstWhere('id', $setId);
        $this->assertSame(1, $listed['questions_count']);
        $attempt = $this->postJson("/api/aluno/question-sets/{$setId}/start")->assertOk()->json('body');
        $this->assertSame([$m->id], array_column($attempt['questions'], 'id'));
        $this->postJson("/api/aluno/practice-attempts/{$attempt['attempt']['id']}/answer", [
            'question_id' => $h->id, 'option_id' => $this->correct($h),
        ])->assertNotFound();

        // Sem turma, ou turma sem disciplina na grade, não responde questão nenhuma.
        $this->actingAsStudent($this->student('JOÃO SEM TURMA'));
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 0);
        $this->postJson("/api/aluno/practice/questions/{$m->id}/answer", ['option_id' => $this->correct($m)])->assertNotFound();
        $this->assertSame([], $this->getJson('/api/aluno/question-sets')->assertOk()->json('body'));

        $semGrade = $this->student('SEM GRADE');
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $semGrade->id,
            'school_class_id' => SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $class->course_id])->id,
            'start_date' => now()->subMonth()->toDateString(), 'status' => 'active',
        ]);
        $this->actingAsStudent($semGrade);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 0);
    }

    public function test_student_answers_published_set_and_gets_correction_only_after_finishing(): void
    {
        $a = $this->practicable('A');
        $b = $this->practicable('B');
        $setId = $this->publishedSet([$a, $b]);
        $this->postJson('/api/question-bank/question-sets', ['title' => 'Rascunho', 'question_ids' => [$a->id]])->assertCreated();

        $student = $this->student();
        $this->inClass($student);
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

        $student = $this->student();
        $this->inClass($student);
        $this->actingAsStudent($student);
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
        $course = $this->inClass($maria);
        $this->inClass($joao, $course);
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
        $staff = $this->getJson('/api/question-bank/practice-ranking?period=all&course_id='.$course->id)->assertOk()->json('body.ranking');
        $this->assertSame([$maria->id, $joao->id], array_column($staff, 'student_id'));
        $this->assertSame('MARIA DA SILVA', $staff[0]['name']);
        $this->assertNotContains($other->id, array_column($staff, 'student_id'));
    }

    public function test_weekly_ranking_resets_on_monday_brasilia_and_last_week_is_closed(): void
    {
        $qs = collect(range(1, 3))->map(fn ($i) => $this->practicable("Q{$i}"));
        $maria = $this->student('MARIA DA SILVA');
        $joao = $this->student('JOAO PEREIRA');
        $course = $this->inClass($maria);
        $this->inClass($joao, $course);
        $answer = function (Student $student, ExamQuestion $q, string $atBrasilia) {
            $this->travelTo(Carbon::parse($atBrasilia, 'America/Sao_Paulo'));
            $this->actingAsStudent($student);
            $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $this->correct($q)])->assertOk();
        };

        // Domingo 23:30 em Brasília já é segunda em UTC, mas ainda conta na semana anterior.
        $answer($maria, $qs[0], '2026-10-04 23:30');
        $answer($maria, $qs[1], '2026-10-01 10:00');
        $answer($joao, $qs[0], '2026-10-05 00:10');
        $answer($joao, $qs[1], '2026-10-06 09:00');
        $answer($joao, $qs[2], '2026-10-07 18:00');

        $this->travelTo(Carbon::parse('2026-10-08 14:00', 'America/Sao_Paulo'));
        $this->actingAsStudent($maria);

        $week = $this->getJson('/api/aluno/practice/ranking?period=week')->assertOk()->json('body');
        $this->assertSame(['JOAO P.'], array_column($week['ranking'], 'name'));
        $this->assertSame([3], array_column($week['ranking'], 'questions'));
        $this->assertSame('2026-10-05T03:00:00+00:00', $week['since']);
        $this->assertNull($week['until']);
        $this->assertNull($week['me']);

        $lastWeek = $this->getJson('/api/aluno/practice/ranking?period=last_week')->assertOk()->json('body');
        $this->assertSame(['MARIA S.'], array_column($lastWeek['ranking'], 'name'));
        $this->assertSame([2], array_column($lastWeek['ranking'], 'questions'));
        $this->assertSame('2026-09-28T03:00:00+00:00', $lastWeek['since']);
        $this->assertSame('2026-10-05T03:00:00+00:00', $lastWeek['until']);
        $this->assertSame(1, $lastWeek['me']['position']);
    }

    public function test_ranking_movement_uses_the_hourly_snapshot(): void
    {
        $qs = collect(range(1, 3))->map(fn ($i) => $this->practicable("Q{$i}"));
        $maria = $this->student('MARIA DA SILVA');
        $joao = $this->student('JOAO PEREIRA');
        $course = $this->inClass($maria);
        $this->inClass($joao, $course);
        $answer = function (Student $student, ExamQuestion $q) {
            $this->actingAsStudent($student);
            $this->postJson("/api/aluno/practice/questions/{$q->id}/answer", ['option_id' => $this->correct($q)])->assertOk();
        };

        $answer($joao, $qs[0]);
        $answer($joao, $qs[1]);
        $answer($maria, $qs[0]);
        DB::table('practice_answers')->whereIn('student_id', [$maria->id, $joao->id])
            ->update(['answered_at' => now()->subHours(26)]);

        $this->artisan('ranking:snapshot')->assertSuccessful();
        $snapshot = DB::table('vw_practice_ranking')
            ->where('period', 'all')
            ->where('tenant_id', $this->tenant->id)
            ->pluck('position', 'student_id');
        $this->assertSame(1, (int) $snapshot[$joao->id]);
        $this->assertSame(2, (int) $snapshot[$maria->id]);

        $answer($maria, $qs[1]);
        $answer($maria, $qs[2]);

        $this->actingAsStudent($maria);
        $body = $this->getJson('/api/aluno/practice/ranking?period=all')->assertOk()->json('body');
        $byName = collect($body['ranking'])->keyBy('name');
        $this->assertSame(1, $byName['MARIA S.']['position']);
        $this->assertSame(1, $byName['MARIA S.']['movement']);
        $this->assertSame(2, $byName['JOAO P.']['position']);
        $this->assertSame(-1, $byName['JOAO P.']['movement']);
        $this->assertSame(1, $body['me']['movement']);
    }

    public function test_wilson_ranking_orders_by_score_not_by_raw_accuracy(): void
    {
        $perfis = [
            'ALUNO D' => [100, 85],
            'ALUNO E' => [50, 40],
            'ALUNO C' => [10, 9],
            'ALUNO B' => [20, 16],
            'ALUNO A' => [80, 32],
        ];
        $alunos = [];
        foreach ($perfis as $nome => [$total, $acertos]) {
            $aluno = $this->student($nome);
            $alunos[$nome] = $aluno;
            $this->seedCountedAnswers($aluno, $total, $acertos);
        }
        $course = $this->sameCourse(...array_values($alunos));

        $this->actingAsStudent($alunos['ALUNO D']);
        $body = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&per_page=10')->assertOk()->json('body');

        $this->assertSame('wilson', $body['criterion']);
        $this->assertSame(['ALUNO D.', 'ALUNO E.', 'ALUNO C.', 'ALUNO B.', 'ALUNO A.'], array_column($body['ranking'], 'name'));
        foreach ([76.7, 67.0, 59.6, 58.4, 30.0] as $i => $pontuacao) {
            $this->assertEqualsWithDelta($pontuacao, (float) $body['ranking'][$i]['score'], 0.001);
        }
        $this->assertSame([100, 50, 10, 20, 80], array_column($body['ranking'], 'questions'));
        $this->assertSame([85, 40, 9, 16, 32], array_column($body['ranking'], 'first_attempt_correct'));
        $this->assertSame([0, 0, 0, 0, 0], array_column($body['ranking'], 'retakes'));
        $this->assertEqualsWithDelta(76.7, (float) $body['ranking'][0]['wilson_score'], 0.001);
        $this->assertSame(1, $body['me']['position']);
        $this->assertTrue($body['me']['is_me']);
        $this->assertArrayNotHasKey('student_id', $body['ranking'][0]);

        Sanctum::actingAs($this->admin);
        $staff = $this->getJson('/api/question-bank/practice-ranking?criterion=wilson&period=all&course_id='.$course->id)->assertOk()->json('body.ranking');
        $this->assertSame('ALUNO D', $staff[0]['name']);
        $this->assertSame($alunos['ALUNO D']->id, $staff[0]['student_id']);
    }

    public function test_wilson_ranking_keeps_the_first_attempt_and_honors_filters(): void
    {
        $portugues = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);
        $matematica = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $crase = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $portugues->id, 'name' => 'Crase']);
        $algebra = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $matematica->id, 'name' => 'Álgebra']);
        $repetida = $this->practicable('Repetida', $portugues->id, [$crase->id]);
        $dePortugues = $this->practicable('Texto', $portugues->id, [$crase->id]);
        $deMatematica = $this->practicable('Conta', $matematica->id, [$algebra->id]);

        $ana = $this->student('ANA SOUZA');
        $bia = $this->student('BIA LIMA');
        $this->travelTo(Carbon::parse('2026-10-08 12:00:00'));
        $this->record($ana, $repetida, false, now()->subHour());
        $this->record($ana, $repetida, true, now());
        $this->record($ana, $dePortugues, true, now());
        $this->record($bia, $deMatematica, true, now()->subDays(8));
        $this->record($bia, $dePortugues, true, now());
        $this->sameCourse($ana, $bia);

        $this->actingAsStudent($ana);
        $geral = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $porNome = collect($geral['ranking'])->keyBy('name');
        // A segunda resposta da mesma questão (agora certa) não entra: fica o primeiro erro.
        $this->assertSame(2, $porNome['ANA S.']['questions']);
        $this->assertSame(3, $porNome['ANA S.']['answered']);
        $this->assertSame(1, $porNome['ANA S.']['retakes']);
        $this->assertSame(1, $porNome['ANA S.']['first_attempt_correct']);
        $this->assertSame(1, $porNome['ANA S.']['correct']);
        $this->assertSame(2, $porNome['BIA L.']['questions']);

        $disciplina = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&subject_id='.$portugues->id)->assertOk()->json('body');
        $this->assertSame(['BIA L.', 'ANA S.'], array_column($disciplina['ranking'], 'name'));
        $this->assertSame($portugues->id, $disciplina['subject_id']);

        $assunto = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&topic_id='.$algebra->id)->assertOk()->json('body.ranking');
        $this->assertSame(['BIA L.'], array_column($assunto, 'name'));
        $this->assertSame(1, $assunto[0]['answered']);

        $seteDias = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=7d')->assertOk()->json('body');
        $this->assertSame(['BIA L.', 'ANA S.'], array_column($seteDias['ranking'], 'name'));
        $this->assertSame(1, collect($seteDias['ranking'])->firstWhere('name', 'BIA L.')['answered']);

        $pagina = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&per_page=1&page=2')->assertOk()->json('body');
        $this->assertSame(2, $pagina['participants']);
        $this->assertSame(2, $pagina['last_page']);
        $this->assertSame([2], array_column($pagina['ranking'], 'position'));
        $this->assertSame(2, $pagina['me']['position']);

        $this->getJson('/api/aluno/practice/ranking?criterion=wilson&subject_id=999999')->assertStatus(422);
    }

    public function test_recent_ranking_photo_does_not_hide_yesterdays_movement(): void
    {
        $qs = collect(range(1, 3))->map(fn ($i) => $this->practicable("F{$i}"));
        $maria = $this->student('MARIA DA SILVA');
        $joao = $this->student('JOAO PEREIRA');
        $this->record($joao, $qs[0], true, now()->subHours(30));
        $this->record($joao, $qs[1], true, now()->subHours(30));
        $this->record($maria, $qs[0], true, now()->subHours(30));
        $this->record($maria, $qs[1], true, now());
        $this->record($maria, $qs[2], true, now());
        $this->sameCourse($maria, $joao);
        $capturedAt = now()->subHours(2);
        DB::table('practice_ranking_snapshots')->insert([
            ['captured_at' => $capturedAt, 'tenant_id' => $this->tenant->id, 'period' => 'all', 'criterion' => 'wilson', 'student_id' => $maria->id, 'position' => 1, 'questions' => 3, 'correct' => 3],
            ['captured_at' => $capturedAt, 'tenant_id' => $this->tenant->id, 'period' => 'all', 'criterion' => 'wilson', 'student_id' => $joao->id, 'position' => 2, 'questions' => 2, 'correct' => 2],
        ]);

        $this->actingAsStudent($maria);
        $body = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $byName = collect($body['ranking'])->keyBy('name');
        $this->assertSame(1, $byName['MARIA S.']['movement']);
        $this->assertSame(-1, $byName['JOAO P.']['movement']);
    }

    public function test_scored_rankings_move_against_the_position_from_yesterday(): void
    {
        $qs = collect(range(1, 3))->map(fn ($i) => $this->practicable("M{$i}"));
        $maria = $this->student('MARIA DA SILVA');
        $joao = $this->student('JOAO PEREIRA');
        $this->record($joao, $qs[0], true, now()->subHours(30));
        $this->record($joao, $qs[1], true, now()->subHours(30));
        $this->record($maria, $qs[0], true, now()->subHours(30));
        $this->record($maria, $qs[1], true, now());
        $this->record($maria, $qs[2], true, now());
        $this->sameCourse($maria, $joao);

        $this->actingAsStudent($maria);
        foreach (['wilson', 'dedication'] as $criterion) {
            $body = $this->getJson("/api/aluno/practice/ranking?criterion={$criterion}&period=all")->assertOk()->json('body');
            $byName = collect($body['ranking'])->keyBy('name');
            $this->assertSame(1, $byName['MARIA S.']['position'], $criterion);
            $this->assertSame(1, $byName['MARIA S.']['movement'], $criterion);
            $this->assertSame(-1, $byName['JOAO P.']['movement'], $criterion);
            $this->assertSame(1, $body['me']['movement'], $criterion);
        }
    }

    public function test_old_question_retaken_inside_the_period_does_not_count_as_new(): void
    {
        $antiga = $this->practicable('Antiga');
        $nova = $this->practicable('Nova');
        $revisor = $this->student('REVISOR SILVA');
        $iniciante = $this->student('INICIANTE COSTA');
        $this->travelTo(Carbon::parse('2026-10-08 15:00:00', 'America/Sao_Paulo'));

        // A primeira vez foi antes do período. Acertar de novo agora não cria questão nova.
        $this->record($revisor, $antiga, false, now()->subDays(10));
        $this->record($revisor, $antiga, true, now());
        $this->record($iniciante, $nova, true, now());
        $this->sameCourse($revisor, $iniciante);

        $this->actingAsStudent($iniciante);
        $desempenho = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=7d')->assertOk()->json('body');
        $this->assertSame(['INICIANTE C.'], array_column($desempenho['ranking'], 'name'));
        $this->assertSame(1, $desempenho['me']['position']);
        $this->assertSame(1, $desempenho['me']['questions']);

        $dedicacao = $this->getJson('/api/aluno/practice/ranking?criterion=dedication&period=7d')->assertOk()->json('body');
        $porNome = collect($dedicacao['ranking'])->keyBy('name');
        $this->assertSame(0, $porNome['REVISOR S.']['questions']);
        $this->assertSame(1, $porNome['REVISOR S.']['retakes']);
        $this->assertSame(1, $porNome['REVISOR S.']['active_days']);
        $this->assertSame(5, $porNome['REVISOR S.']['dedication_score']);
        $this->assertSame(6, $porNome['INICIANTE C.']['dedication_score']);
        $this->assertSame(1, $porNome['INICIANTE C.']['position']);
        $this->assertSame(2, $porNome['REVISOR S.']['position']);
    }

    public function test_first_attempt_follows_answered_at_not_insert_order(): void
    {
        $questao = $this->practicable('Ordem');
        $aluno = $this->student('ORDEM REAL');
        $this->record($aluno, $questao, true, now()->addHour());
        $this->record($aluno, $questao, false, now()->subHour());
        $this->sameCourse($aluno);

        $this->actingAsStudent($aluno);
        $linha = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body.ranking.0');
        $this->assertSame(0, $linha['first_attempt_correct']);
        $this->assertSame(1, $linha['questions']);
        $this->assertSame(1, $linha['retakes']);
    }

    public function test_dedication_values_new_questions_and_active_days_in_school_timezone(): void
    {
        $questoes = collect(range(1, 6))->map(fn ($i) => $this->practicable("D{$i}"));
        $umDia = $this->student('UM DIA');
        $doisDias = $this->student('DOIS DIAS');
        $this->travelTo(Carbon::parse('2026-10-08 12:00:00', 'America/Sao_Paulo'));

        foreach ($questoes as $questao) {
            $this->record($umDia, $questao, true, Carbon::parse('2026-10-08 15:00:00', 'UTC'));
        }
        $this->record($doisDias, $questoes[0], true, Carbon::parse('2026-10-08 02:00:00', 'UTC'));
        $this->record($doisDias, $questoes[0], true, Carbon::parse('2026-10-08 04:00:00', 'UTC'));
        $this->sameCourse($umDia, $doisDias);

        $this->actingAsStudent($umDia);
        $body = $this->getJson('/api/aluno/practice/ranking?criterion=dedication&period=all')->assertOk()->json('body');
        $porNome = collect($body['ranking'])->keyBy('name');

        // 02:00 UTC ainda é 07/10 em Brasília; 04:00 UTC já é 08/10. Mesma questão, dois dias.
        $this->assertSame(1, $porNome['DOIS D.']['questions']);
        $this->assertSame(1, $porNome['DOIS D.']['retakes']);
        $this->assertSame(2, $porNome['DOIS D.']['active_days']);
        $this->assertSame(2, $porNome['DOIS D.']['streak']);
        $this->assertSame(11, $porNome['DOIS D.']['dedication_score']);
        $this->assertSame(6, $porNome['UM D.']['questions']);
        $this->assertSame(1, $porNome['UM D.']['active_days']);
        $this->assertSame(11, $porNome['UM D.']['dedication_score']);
        $this->assertSame(1, $porNome['DOIS D.']['position']);
        $this->assertSame(2, $body['me']['position']);
    }

    public function test_daily_ranking_history_marks_rise_fall_same_and_newcomer(): void
    {
        $this->travelTo(Carbon::parse('2026-10-08 15:00', 'America/Sao_Paulo'));
        $yesterday = Carbon::parse('2026-10-07 12:00', 'America/Sao_Paulo');
        $today = Carbon::parse('2026-10-08 10:00', 'America/Sao_Paulo');
        $qs = collect(range(1, 4))->map(fn ($i) => $this->practicable("H{$i}"));
        $joao = $this->student('JOAO PEREIRA');
        $maria = $this->student('MARIA DA SILVA');
        $pedro = $this->student('PEDRO ALVES');
        $ana = $this->student('ANA COSTA');
        $this->record($joao, $qs[0], true, $yesterday);
        $this->record($joao, $qs[1], true, $yesterday);
        $this->record($maria, $qs[0], true, $yesterday);
        $this->record($pedro, $qs[2], true, $yesterday);
        $this->record($maria, $qs[1], true, $today);
        $this->record($maria, $qs[3], true, $today);
        $this->record($ana, $qs[2], true, $today);
        $this->sameCourse($joao, $maria, $pedro, $ana);

        $this->actingAsStudent($maria);
        $body = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $byName = collect($body['ranking'])->keyBy('name');
        $this->assertSame(1, $byName['MARIA S.']['position']);
        $this->assertSame(2, $byName['MARIA S.']['previous_position']);
        $this->assertSame(1, $byName['MARIA S.']['movement']);
        $this->assertSame('up', $byName['MARIA S.']['movement_status']);
        $this->assertSame(1, $byName['JOAO P.']['previous_position']);
        $this->assertSame(-1, $byName['JOAO P.']['movement']);
        $this->assertSame('down', $byName['JOAO P.']['movement_status']);
        $this->assertSame(3, $byName['PEDRO A.']['previous_position']);
        $this->assertSame(0, $byName['PEDRO A.']['movement']);
        $this->assertSame('same', $byName['PEDRO A.']['movement_status']);
        $this->assertNull($byName['ANA C.']['previous_position']);
        $this->assertNull($byName['ANA C.']['movement']);
        $this->assertSame('new', $byName['ANA C.']['movement_status']);
        $this->assertNotNull($body['movement_reference_at']);
        $this->assertSame('up', $body['me']['movement_status']);

        $days = DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $this->tenant->id)->where('criterion', 'wilson')->where('period', 'all')->count();
        $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk();
        $this->assertSame($days, DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $this->tenant->id)->where('criterion', 'wilson')->where('period', 'all')->count());
    }

    public function test_ranking_history_stays_inside_the_same_period_scope_and_criterion(): void
    {
        $this->travelTo(Carbon::parse('2026-10-08 15:00', 'America/Sao_Paulo'));
        $matematica = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $maria = $this->student('MARIA DA SILVA');
        $this->record($maria, $this->practicable('Escopo', $matematica->id), true, Carbon::parse('2026-10-07 12:00', 'America/Sao_Paulo'));
        $course = $this->sameCourse($maria);
        $history = app(PracticeRankingHistoryService::class);
        $history->store($this->tenant->id, 'wilson', 'week', $course->id, null, null, '2026-10-07', [
            ['student_id' => $maria->id, 'position' => 9, 'score' => 1],
        ], now());

        $this->actingAsStudent($maria);
        $week = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=week')->assertOk()->json('body');
        $this->assertSame(9, $week['me']['previous_position']);
        $this->assertSame('up', $week['me']['movement_status']);

        $month = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=month')->assertOk()->json('body');
        $this->assertSame(1, $month['me']['previous_position']);
        $this->assertSame('same', $month['me']['movement_status']);

        $history->store($this->tenant->id, 'wilson', 'all', $course->id, null, null, '2026-10-07', [
            ['student_id' => $maria->id, 'position' => 7, 'score' => 1],
        ], now());
        $geral = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $this->assertSame(7, $geral['me']['previous_position']);

        $dedication = $this->getJson('/api/aluno/practice/ranking?criterion=dedication&period=all')->assertOk()->json('body');
        $this->assertSame(1, $dedication['me']['previous_position']);
        $this->assertSame('same', $dedication['me']['movement_status']);

        $filtrado = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&subject_id='.$matematica->id)->assertOk()->json('body');
        $this->assertSame(1, $filtrado['me']['previous_position']);
        $this->assertSame('same', $filtrado['me']['movement_status']);
    }

    public function test_ranking_history_keeps_the_tie_break_of_the_live_ranking(): void
    {
        $this->travelTo(Carbon::parse('2026-10-08 15:00', 'America/Sao_Paulo'));
        $at = Carbon::parse('2026-10-07 12:00', 'America/Sao_Paulo');
        $bia = $this->student('BIA LIMA');
        $ana = $this->student('ANA COSTA');
        $this->record($bia, $this->practicable('B'), true, $at);
        $this->record($ana, $this->practicable('A'), true, $at);
        $this->sameCourse($bia, $ana);

        $this->actingAsStudent($bia);
        $body = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $this->assertSame(['BIA L.', 'ANA C.'], array_column($body['ranking'], 'name'));
        $this->assertSame([1, 2], array_column($body['ranking'], 'previous_position'));
        $this->assertSame(['same', 'same'], array_column($body['ranking'], 'movement_status'));
    }

    public function test_daily_snapshot_command_is_idempotent(): void
    {
        $this->travelTo(Carbon::parse('2026-10-08 15:00', 'America/Sao_Paulo'));
        $maria = $this->student('MARIA DA SILVA');
        $course = $this->sameCourse($maria);
        $this->record($maria, $this->practicable('Dia'), true, Carbon::parse('2026-10-07 12:00', 'America/Sao_Paulo'));

        $this->artisan('ranking:daily-snapshot')->assertSuccessful();
        $this->artisan('ranking:daily-snapshot')->assertSuccessful();

        $days = DB::table('practice_ranking_snapshot_days')
            ->where('tenant_id', $this->tenant->id)->where('criterion', 'wilson')->where('period', 'all')->where('scope_key', 'c'.$course->id);
        $this->assertSame(1, $days->count());
        $this->assertSame(1, DB::table('practice_ranking_snapshot_positions')->where('snapshot_day_id', $days->value('id'))->count());
    }

    public function test_ranking_keeps_students_of_different_courses_apart(): void
    {
        $questao = $this->practicable('Curso');
        $cpmStudent = $this->student('ALUNO CPM');
        $ifalStudent = $this->student('ALUNO IFAL');
        $cpm = $this->sameCourse($cpmStudent);
        $ifal = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'IFAL']);
        $class = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $ifal->id]);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $ifalStudent->id, 'school_class_id' => $class->id,
            'start_date' => '2020-01-01', 'end_date' => null, 'status' => 'active',
        ]);
        $this->record($cpmStudent, $questao, true, now());
        $this->record($ifalStudent, $questao, true, now());

        $this->actingAsStudent($cpmStudent);
        $cpmBody = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $this->assertSame($cpm->id, $cpmBody['course_id']);
        $this->assertSame(['ALUNO C.'], array_column($cpmBody['ranking'], 'name'));
        $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all&course_id='.$ifal->id)->assertStatus(422);

        $this->actingAsStudent($ifalStudent);
        $ifalBody = $this->getJson('/api/aluno/practice/ranking?criterion=wilson&period=all')->assertOk()->json('body');
        $this->assertSame($ifal->id, $ifalBody['course_id']);
        $this->assertSame(['ALUNO I.'], array_column($ifalBody['ranking'], 'name'));

        Sanctum::actingAs($this->admin);
        $staff = $this->getJson('/api/question-bank/practice-ranking?criterion=wilson&period=all&course_id='.$cpm->id)
            ->assertOk()->json('body');
        $this->assertSame('CPM', $staff['course_name']);
        $this->assertSame(['ALUNO CPM'], array_column($staff['ranking'], 'name'));
        $this->getJson('/api/question-bank/practice-ranking?criterion=wilson&period=all')->assertStatus(422);
    }

    /** @param  ExamQuestion[]  $questions */
    private function seedCountedAnswers(Student $student, int $total, int $correct): void
    {
        for ($i = 0; $i < $total; $i++) {
            $this->record($student, $this->practicable('W'.$student->id.'-'.$i), $i < $correct, now()->addSeconds($i));
        }
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
}
