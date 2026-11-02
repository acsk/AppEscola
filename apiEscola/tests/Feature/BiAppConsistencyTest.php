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
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Critério de aceite da Fase 1: o acerto do banco por aluno no BI é o mesmo que o app mostra
 * em aluno/learning/overview (1ª tentativa, só respostas que contam), ao vivo e via bi_answer_facts.
 */
class BiAppConsistencyTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    /** Período que cobre todo o histórico do cenário (o app não filtra período). */
    private const QUERY = '?from=2025-01-01&to=2026-10-31';

    public function test_practice_accuracy_matches_the_student_app(): void
    {
        $this->seed(DomainSeeder::class);
        $tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $tenant->id]);
        $class = SchoolClass::factory()->create(['tenant_id' => $tenant->id, 'course_id' => $course->id]);
        $math = Subject::create(['tenant_id' => $tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $studentUser = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'aluno']);
        $student = Student::factory()->create(['tenant_id' => $tenant->id, 'user_id' => $studentUser->id, 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
            'start_date' => '2025-01-01', 'end_date' => null, 'status' => 'active',
        ]);

        $question = fn () => ExamQuestion::create([
            'tenant_id' => $tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Questão',
            'subject_id' => $math->id, 'points' => 1, 'order' => 1,
        ]);
        $answer = fn (ExamQuestion $q, bool $correct, string $at, ?int $session = null) => PracticeAnswer::query()->create([
            'tenant_id' => $tenant->id, 'student_id' => $student->id, 'practice_attempt_id' => $session,
            'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => $at,
        ]);
        $session = fn (string $mode, ?string $finished) => DB::table('practice_attempts')->insertGetId([
            'tenant_id' => $tenant->id, 'student_id' => $student->id, 'question_count' => 5, 'correction_mode' => $mode,
            'started_at' => '2026-05-01 10:00:00', 'finished_at' => $finished, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Avulsas: 3 questões, uma errada e depois acertada (retentativa não conta).
        foreach ([true, true, false] as $correct) {
            $q = $question();
            $answer($q, $correct, '2025-06-10 10:00:00');
            if (! $correct) {
                $answer($q, true, '2025-06-11 10:00:00');
            }
        }
        // Sessão finalizada: conta.
        $finished = $session('end', '2026-05-01 11:00:00');
        foreach ([true, false] as $correct) {
            $answer($question(), $correct, '2026-05-01 10:30:00', $finished);
        }
        // Sessão com correção no fim ainda aberta: não conta.
        $open = $session('end', null);
        $answer($question(), true, '2026-05-02 10:00:00', $open);
        // Correção a cada questão, ainda aberta: conta (o gabarito já foi mostrado).
        $each = $session('each', null);
        $answer($question(), false, '2026-05-03 10:00:00', $each);

        Sanctum::actingAs($studentUser);
        $app = $this->getJson('/api/aluno/learning/overview')->assertOk()->json('body');
        $this->assertSame(6, $app['questions']);
        $this->assertSame(50.0, (float) $app['accuracy']); // 3 de 6

        Sanctum::actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']));
        $bi = fn () => $this->getJson('/api/bi/students'.self::QUERY)->assertOk()->json('body.items.0.practice');

        $live = $bi();
        $this->assertSame($app['questions'], $live['n']);
        $this->assertSame((float) $app['accuracy'], (float) $live['value']);

        $this->artisan('bi:refresh-facts', ['--full' => true])->assertSuccessful();
        Cache::flush();
        $this->assertSame($live, $bi());
    }
}
