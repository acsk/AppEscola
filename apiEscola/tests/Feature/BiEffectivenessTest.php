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
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cenário (01/09–31/10/2026 × 02/07–31/08; amostras mínimas reduzidas para 2/1):
 * - CPM A, Matemática: Ana Frações 0/2 → 2/2, Porcentagem 2/2 → 1/2; Bruno Frações 1/2 → 1/2.
 *   Acerto 50% → 66,7% (+16,7 pp); Ana evoluiu (+25), Bruno estável → 50% dos comparáveis.
 *   Frações 25% → 75% (+50); Porcentagem 100% → 50% (−50). Notas presenciais da Ana: 60% → 80%.
 * - CPM B, Matemática: Duda Frações 2/2 só no período atual (sem comparação).
 */
class BiEffectivenessTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const QUERY = '?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classB;

    private Subject $math;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $catalog = config('bi_metrics');
        $catalog['subject.accuracy']['min_sample'] = 2;
        $catalog['topics.mastery']['min_sample'] = 2;
        $catalog['grades.avg']['min_sample'] = 1;
        config()->set('bi_metrics', $catalog);

        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);
        $fractions = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);
        $percent = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Porcentagem']);
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor', 'name' => 'Prof X']);
        ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $classA->id, 'subject_id' => $this->math->id, 'teacher_id' => $teacher->id]);

        foreach (['ana' => $classA, 'bruno' => $classA, 'duda' => $this->classB] as $name => $class) {
            $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => ucfirst($name), 'status' => 'active']);
            Enrollment::factory()->create([
                'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
                'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
            ]);
            $this->students[$name] = $student;
        }

        $answers = [
            ['ana', $fractions, [false, false], '2026-08-10'], ['ana', $percent, [true, true], '2026-08-10'],
            ['ana', $fractions, [true, true], '2026-09-15'], ['ana', $percent, [true, false], '2026-09-15'],
            ['bruno', $fractions, [true, false], '2026-08-10'], ['bruno', $fractions, [true, false], '2026-09-15'],
            ['duda', $fractions, [true, true], '2026-09-15'],
        ];
        foreach ($answers as [$name, $topic, $results, $day]) {
            foreach ($results as $correct) {
                $q = ExamQuestion::create(['tenant_id' => $this->tenant->id, 'type' => 'multiple_choice', 'question_text' => 'Q', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1]);
                $q->topics()->sync([$topic->id]);
                PracticeAnswer::query()->create([
                    'tenant_id' => $this->tenant->id, 'student_id' => $this->students[$name]->id,
                    'exam_question_id' => $q->id, 'is_correct' => $correct, 'answered_at' => $day.' 12:00:00',
                ]);
            }
        }

        foreach (['2026-08-20' => 6, '2026-10-05' => 8] as $date => $grade) {
            $oa = DB::table('official_assessments')->insertGetId([
                'tenant_id' => $this->tenant->id, 'school_class_id' => $classA->id, 'title' => 'Bimestral', 'kind' => 'presencial_bimestral',
                'assessment_date' => $date, 'max_score' => 10, 'weight' => 1, 'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('official_assessment_grades')->insert([
                'tenant_id' => $this->tenant->id, 'official_assessment_id' => $oa, 'student_id' => $this->students['ana']->id,
                'subject_id' => $this->math->id, 'grade' => $grade, 'is_absent' => false, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function test_class_subject_evolution(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $body = $this->getJson('/api/bi/effectiveness'.self::QUERY)->assertOk()->json('body');

        $this->assertSame(['pairs' => 2, 'comparable' => 1, 'improved' => 1, 'declined' => 0], $body['summary']);
        $a = collect($body['items'])->firstWhere('class', 'CPM A');
        $this->assertSame(['PROF X'], $a['teachers']);
        $this->assertSame(66.7, (float) $a['accuracy']['value']);
        $this->assertSame(50.0, (float) $a['accuracy']['previous']);
        $this->assertSame(16.7, (float) $a['accuracy']['delta']);
        $this->assertSame(80.0, (float) $a['grades']['value']);
        $this->assertSame(20.0, (float) $a['grades']['delta']);
        $this->assertEquals(['comparable' => 2, 'improved' => 1, 'declined' => 0, 'improved_pct' => 50], $a['students']);
        $this->assertSame(['Frações', 50.0], [$a['best_topic']['name'], (float) $a['best_topic']['delta_pp']]);
        $this->assertSame(['Porcentagem', -50.0], [$a['worst_topic']['name'], (float) $a['worst_topic']['delta_pp']]);

        $b = collect($body['items'])->firstWhere('class', 'CPM B');
        $this->assertSame(100.0, (float) $b['accuracy']['value']);
        $this->assertNull($b['accuracy']['delta']);
        $this->assertSame([], $b['teachers']);
    }

    public function test_teacher_sees_only_own_classes(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create(['tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id, 'subject_id' => $this->math->id, 'teacher_id' => $teacher->id]);
        Sanctum::actingAs($teacher);

        $items = $this->getJson('/api/bi/effectiveness'.self::QUERY)->assertOk()->json('body.items');
        $this->assertSame(['CPM B'], array_column($items, 'class'));
    }
}
