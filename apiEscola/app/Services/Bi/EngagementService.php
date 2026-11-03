<?php

namespace App\Services\Bi;

use App\Services\Bi\Diagnosis\DimensionCalculator;
use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Frequência e engajamento: frequência, dias ativos, índice de Engajamento (mesmo cálculo do Diagnóstico 360°),
 * série semanal, distribuição de dias ativos, turmas e alunos com menor engajamento.
 */
class EngagementService
{
    private const LOWEST_LIMIT = 15;

    /** Faixas de dias ativos por semana: [rótulo, mínimo inclusivo, máximo exclusivo]. */
    private const BUCKETS = [
        ['Sem registro', 0, 0.001],
        ['Menos de 1', 0.001, 1],
        ['1 a 2', 1, 2],
        ['2 a 3', 2, 3],
        ['3 a 5', 3, 5],
        ['5 ou mais', 5, 8],
    ];

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly DimensionCalculator $calculator,
        private readonly AttendanceRecords $attendance,
    ) {
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters): array
    {
        $key = 'bi:engagement:'.$scope->tenantId.':'.BiCriteria::signature().':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), fn () => $this->compute($scope, $filters));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters): array
    {
        $previousFilters = $filters->previous();
        $universe = new StudentUniverse($scope, $filters);
        $previousUniverse = new StudentUniverse($scope, $previousFilters);
        $now = $this->calculator->compute($universe, null)['students'];
        $before = $this->calculator->compute($previousUniverse, null)['students'];
        $attNow = $this->attendance->totals($universe);
        $attBefore = $this->attendance->totals($previousUniverse);
        $alertBelow = (float) config('bi.attendance_alert_below', 75);
        $minAttendance = (int) $this->catalog->definition('attendance.rate')['min_sample'];
        $lowNow = $this->lowAttendance($universe, $alertBelow, $minAttendance);
        $lowBefore = $this->lowAttendance($previousUniverse, $alertBelow, $minAttendance);

        $avg = fn (array $students, callable $pick) => ($values = array_values(array_filter(array_map($pick, $students), fn ($v) => $v !== null)))
            ? array_sum($values) / count($values)
            : null;
        $withIndex = fn (array $students) => count(array_filter($students, fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value'] !== null));

        $metrics = [
            $this->catalog->make(
                'attendance.rate',
                $attNow['records'] ? $attNow['present'] / $attNow['records'] * 100 : null,
                $attNow['records'],
                ['records' => $attNow['records'], 'students' => $attNow['students']],
                $attBefore['records'] ? $attBefore['present'] / $attBefore['records'] * 100 : null,
                $attBefore['records'],
            ),
            $this->catalog->make(
                'engagement.active_days_week',
                $avg($now, fn ($s) => $s['active_days_per_week']),
                count($now),
                ['students' => count($now)],
                $avg($before, fn ($s) => $s['active_days_per_week']),
                count($before),
            ),
            $this->catalog->make(
                'engagement.index_avg',
                $avg($now, fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value']),
                $withIndex($now),
                ['students' => $withIndex($now)],
                $avg($before, fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value']),
                $withIndex($before),
            ),
            $this->catalog->make('students.low_attendance', count($lowNow), count($now), ['alert_below' => $alertBelow], count($lowBefore), count($before)),
        ];

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                'filters' => $filters->toArray(),
                'dedication_days_per_week' => (float) config('bi.dedication_days_per_week', 3),
                'attendance_alert_below' => $alertBelow,
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'metrics' => $metrics,
            'weekly' => $this->weekly($universe, $minAttendance),
            'distribution' => $this->distribution($now),
            'classes' => $this->classes($universe, $now),
            'lowest' => $this->lowest($universe, $now),
        ];
    }

    /** Alunos com frequência abaixo do limite (com chamadas suficientes). @return list<int> */
    private function lowAttendance(StudentUniverse $universe, float $below, int $min): array
    {
        return $this->attendance->byStudent($universe)
            ->filter(fn ($r) => $r->records >= $min && $r->present / $r->records * 100 < $below)
            ->keys()
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** Por semana (segunda a domingo): frequência e % de alunos com alguma atividade. */
    private function weekly(StudentUniverse $universe, int $minRecords): array
    {
        $total = $universe->count();
        $weekOf = fn (string $date) => Carbon::parse($date)->startOfWeek(Carbon::MONDAY)->toDateString();

        $attendance = $this->attendance->query($universe)
            ->groupBy('sa.attendance_date')
            ->select('sa.attendance_date')
            ->selectRaw('COUNT(*) as records')
            ->selectRaw("SUM(CASE WHEN sa.status IN ('present', 'late') THEN 1 ELSE 0 END) as present")
            ->get()
            ->groupBy(fn ($r) => $weekOf(substr((string) $r->attendance_date, 0, 10)));
        $active = DB::query()->fromSub($this->calculator->activityDays($universe), 'd')
            ->select('d.student_id', 'd.day')
            ->get()
            ->groupBy(fn ($r) => $weekOf(substr((string) $r->day, 0, 10)));

        $weeks = [];
        $cursor = $universe->filters->from->copy()->startOfWeek(Carbon::MONDAY);
        while ($cursor->lte($universe->filters->to)) {
            $key = $cursor->toDateString();
            $att = $attendance->get($key, collect());
            $records = (int) $att->sum('records');
            $students = $active->get($key, collect())->pluck('student_id')->unique()->count();
            $weeks[] = [
                'week' => $key,
                'label' => $cursor->format('d/m'),
                'attendance' => $records >= $minRecords ? round($att->sum('present') / $records * 100, 1) : null,
                'attendance_records' => $records,
                'active_share' => $total ? round($students / $total * 100, 1) : null,
                'active_students' => $students,
            ];
            $cursor->addWeek();
        }

        return $weeks;
    }

    private function distribution(array $students): array
    {
        return array_map(fn (array $b) => [
            'label' => $b[0],
            'from' => $b[1],
            'to' => $b[2],
            'count' => count(array_filter($students, fn ($s) => $s['active_days_per_week'] >= $b[1] && $s['active_days_per_week'] < $b[2])),
        ], self::BUCKETS);
    }

    /** Por turma: frequência (chamadas da turma), média de dias ativos, participação e engajamento. */
    private function classes(StudentUniverse $universe, array $students): array
    {
        $members = $universe->classMemberships()->get()->groupBy('school_class_id');
        $attendance = $this->attendance->query($universe)
            ->groupBy('sa.school_class_id')
            ->select('sa.school_class_id')
            ->selectRaw('COUNT(*) as records')
            ->selectRaw("SUM(CASE WHEN sa.status IN ('present', 'late') THEN 1 ELSE 0 END) as present")
            ->get()
            ->keyBy('school_class_id');
        $minAttendance = (int) $this->catalog->definition('attendance.rate')['min_sample'];
        $mean = function (Collection $values): ?float {
            $known = $values->filter(fn ($v) => $v !== null);

            return $known->isEmpty() ? null : (float) $known->avg();
        };

        return $members->map(function (Collection $list, $classId) use ($students, $attendance, $minAttendance, $mean) {
            $rows = $list->map(fn ($m) => $students[(int) $m->student_id] ?? null)->filter();
            $att = $attendance->get($classId);
            $participation = $rows->map(fn ($s) => collect($s[DimensionCalculator::ENGAGEMENT]['components'])->firstWhere('key', 'participation')['value'] ?? null);
            $engagement = $rows->map(fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value']);

            return [
                'school_class_id' => (int) $classId,
                'name' => $list->first()->class_name,
                'students' => $rows->count(),
                'attendance' => $att && $att->records >= $minAttendance ? round($att->present / $att->records * 100, 1) : null,
                'active_days_per_week' => round((float) $rows->avg('active_days_per_week'), 1),
                'participation' => ($v = $mean($participation)) === null ? null : round($v, 1),
                'engagement' => ($v = $mean($engagement)) === null ? null : round($v, 1),
                'no_activity' => $rows->filter(fn ($s) => $s['active_days'] === 0)->count(),
            ];
        })->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }

    /** Alunos com menor índice de Engajamento (com índice) e quantos não têm nenhuma atividade registrada. */
    private function lowest(StudentUniverse $universe, array $students): array
    {
        $ranked = collect($students)
            ->filter(fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value'] !== null)
            ->sortBy(fn ($s) => $s[DimensionCalculator::ENGAGEMENT]['value'])
            ->take(self::LOWEST_LIMIT);
        $ids = $ranked->keys()->all();
        $names = DB::table('students')->whereIn('id', $ids ?: [0])->pluck('name', 'id');
        $classes = $universe->classNamesByStudent($ids);

        return [
            'no_activity' => count(array_filter($students, fn ($s) => $s['active_days'] === 0)),
            'items' => $ranked->map(fn ($s, $id) => [
                'student_id' => (int) $id,
                'name' => $names[$id] ?? 'Aluno',
                'classes' => $classes[$id] ?? [],
                'engagement' => $s[DimensionCalculator::ENGAGEMENT]['value'],
                'components' => collect($s[DimensionCalculator::ENGAGEMENT]['components'])->map(fn ($c) => [
                    'key' => $c['key'], 'label' => $c['label'], 'value' => $c['value'], 'raw' => $c['raw'], 'n' => $c['n'], 'sufficient' => $c['sufficient'],
                ])->all(),
            ])->values()->all(),
        ];
    }
}
