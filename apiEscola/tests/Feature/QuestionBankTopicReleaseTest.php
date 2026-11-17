<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionBankTopicRelease;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Rodar com: php artisan test -c phpunit.mysql.xml tests/Feature/QuestionBankTopicReleaseTest.php */
class QuestionBankTopicReleaseTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private User $admin;

    private Course $course;

    private Subject $math;

    private SubjectTopic $algebra;

    private SubjectTopic $geometry;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
        $this->course = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'CPM']);
        $this->math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $this->algebra = SubjectTopic::query()->create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Álgebra']);
        $this->geometry = SubjectTopic::query()->create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Geometria']);
        Sanctum::actingAs($this->admin);
    }

    public function test_classes_until_2026_keep_the_whole_subject_and_2027_only_released_topics(): void
    {
        $algebra = $this->bankQuestion('Equação', [$this->algebra->id]);
        $geometry = $this->bankQuestion('Ângulo', [$this->geometry->id]);
        $untagged = $this->bankQuestion('Sem assunto', []);

        $current = $this->enroll('TURMA 2026', 2026);
        $this->actAsStudent($current);
        $this->assertSame(3, $this->getJson('/api/aluno/practice/filters')->assertOk()->json('body.total'));

        $next = $this->enroll('TURMA 2027', 2027);
        $this->actAsStudent($next);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 0);

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/question-bank/subjects/{$this->math->id}/topic-releases", [
            'course_id' => $this->course->id,
            'topic_ids' => [$this->algebra->id],
        ])->assertOk();

        $this->actAsStudent($next);
        $filters = $this->getJson('/api/aluno/practice/filters')->assertOk()->json('body');
        $this->assertSame(1, $filters['total']);
        $this->postJson("/api/aluno/practice/questions/{$algebra->id}/answer", ['option_id' => $this->correct($algebra)])->assertOk();
        $this->postJson("/api/aluno/practice/questions/{$geometry->id}/answer", ['option_id' => $this->correct($geometry)])->assertNotFound();
        $this->postJson("/api/aluno/practice/questions/{$untagged->id}/answer", ['option_id' => $this->correct($untagged)])->assertNotFound();

        $other = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'ENEM']);
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/question-bank/subjects/{$this->math->id}/topic-releases", [
            'course_id' => $other->id,
            'topic_ids' => [$this->geometry->id],
        ])->assertOk();
        $this->actAsStudent($next);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 1);
    }

    public function test_official_exam_releases_its_topics_and_manual_release_survives_when_the_exam_is_turned_off(): void
    {
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Simulado de álgebra']);
        $exam->courses()->attach($this->course->id);
        $official = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $exam->id, 'type' => 'multiple_choice',
            'question_text' => 'Oficial', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
        $official->topics()->sync([$this->algebra->id]);
        $this->bankQuestion('Extra', [$this->algebra->id]);
        $this->bankQuestion('Outro assunto', [$this->geometry->id]);

        $preview = $this->getJson("/api/exams/{$exam->id}/question-bank-release")->assertOk()->json('body');
        $this->assertFalse($preview['configured']);
        $this->assertSame([$this->algebra->id], array_column($preview['subjects'][0]['topics'], 'id'));

        $this->putJson("/api/exams/{$exam->id}/question-bank-release", [
            'enabled' => true,
            'topic_ids' => [$this->geometry->id],
        ])->assertStatus(422);

        $this->putJson("/api/exams/{$exam->id}/question-bank-release", [
            'enabled' => true,
            'topic_ids' => [$this->algebra->id],
        ])->assertOk()->assertJsonPath('body.subjects.0.topics.0.selected', true);

        $student = $this->enroll('TURMA 2027', 2027);
        $this->actAsStudent($student);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 1);

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/question-bank/subjects/{$this->math->id}/topic-releases", [
            'course_id' => $this->course->id,
            'topic_ids' => [$this->algebra->id],
        ])->assertOk();
        $this->putJson("/api/exams/{$exam->id}/question-bank-release", [
            'enabled' => false,
            'topic_ids' => [],
        ])->assertOk();

        $this->assertDatabaseMissing('question_bank_topic_releases', ['exam_id' => $exam->id]);
        $this->assertDatabaseHas('question_bank_topic_releases', [
            'course_id' => $this->course->id,
            'subject_topic_id' => $this->algebra->id,
            'origin' => QuestionBankTopicRelease::ORIGIN_MANUAL,
        ]);

        $this->actAsStudent($student);
        $this->getJson('/api/aluno/practice/filters')->assertOk()->assertJsonPath('body.total', 1);
    }

    public function test_changing_exam_courses_moves_the_release(): void
    {
        $exam = Exam::create(['tenant_id' => $this->tenant->id, 'title' => 'Simulado']);
        $exam->courses()->attach($this->course->id);
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $exam->id, 'type' => 'essay',
            'question_text' => 'Oficial', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
        $question->topics()->sync([$this->algebra->id]);
        $this->putJson("/api/exams/{$exam->id}/question-bank-release", [
            'enabled' => true,
            'topic_ids' => [$this->algebra->id],
        ])->assertOk();

        $enem = Course::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'ENEM']);
        $this->putJson("/api/exams/{$exam->id}", [
            'title' => 'Simulado',
            'course_ids' => [$enem->id],
        ])->assertOk();

        $this->assertDatabaseMissing('question_bank_topic_releases', ['exam_id' => $exam->id, 'course_id' => $this->course->id]);
        $this->assertDatabaseHas('question_bank_topic_releases', ['exam_id' => $exam->id, 'course_id' => $enem->id, 'subject_topic_id' => $this->algebra->id]);
    }

    private function bankQuestion(string $text, array $topicIds): ExamQuestion
    {
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => null, 'type' => 'multiple_choice',
            'question_text' => $text, 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
        $question->options()->createMany([
            ['option_text' => 'Certa', 'is_correct' => true, 'order' => 1],
            ['option_text' => 'Errada', 'is_correct' => false, 'order' => 2],
        ]);
        $question->topics()->sync($topicIds);

        return $this->approveQuestionForPractice($question->load('options'));
    }

    private function correct(ExamQuestion $question): int
    {
        return $question->options->firstWhere('is_correct', true)->id;
    }

    private function enroll(string $className, int $year): Student
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']);
        $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'user_id' => $user->id, 'status' => 'active']);
        $class = SchoolClass::factory()->create([
            'tenant_id' => $this->tenant->id,
            'course_id' => $this->course->id,
            'name' => $className,
            'year' => $year,
        ]);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id,
            'school_class_id' => $class->id,
            'subject_id' => $this->math->id,
        ]);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id,
            'student_id' => $student->id,
            'school_class_id' => $class->id,
            'start_date' => now()->subMonth()->toDateString(),
            'end_date' => null,
            'status' => 'active',
        ]);

        return $student;
    }

    private function actAsStudent(Student $student): void
    {
        Sanctum::actingAs($student->user);
    }
}
