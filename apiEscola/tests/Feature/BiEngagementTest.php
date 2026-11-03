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
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (07/09–20/09/2026 = 2 semanas; dedicação de referência 3 dias/semana):
 * - Ana (CPM A): presente 08–11/09 e banco em 15/09 → 5 dias (2,5/sem.); frequência 100%.
 * - Bruno (CPM A): presente 08/09, falta 09–11/09 → 1 dia (0,5/sem.); frequência 25%.
 * - Duda (CPM B): usou o app em 16/09 → 0,5/sem.; sem chamadas.
 * Engajamento Ana = (0,4 × 100 + 0,3 × 83,3) ÷ 0,7 = 92,9; Bruno = (0,4 × 25 + 0,3 × 16,7) ÷ 0,7 = 21,4; Duda sem índice.
 */
class BiEngagementTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-07&to=2026-09-20';

    /** @var array<string, Student> */
    private array $students = [];

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        foreach (['ana' => $classA, 'bruno' => $classA, 'duda' => $classB] as $name => $class) {
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => ucfirst($name), 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            $this->students[$name] = $student;
        }

        $attendance = [
            'ana' => ['2026-09-08' => 'present', '2026-09-09' => 'present', '2026-09-10' => 'late', '2026-09-11' => 'present'],
            'bruno' => ['2026-09-08' => 'present', '2026-09-09' => 'absent', '2026-09-10' => 'absent', '2026-09-11' => 'absent'],
        ];
        foreach ($attendance as $name => $days) {
            foreach ($days as $date => $status) {
                DB::table('student_attendances')->insert([
                    'tenant_id' => $this->tenant->id, 'school_class_id' => $classA->id, 'student_id' => $this->students[$name]->id,
                    'attendance_date' => $date, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        $math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $q = ExamQuestion::create(['tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q', 'subject_id' => $math->id, 'points' => 1, 'order' => 1]);
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->students['ana']->id,
            'exam_question_id' => $q->id, 'is_correct' => true, 'answered_at' => '2026-09-15 15:00:00',
        ]);
        DB::table('student_activity_days')->insert([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->students['duda']->id, 'activity_date' => '2026-09-16',
            'first_seen_at' => '2026-09-16 13:00:00', 'last_seen_at' => '2026-09-16 13:00:00', 'touches' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function metric(array $body, string $key): array
    {
        return collect($body['metrics'])->firstWhere('key', $key);
    }

    public function test_attendance_activity_and_engagement_index(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $body = $this->getJson('/api/bi/engagement'.self::QUERY)->assertOk()->json('body');

        $this->assertSame(62.5, (float) $this->metric($body, 'attendance.rate')['value']);
        $this->assertSame(1.2, (float) $this->metric($body, 'engagement.active_days_week')['value']);
        $this->assertEqualsWithDelta(57.15, (float) $this->metric($body, 'engagement.index_avg')['value'], 0.06);
        $this->assertSame(2, $this->metric($body, 'engagement.index_avg')['sample']['students']);
        $this->assertSame(1.0, (float) $this->metric($body, 'students.low_attendance')['value']);

        $this->assertSame(['07/09', '14/09'], array_column($body['weekly'], 'label'));
        $this->assertSame(62.5, (float) $body['weekly'][0]['attendance']);
        $this->assertNull($body['weekly'][1]['attendance']); // sem chamadas: lacuna
        $this->assertSame([66.7, 66.7], array_map('floatval', array_column($body['weekly'], 'active_share')));

        $this->assertSame(['Sem registro' => 0, 'Menos de 1' => 2, '1 a 2' => 0, '2 a 3' => 1, '3 a 5' => 0, '5 ou mais' => 0], collect($body['distribution'])->pluck('count', 'label')->all());

        $classes = collect($body['classes'])->keyBy('name');
        $this->assertSame(62.5, (float) $classes['CPM A']['attendance']);
        $this->assertSame(1.5, (float) $classes['CPM A']['active_days_per_week']);
        $this->assertNull($classes['CPM B']['attendance']);
        $this->assertNull($classes['CPM B']['engagement']);

        $this->assertSame([$this->students['bruno']->id, $this->students['ana']->id], array_column($body['lowest']['items'], 'student_id'));
        $this->assertSame([21.4, 92.9], array_map('floatval', array_column($body['lowest']['items'], 'engagement')));
    }

    public function test_requires_advanced_plan(): void
    {
        TenantSetting::create(['tenant_id' => $this->tenant->id, 'module' => 'bi', 'key' => 'plan', 'value' => TenantSetting::wrapValue('basic')]);
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));

        $this->getJson('/api/bi/engagement'.self::QUERY)->assertForbidden()->assertJsonPath('body.code', 'bi_feature_disabled');
    }
}
