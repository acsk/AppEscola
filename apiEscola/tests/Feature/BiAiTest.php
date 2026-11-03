<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
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
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiAiTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private Student $student;

    private SchoolClass $classB;

    private Subject $math;

    private User $coord;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $this->student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Fulana Teste', 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->student->id, 'school_class_id' => $classA->id,
            'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
        ]);
        foreach ([40, 60] as $i => $pct) {
            $exam = DB::table('exams')->insertGetId(['tenant_id' => $this->tenant->id, 'title' => 'S'.$i, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('exam_attempts')->insert([
                'tenant_id' => $this->tenant->id, 'exam_id' => $exam, 'student_id' => $this->student->id,
                'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
                'started_at' => '2026-09-1'.$i.' 12:00:00', 'finished_at' => '2026-09-1'.$i.' 12:00:00',
                'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        foreach ([true, true, true, true, false] as $correct) {
            $q = ExamQuestion::create(['tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1]);
            PracticeAnswer::query()->create(['tenant_id' => $this->tenant->id, 'student_id' => $this->student->id, 'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => '2026-09-15 12:00:00']);
        }

        $this->coord = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']);
    }

    /** Resposta simulada do provedor; trocar o payload vale para as chamadas seguintes. */
    private array $aiPayload = [];

    private function fakeAi(array $payload): void
    {
        $this->aiPayload = $payload;
        Http::fake(['*/chat/completions' => fn () => Http::response(['choices' => [['message' => ['content' => json_encode($this->aiPayload)]]]], 200)]);
    }

    public function test_coordination_enables_ai_and_drafts_are_pseudonymized_and_validated(): void
    {
        Sanctum::actingAs($this->coord);
        $this->getJson('/api/bi/ai/status')->assertOk()->assertJsonPath('body.reason', 'no_key');
        $this->putJson('/api/bi/criteria', ['ai_enabled' => true])->assertStatus(422)->assertJsonPath('body.code', 'bi_ai_unavailable');

        $this->putJson('/api/ai-settings/openrouter', ['api_key' => 'sk-or-tenant-0000000000000000'])->assertOk();
        $this->putJson('/api/bi/criteria', ['ai_enabled' => true])->assertOk()->assertJsonPath('body.ai.enabled', true);

        $this->fakeAi(['paragraphs' => [
            ['text' => 'O aluno tem aproveitamento de 50% nas avaliações e 999 algo inventado.', 'evidence' => ['aprendizagem.assessments', 'chave_inventada']],
        ]]);
        $draft = $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=diagnosis&student_id='.$this->student->id)->assertCreated()->json('body');

        $this->assertSame('draft', $draft['status']);
        $this->assertSame(['aprendizagem.assessments'], $draft['content']['paragraphs'][0]['evidence']);
        $this->assertSame(['999'], $draft['unverified']); // 50 está nos fatos; 999 não
        Http::assertSent(fn (HttpRequest $r) => ! str_contains(mb_strtoupper($r->body()), 'FULANA') && ! str_contains($r->body(), '"student_id"'));

        $this->putJson("/api/bi/ai/drafts/{$draft['id']}", ['text' => 'Texto revisado pela coordenação.'])->assertOk()->assertJsonPath('body.status', 'draft');
        $this->putJson("/api/bi/ai/drafts/{$draft['id']}", ['status' => 'validated'])->assertOk()
            ->assertJsonPath('body.status', 'validated')
            ->assertJsonPath('body.edited_text', 'Texto revisado pela coordenação.');
        $this->getJson('/api/bi/ai/drafts/latest'.self::QUERY.'&kind=diagnosis&student_id='.$this->student->id)
            ->assertOk()->assertJsonPath('body.draft.id', $draft['id']);

        $this->fakeAi(['insights' => [['title' => 'Matemática em atenção', 'text' => 'A turma CPM A precisa de reforço.', 'area' => 'inexistente', 'evidence' => []]]]);
        $insights = $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=school_insights')->assertCreated()->json('body.content.insights');
        $this->assertSame('geral', $insights[0]['area']);

        $this->putJson('/api/bi/criteria', ['ai_enabled' => false])->assertOk();
        $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=school_insights')->assertForbidden()->assertJsonPath('body.code', 'bi_ai_disabled');
    }

    public function test_teacher_scope_and_invalid_response(): void
    {
        Sanctum::actingAs($this->coord);
        $this->putJson('/api/ai-settings/openrouter', ['api_key' => 'sk-or-tenant-0000000000000000'])->assertOk();
        $this->putJson('/api/bi/criteria', ['ai_enabled' => true])->assertOk();

        $this->fakeAi(['nada' => true]);
        $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=diagnosis&student_id='.$this->student->id)
            ->assertStatus(502)
            ->assertJsonPath('body.code', 'ai_invalid_response');

        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id, 'subject_id' => $this->math->id, 'teacher_id' => $teacher->id]);
        Sanctum::actingAs($teacher);
        $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=school_insights')->assertForbidden();
        $this->postJson('/api/bi/ai/drafts'.self::QUERY.'&kind=diagnosis&student_id='.$this->student->id)->assertForbidden();
    }
}
