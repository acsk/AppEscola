<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\ExamQuestion;
use App\Models\PracticeAnswer;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Geração de bi_answer_facts: completa, incremental e respeitando a régua da 1ª tentativa. */
class BiAnswerFactsTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private Student $student;

    private Subject $math;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Carbon::setTestNow('2026-10-20 12:00:00');

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $class = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id]);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->student->id, 'school_class_id' => $class->id,
            'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function question(): ExamQuestion
    {
        return ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Questão',
            'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
    }

    private function answer(ExamQuestion $question, bool $correct, string $at, ?int $attemptId = null): void
    {
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->student->id, 'practice_attempt_id' => $attemptId,
            'exam_question_id' => $question->id, 'is_correct' => $correct, 'answered_at' => $at,
        ]);
    }

    private function facts(): array
    {
        return DB::table('bi_answer_facts')->orderBy('question_id')->get(['question_id', 'is_correct'])
            ->map(fn ($f) => [(int) $f->question_id, (bool) $f->is_correct])->all();
    }

    public function test_full_then_incremental_refresh_follows_the_first_attempt_rule(): void
    {
        $q1 = $this->question();
        $this->answer($q1, false, '2026-10-01 10:00:00');
        $this->answer($q1, true, '2026-10-02 10:00:00'); // retentativa: fica de fora

        $this->artisan('bi:refresh-facts')->assertSuccessful(); // 1ª execução é completa
        $this->assertSame([[$q1->id, false]], $this->facts());
        $this->assertNotNull(DB::table('bi_fact_refreshes')->where('tenant_id', $this->tenant->id)->value('full_refreshed_at'));

        // Nova questão respondida depois: entra no incremental.
        Carbon::setTestNow('2026-10-20 12:10:00');
        $q2 = $this->question();
        $this->answer($q2, true, '2026-10-20 12:05:00');
        // Sessão com correção no fim, ainda aberta: a resposta não conta.
        $q3 = $this->question();
        $session = DB::table('practice_attempts')->insertGetId([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->student->id, 'question_count' => 1,
            'correction_mode' => 'end', 'started_at' => '2026-10-20 12:06:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->answer($q3, false, '2026-10-20 12:06:00', $session);

        $this->artisan('bi:refresh-facts')->assertSuccessful();
        $this->assertSame([[$q1->id, false], [$q2->id, true]], $this->facts());

        // A sessão termina: a resposta passa a contar no próximo incremental.
        Carbon::setTestNow('2026-10-20 12:20:00');
        DB::table('practice_attempts')->where('id', $session)->update(['finished_at' => '2026-10-20 12:15:00']);
        $this->artisan('bi:refresh-facts')->assertSuccessful();
        $this->assertSame([[$q1->id, false], [$q2->id, true], [$q3->id, false]], $this->facts());
    }

    public function test_disabled_tenant_is_skipped_and_screens_fall_back_to_live(): void
    {
        $q1 = $this->question();
        $this->answer($q1, true, '2026-10-01 10:00:00');
        TenantSetting::create(['tenant_id' => $this->tenant->id, 'module' => 'bi', 'key' => 'enabled', 'value' => TenantSetting::wrapValue(false)]);

        $this->artisan('bi:refresh-facts')->assertSuccessful();
        $this->assertSame(0, DB::table('bi_answer_facts')->count());

        // Sem fatos gerados, a tela calcula ao vivo.
        TenantSetting::query()->where('tenant_id', $this->tenant->id)->delete();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
        $this->getJson('/api/bi/subjects?from=2026-09-01&to=2026-10-31')
            ->assertOk()
            ->assertJsonPath('body.subjects.0.answers', 1);
    }
}
