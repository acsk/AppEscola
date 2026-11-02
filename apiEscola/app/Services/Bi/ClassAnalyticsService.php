<?php

namespace App\Services\Bi;

use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\PracticeFirstAttempts;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Análise de turmas: comparação entre as turmas do recorte e a lista de alunos de uma turma.
 * Os indicadores da turma (cards, evolução mensal, disciplinas) vêm de /bi/overview com school_class_id.
 */
class ClassAnalyticsService
{
    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
        private readonly AttendanceRecords $attendance,
        private readonly StudentSignals $signals,
    ) {
    }

    /** @return array<string, mixed> */
    public function compare(BiAccessScope $scope, BiFilters $filters): array
    {
        return $this->remember('classes', $scope, $filters, function () use ($scope, $filters) {
            $previousFilters = $filters->previous();
            $now = $this->byClass(new StudentUniverse($scope, $filters));
            $before = $this->byClass(new StudentUniverse($scope, $previousFilters));

            $items = collect($now)->map(function (array $c, int $classId) use ($before) {
                $p = $before[$classId] ?? null;
                $make = fn (string $key, ?float $value, int $n, ?float $prev, ?int $prevN, array $sample = []) => $this->catalog->make($key, $value, $n, $sample, $prev, $prevN);

                return [
                    'school_class_id' => $classId,
                    'name' => $c['name'],
                    'course' => $c['course'],
                    'year' => $c['year'],
                    'metrics' => [
                        'students' => $make('students.active', $c['active'], $c['active'], $p['active'] ?? null, $p['active'] ?? null),
                        'avg_online' => $make('assessments.avg_online', $c['online']['avg'], $c['online']['n'], $p['online']['avg'] ?? null, $p['online']['n'] ?? null),
                        'avg_presencial' => $make('assessments.avg_presencial', $c['presencial']['avg'], $c['presencial']['n'], $p['presencial']['avg'] ?? null, $p['presencial']['n'] ?? null),
                        'practice' => $make('practice.first_accuracy', $this->pct($c['practice']['correct'], $c['practice']['answers']), $c['practice']['answers'], $p ? $this->pct($p['practice']['correct'], $p['practice']['answers']) : null, $p['practice']['answers'] ?? null),
                        'attendance' => $make('attendance.rate', $this->pct($c['attendance']['present'], $c['attendance']['records']), $c['attendance']['records'], $p ? $this->pct($p['attendance']['present'], $p['attendance']['records']) : null, $p['attendance']['records'] ?? null),
                        'participation' => $make('exams.participation', $this->pct($c['participants'], $c['active']), $c['active'], $p ? $this->pct($p['participants'], $p['active']) : null, $p['active'] ?? null, ['students' => $c['participants']]),
                        'needs_support' => $make('students.needs_support', $c['support'], $c['active'], $p['support'] ?? null, $p['active'] ?? null),
                    ],
                ];
            })->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                    'filters' => $filters->toArray(),
                    'scope' => ['role' => $scope->role, 'tenant_wide' => $scope->isTenantWide()],
                    'goal_pct' => (float) config('bi.goal_pct', 70),
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'items' => $items,
            ];
        });
    }

    /**
     * Turma com seus alunos: médias por modalidade, banco, frequência, evolução e motivos de atenção.
     *
     * @return array<string, mixed>
     */
    public function detail(BiAccessScope $scope, BiFilters $filters, int $schoolClassId): array
    {
        $filters = $filters->withSchoolClass($schoolClassId);

        return $this->remember('class', $scope, $filters, function () use ($scope, $filters, $schoolClassId) {
            $universe = new StudentUniverse($scope, $filters);
            $rows = $this->assessments->rows($universe);
            $evolution = $this->signals->evolution($rows);
            $reasons = $this->signals->supportReasons($universe, $rows, $evolution);
            $practice = $this->practice->byStudent($universe);
            $attendance = $this->attendance->byStudent($universe);
            $minResults = (int) config('bi.min_student_results', 2);
            $minPractice = (int) $this->catalog->definition('practice.first_accuracy')['min_sample'];
            $minAttendance = (int) $this->catalog->definition('attendance.rate')['min_sample'];

            $ids = DB::query()->fromSub($universe->query(), 'u')->pluck('student_id')->map(fn ($id) => (int) $id);
            $names = DB::table('students')->whereIn('id', $ids->all() ?: [0])->pluck('name', 'id');
            $byStudent = $rows->groupBy('student_id');

            $avg = function (?Collection $results, string $modality) use ($minResults) {
                $list = ($results ?? collect())->where('modality', $modality);

                return ['value' => $list->count() >= $minResults ? round((float) $list->avg('pct'), 1) : null, 'n' => $list->count()];
            };

            $students = $ids->map(function (int $id) use ($names, $byStudent, $avg, $practice, $attendance, $evolution, $reasons, $minPractice, $minAttendance) {
                $p = $practice->get($id);
                $a = $attendance->get($id);

                return [
                    'student_id' => $id,
                    'name' => $names[$id] ?? 'Aluno',
                    'online' => $avg($byStudent->get($id), AssessmentResults::ONLINE),
                    'presencial' => $avg($byStudent->get($id), AssessmentResults::PRESENCIAL),
                    'practice' => [
                        'value' => $p && $p->answers >= $minPractice ? round($p->correct / $p->answers * 100, 1) : null,
                        'n' => (int) ($p->answers ?? 0),
                    ],
                    'attendance' => [
                        'value' => $a && $a->records >= $minAttendance ? round($a->present / $a->records * 100, 1) : null,
                        'n' => (int) ($a->records ?? 0),
                    ],
                    'evolution_pp' => isset($evolution[$id]) ? round($evolution[$id], 1) : null,
                    'reasons' => $reasons[$id] ?? [],
                ];
            })
                ->sortBy([fn ($x, $y) => count($y['reasons']) <=> count($x['reasons']), fn ($x, $y) => strnatcasecmp($x['name'], $y['name'])])
                ->values();

            $class = DB::table('school_classes as sc')
                ->leftJoin('courses as c', 'c.id', '=', 'sc.course_id')
                ->where('sc.id', $schoolClassId)
                ->first(['sc.id', 'sc.name', 'sc.year', 'sc.status', 'c.name as course']);

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'goal_pct' => (float) config('bi.goal_pct', 70),
                    'min_student_results' => $minResults,
                    'min_practice_answers' => $minPractice,
                    'min_attendance_records' => $minAttendance,
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'school_class' => [
                    'id' => (int) $class->id,
                    'name' => $class->name,
                    'course' => $class->course,
                    'year' => $class->year,
                    'status' => $class->status,
                    'teachers' => $this->teachers($scope->tenantId, $schoolClassId),
                ],
                'students' => [
                    'total' => $students->count(),
                    'needs_support' => $students->filter(fn ($s) => $s['reasons'] !== [])->count(),
                    'items' => $students->all(),
                ],
            ];
        });
    }

    public function exists(BiAccessScope $scope, int $schoolClassId): bool
    {
        return DB::table('school_classes')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')->where('id', $schoolClassId)->exists();
    }

    /**
     * Totais por turma; aluno em duas turmas entra nas duas. Frequência usa as chamadas lançadas na própria turma.
     *
     * @return array<int, array<string, mixed>>
     */
    private function byClass(StudentUniverse $universe): array
    {
        $members = $universe->classMemberships()->get();
        if ($members->isEmpty()) {
            return [];
        }

        $all = $this->assessments->rows($universe);
        $rows = $all->groupBy('student_id');
        $practice = $this->practice->byStudent($universe);
        $support = $this->signals->supportReasons($universe, $all, $this->signals->evolution($all));
        $attendance = $this->attendance->query($universe)
            ->groupBy('sa.school_class_id')
            ->select('sa.school_class_id')
            ->selectRaw('COUNT(*) as records')
            ->selectRaw("SUM(CASE WHEN sa.status IN ('present', 'late') THEN 1 ELSE 0 END) as present")
            ->get()
            ->keyBy('school_class_id');
        $info = DB::table('school_classes as sc')
            ->leftJoin('courses as c', 'c.id', '=', 'sc.course_id')
            ->whereIn('sc.id', $members->pluck('school_class_id')->unique()->all())
            ->get(['sc.id', 'sc.year', 'c.name as course'])
            ->keyBy('id');

        return $members->groupBy('school_class_id')->map(function (Collection $list, $classId) use ($rows, $practice, $support, $attendance, $info) {
            $studentIds = $list->pluck('student_id')->map(fn ($id) => (int) $id)->unique();
            $results = $studentIds->flatMap(fn ($id) => $rows->get($id, collect()));
            $online = $results->where('modality', AssessmentResults::ONLINE);
            $presencial = $results->where('modality', AssessmentResults::PRESENCIAL);
            $att = $attendance->get($classId);

            return [
                'name' => $list->first()->class_name,
                'course' => $info[$classId]->course ?? null,
                'year' => $info[$classId]->year ?? null,
                'active' => $studentIds->count(),
                'participants' => $online->pluck('student_id')->unique()->count(),
                'online' => ['avg' => $online->isEmpty() ? null : (float) $online->avg('pct'), 'n' => $online->count()],
                'presencial' => ['avg' => $presencial->isEmpty() ? null : (float) $presencial->avg('pct'), 'n' => $presencial->count()],
                'practice' => [
                    'answers' => (int) $studentIds->sum(fn ($id) => $practice->get($id)->answers ?? 0),
                    'correct' => (int) $studentIds->sum(fn ($id) => $practice->get($id)->correct ?? 0),
                ],
                'attendance' => ['records' => (int) ($att->records ?? 0), 'present' => (int) ($att->present ?? 0)],
                'support' => $studentIds->filter(fn ($id) => isset($support[$id]))->count(),
            ];
        })->all();
    }

    /** @return list<string> */
    private function teachers(int $tenantId, int $schoolClassId): array
    {
        $viaPivot = DB::table('class_schedules as cs')
            ->join('class_schedule_user as csu', 'csu.class_schedule_id', '=', 'cs.id')
            ->where('cs.tenant_id', $tenantId)
            ->where('cs.school_class_id', $schoolClassId)
            ->whereNull('cs.deleted_at')
            ->select('csu.user_id as id');
        $legacy = DB::table('class_schedules')
            ->where('tenant_id', $tenantId)
            ->where('school_class_id', $schoolClassId)
            ->whereNull('deleted_at')
            ->whereNotNull('teacher_id')
            ->select('teacher_id as id');

        return DB::table('users')
            ->whereIn('id', DB::query()->fromSub($viaPivot->union($legacy), 't')->select('t.id'))
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->pluck('name')
            ->all();
    }

    private function pct(int|float $part, int|float $total): ?float
    {
        return $total > 0 ? $part / $total * 100 : null;
    }

    private function remember(string $name, BiAccessScope $scope, BiFilters $filters, callable $compute): array
    {
        $key = 'bi:'.$name.':'.$scope->tenantId.':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), $compute);
    }
}
