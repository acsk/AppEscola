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
 * Cenário (período 01/09–31/10/2026):
 * - Ana (CPM A): online 40% → 60% (+20 p.p.), presencial 70%, banco 3/5 na 1ª tentativa.
 * - Bruno (CPM A): online 80% → 50% (−30 p.p.), falta na presencial.
 * - Caio (CPM A): sem avaliações, frequência 2/4.
 * - Duda (CPM B): online 90%.
 */
class BiOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const PERIOD = '/api/bi/overview?from=2026-09-01&to=2026-10-31';

    private Tenant $tenant;

    private SchoolClass $classA;

    private SchoolClass $classB;

    private Subject $math;

    /** @var array<string, Student> */
    private array $students = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->classA = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM A']);
        $this->classB = SchoolClass::factory()->create(['tenant_id' => $this->tenant->id, 'course_id' => $course->id, 'name' => 'CPM B']);
        $this->math = Subject::create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática', 'status' => 'active']);

        foreach (['ana' => $this->classA, 'bruno' => $this->classA, 'caio' => $this->classA, 'duda' => $this->classB] as $name => $class) {
            $this->students[$name] = $this->enrolled(ucfirst($name), $class);
        }

        [$e1, $e1Questions] = $this->exam('Simulado 1');
        [$e2] = $this->exam('Simulado 2');
        $anaFirst = $this->attempt('ana', $e1, 40, '2026-09-10 12:00:00');
        $this->attempt('ana', $e1, 100, '2026-09-12 12:00:00'); // retentativa: não conta
        $this->attempt('ana', $e2, 60, '2026-10-20 12:00:00');
        $this->attempt('bruno', $e1, 80, '2026-09-10 12:00:00');
        $this->attempt('bruno', $e2, 50, '2026-10-20 12:00:00');
        $this->attempt('duda', $e1, 90, '2026-09-11 12:00:00');
        $this->answer($anaFirst, $e1Questions[0], true);
        $this->answer($anaFirst, $e1Questions[1], false);

        $assessment = DB::table('official_assessments')->insertGetId([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id, 'title' => 'Bimestral',
            'kind' => 'presencial_bimestral', 'assessment_date' => '2026-10-05', 'max_score' => 10, 'weight' => 1,
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->grade($assessment, 'ana', 7, false);
        $this->grade($assessment, 'bruno', null, true);

        $topic = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $this->math->id, 'name' => 'Frações']);
        foreach ([true, true, true, false, false] as $i => $correct) {
            $question = $this->question(null, $topic);
            $this->practice('ana', $question, $correct, '2026-09-15 12:00:00');
            if ($i === 3) {
                $this->practice('ana', $question, true, '2026-09-20 12:00:00'); // retentativa: não conta
            }
        }

        foreach (['2026-10-01' => 'present', '2026-10-02' => 'absent', '2026-10-03' => 'late', '2026-10-04' => 'absent'] as $date => $status) {
            DB::table('student_attendances')->insert([
                'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classA->id, 'student_id' => $this->students['caio']->id,
                'attendance_date' => $date, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        // Outra escola não pode aparecer.
        $other = Tenant::factory()->create();
        $otherCourse = Course::factory()->create(['tenant_id' => $other->id]);
        $otherClass = SchoolClass::factory()->create(['tenant_id' => $other->id, 'course_id' => $otherCourse->id]);
        $otherStudent = Student::factory()->create(['tenant_id' => $other->id, 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $other->id, 'student_id' => $otherStudent->id, 'school_class_id' => $otherClass->id,
            'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
        ]);
    }

    private function metric(array $body, string $key): array
    {
        return collect($body['metrics'])->firstWhere('key', $key);
    }

    public function test_admin_overview_matches_the_scenario(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
        $body = $this->getJson(self::PERIOD)->assertOk()->json('body');

        $this->assertSame(4.0, (float) $this->metric($body, 'students.active')['value']);

        $avg = $this->metric($body, 'assessments.avg_pct');
        $this->assertSame(65.0, (float) $avg['value']); // (40+60+80+50+90+70)/6
        $this->assertSame(6, $avg['sample']['results']);
        $this->assertSame('pp', $avg['delta_unit'] ?? 'pp');

        $practice = $this->metric($body, 'practice.first_accuracy');
        $this->assertSame(60.0, (float) $practice['value']);
        $this->assertSame(5, $practice['sample']['answers']);

        $this->assertSame(50.0, (float) $this->metric($body, 'attendance.rate')['value']);

        // Amostra pequena: valor ausente, nunca zero.
        $participation = $this->metric($body, 'exams.participation');
        $this->assertNull($participation['value']);
        $this->assertFalse($participation['sufficient']);
        $this->assertSame(3, $participation['sample']['students']);

        $improving = $this->metric($body, 'students.improving');
        $this->assertNull($improving['value']);
        $this->assertSame(1, $improving['sample']['students']);
        $this->assertSame(2, $improving['sample']['with_sample']);

        $this->assertSame(3.0, (float) $this->metric($body, 'students.needs_support')['value']);
        $support = $body['needs_support'];
        $this->assertSame(3, $support['total']);
        $this->assertSame('BRUNO', $support['items'][0]['name']);
        $this->assertEqualsCanonicalizing(['below_goal', 'declining'], array_column($support['items'][0]['reasons'], 'code'));
        $this->assertSame(['CPM A'], $support['items'][0]['classes']);
        $codes = collect($support['items'])->mapWithKeys(fn ($i) => [$i['name'] => array_column($i['reasons'], 'code')]);
        $this->assertSame(['low_attendance'], $codes['CAIO']);
        $this->assertSame(['below_goal'], $codes['ANA']);

        $months = collect($body['monthly'])->keyBy('month');
        $this->assertSame(70.0, (float) $months['2026-09']['online']['value']);
        $this->assertSame(3, $months['2026-09']['online']['students']);
        $this->assertNull($months['2026-09']['presencial']['value']);
        $this->assertSame(55.0, (float) $months['2026-10']['online']['value']);
        $this->assertSame(70.0, (float) $months['2026-10']['presencial']['value']);
    }

    public function test_subject_difficulty_combines_online_and_practice_first_attempts(): void
    {
        $catalog = config('bi_metrics');
        $catalog['subjects.difficulty_rank']['min_sample'] = 2;
        config()->set('bi_metrics', $catalog);
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));

        $subjects = $this->getJson(self::PERIOD)->assertOk()->json('body.subjects_difficulty');

        $this->assertCount(1, $subjects);
        $this->assertSame('MATEMÁTICA', $subjects[0]['name']);
        $this->assertSame(7, $subjects[0]['answers']); // 5 do banco + 2 do simulado
        $this->assertSame(57.1, (float) $subjects[0]['accuracy']);
        $this->assertSame('Frações', $subjects[0]['critical_topic']['name']);
        $this->assertSame(60.0, (float) $subjects[0]['critical_topic']['accuracy']);
    }

    public function test_teacher_only_sees_their_class(): void
    {
        $teacher = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'professor']);
        ClassSchedule::factory()->create([
            'tenant_id' => $this->tenant->id, 'school_class_id' => $this->classB->id,
            'subject_id' => $this->math->id, 'teacher_id' => $teacher->id,
        ]);
        Sanctum::actingAs($teacher);

        $body = $this->getJson(self::PERIOD)->assertOk()->json('body');

        $this->assertSame(1.0, (float) $this->metric($body, 'students.active')['value']);
        $this->assertSame(1, $this->metric($body, 'assessments.avg_pct')['sample']['results']);
        $this->assertSame(0, $body['needs_support']['total']);
        $this->getJson(self::PERIOD.'&school_class_id='.$this->classA->id)->assertForbidden();
    }

    public function test_modality_and_class_filters_narrow_the_results(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'coordenador']));

        $presencial = $this->getJson(self::PERIOD.'&modality=presencial')->assertOk()->json('body');
        $this->assertSame(1, $this->metric($presencial, 'assessments.avg_pct')['sample']['results']);

        $classB = $this->getJson(self::PERIOD.'&school_class_id='.$this->classB->id)->assertOk()->json('body');
        $this->assertSame(1.0, (float) $this->metric($classB, 'students.active')['value']);
    }

    public function test_filters_are_validated_against_the_tenant(): void
    {
        $other = Tenant::factory()->create();
        $foreignClass = SchoolClass::factory()->create([
            'tenant_id' => $other->id, 'course_id' => Course::factory()->create(['tenant_id' => $other->id])->id,
        ]);
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));

        $this->getJson(self::PERIOD.'&school_class_id='.$foreignClass->id)->assertStatus(422);
        $this->getJson('/api/bi/overview?from=2026-10-31&to=2026-09-01')->assertStatus(422);
    }

    private function enrolled(string $name, SchoolClass $class): Student
    {
        $student = Student::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name, 'status' => 'active']);
        Enrollment::factory()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $student->id, 'school_class_id' => $class->id,
            'start_date' => '2026-01-01', 'end_date' => null, 'status' => 'active',
        ]);

        return $student;
    }

    /** @return array{0: int, 1: list<ExamQuestion>} */
    private function exam(string $title): array
    {
        $examId = DB::table('exams')->insertGetId([
            'tenant_id' => $this->tenant->id, 'title' => $title, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return [$examId, [$this->question($examId), $this->question($examId)]];
    }

    private function question(?int $examId, ?SubjectTopic $topic = null): ExamQuestion
    {
        $question = ExamQuestion::create([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'type' => 'multiple_choice',
            'question_text' => 'Questão', 'subject_id' => $this->math->id, 'points' => 1, 'order' => 1,
        ]);
        if ($topic) {
            $question->topics()->sync([$topic->id]);
        }

        return $question;
    }

    private function attempt(string $student, int $examId, float $pct, string $finishedAt): int
    {
        return DB::table('exam_attempts')->insertGetId([
            'tenant_id' => $this->tenant->id, 'exam_id' => $examId, 'student_id' => $this->students[$student]->id,
            'attempt_status_id' => DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id'),
            'started_at' => $finishedAt, 'finished_at' => $finishedAt,
            'score' => $pct / 10, 'max_score' => 10, 'percentage' => $pct,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function answer(int $attemptId, ExamQuestion $question, bool $correct): void
    {
        DB::table('exam_answers')->insert([
            'attempt_id' => $attemptId, 'question_id' => $question->id, 'is_correct' => $correct,
            'points_earned' => $correct ? 1 : 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function grade(int $assessmentId, string $student, ?float $grade, bool $absent): void
    {
        DB::table('official_assessment_grades')->insert([
            'tenant_id' => $this->tenant->id, 'official_assessment_id' => $assessmentId,
            'student_id' => $this->students[$student]->id, 'subject_id' => $this->math->id,
            'grade' => $grade, 'is_absent' => $absent, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function practice(string $student, ExamQuestion $question, bool $correct, string $at): void
    {
        PracticeAnswer::query()->create([
            'tenant_id' => $this->tenant->id, 'student_id' => $this->students[$student]->id,
            'exam_question_id' => $question->id, 'is_correct' => $correct, 'answered_at' => $at,
        ]);
    }
}
