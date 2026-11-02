<?php

namespace App\Services\Bi;

use App\Models\OfficialAssessment;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Desempenho acadêmico (visão de boletim): notas das avaliações presenciais publicadas por disciplina
 * e turma, com faltas separadas da média.
 */
class AcademicPerformanceService
{
    private const MATRIX_CLASSES = 30;

    public function __construct(private readonly MetricCatalog $catalog)
    {
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters): array
    {
        $key = 'bi:performance:'.$scope->tenantId.':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), function () use ($scope, $filters) {
            $previousFilters = $filters->previous();
            $now = $this->grades(new StudentUniverse($scope, $filters));
            $before = $this->grades(new StudentUniverse($scope, $previousFilters));
            $goal = (float) config('bi.goal_pct', 70);
            $minSample = (int) $this->catalog->definition('grades.avg')['min_sample'];

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                    'filters' => $filters->toArray(),
                    'scope' => ['role' => $scope->role, 'tenant_wide' => $scope->isTenantWide()],
                    'goal_pct' => $goal,
                    'min_sample' => $minSample,
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'metrics' => $this->metrics($now, $before, $goal),
                'subjects' => $this->bySubject($now, $before, $goal, $minSample),
                'matrix' => $this->matrix($now, $goal, $minSample),
            ];
        });
    }

    /**
     * Lançamentos (aluno × disciplina × avaliação) no recorte. pct = null quando falta ou sem nota.
     *
     * @return Collection<int, object{student_id: int, subject_id: int, subject: string, school_class_id: int|null, class_name: string|null, absent: bool, pct: float|null}>
     */
    private function grades(StudentUniverse $universe): Collection
    {
        $filters = $universe->filters;
        $classIds = $universe->classIds();

        return DB::table('official_assessment_grades as g')
            ->join('official_assessments as oa', 'oa.id', '=', 'g.official_assessment_id')
            ->join('subjects as s', 's.id', '=', 'g.subject_id')
            ->leftJoin('school_classes as sc', 'sc.id', '=', 'oa.school_class_id')
            ->where('oa.tenant_id', $universe->scope->tenantId)
            ->where('oa.status', OfficialAssessment::STATUS_PUBLISHED)
            ->whereNull('oa.deleted_at')
            ->where('oa.max_score', '>', 0)
            ->whereBetween('oa.assessment_date', $filters->dateRange())
            ->where(fn ($q) => $q->where('g.is_absent', true)->orWhereNotNull('g.grade'))
            ->whereIn('g.student_id', $universe->query())
            ->when($classIds !== null, fn ($q) => $q->whereIn('oa.school_class_id', $classIds ?: [0]))
            ->when($filters->subjectId !== null, fn ($q) => $q->where('g.subject_id', $filters->subjectId))
            ->when($filters->examTypeId !== null, fn ($q) => $q->where('oa.exam_type_id', $filters->examTypeId))
            ->get(['g.student_id', 'g.subject_id', 's.name as subject', 'oa.school_class_id', 'sc.name as class_name', 'g.is_absent', 'g.grade', 'oa.max_score'])
            ->map(fn ($r) => (object) [
                'student_id' => (int) $r->student_id,
                'subject_id' => (int) $r->subject_id,
                'subject' => $r->subject,
                'school_class_id' => $r->school_class_id !== null ? (int) $r->school_class_id : null,
                'class_name' => $r->class_name,
                'absent' => (bool) $r->is_absent,
                'pct' => $r->is_absent ? null : (float) $r->grade / (float) $r->max_score * 100,
            ]);
    }

    private function metrics(Collection $now, Collection $before, float $goal): array
    {
        $graded = fn (Collection $rows) => $rows->whereNotNull('pct');
        $atGoal = fn (Collection $rows) => $this->pct($graded($rows)->filter(fn ($r) => $r->pct >= $goal)->count(), $graded($rows)->count());

        return [
            $this->catalog->make(
                'grades.avg',
                $graded($now)->isEmpty() ? null : (float) $graded($now)->avg('pct'),
                $graded($now)->count(),
                ['grades' => $graded($now)->count(), 'students' => $graded($now)->pluck('student_id')->unique()->count()],
                $graded($before)->isEmpty() ? null : (float) $graded($before)->avg('pct'),
                $graded($before)->count(),
            ),
            $this->catalog->make('grades.at_goal_share', $atGoal($now), $graded($now)->count(), [], $atGoal($before), $graded($before)->count()),
            $this->catalog->make(
                'grades.absence_rate',
                $this->pct($now->where('absent', true)->count(), $now->count()),
                $now->count(),
                ['absences' => $now->where('absent', true)->count(), 'records' => $now->count()],
                $this->pct($before->where('absent', true)->count(), $before->count()),
                $before->count(),
            ),
        ];
    }

    /** Uma linha por disciplina, da menor média para a maior; sem amostra mínima vai para o fim. */
    private function bySubject(Collection $now, Collection $before, float $goal, int $minSample): array
    {
        $previous = $before->whereNotNull('pct')->groupBy('subject_id');

        return $now->groupBy('subject_id')->map(function (Collection $rows, $subjectId) use ($previous, $goal, $minSample) {
            $graded = $rows->whereNotNull('pct');
            $avg = $graded->count() >= $minSample ? round((float) $graded->avg('pct'), 1) : null;
            $prior = $previous->get($subjectId);
            $priorAvg = $prior && $prior->count() >= $minSample ? round((float) $prior->avg('pct'), 1) : null;

            return [
                'subject_id' => (int) $subjectId,
                'name' => $rows->first()->subject,
                'grades' => $graded->count(),
                'students' => $graded->pluck('student_id')->unique()->count(),
                'avg' => $avg,
                'below_goal' => $avg !== null && $avg < $goal,
                'at_goal_pct' => $graded->count() >= $minSample ? round($graded->filter(fn ($r) => $r->pct >= $goal)->count() / $graded->count() * 100, 1) : null,
                'absences' => $rows->where('absent', true)->count(),
                'absence_rate' => round($rows->where('absent', true)->count() / $rows->count() * 100, 1),
                'previous' => $priorAvg,
                'delta_pp' => $avg !== null && $priorAvg !== null ? round($avg - $priorAvg, 1) : null,
            ];
        })
            ->sortBy(fn ($s) => $s['avg'] ?? 1000)
            ->values()
            ->all();
    }

    /** Turmas × disciplinas (mesmo formato do mapa de calor de Disciplinas e assuntos). */
    private function matrix(Collection $rows, float $goal, int $minSample): array
    {
        $graded = $rows->whereNotNull('pct')->whereNotNull('school_class_id');
        $subjects = $graded->groupBy('subject_id')
            ->map(fn (Collection $list, $id) => ['topic_id' => (int) $id, 'name' => $list->first()->subject, 'n' => $list->count()])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        $classes = $graded->groupBy('school_class_id')
            ->map(function (Collection $list, $classId) use ($subjects, $goal, $minSample) {
                $bySubject = $list->groupBy('subject_id');

                return [
                    'school_class_id' => (int) $classId,
                    'name' => $list->first()->class_name,
                    'answers' => $list->count(),
                    'cells' => $subjects->map(function ($s) use ($bySubject, $goal, $minSample) {
                        $cell = $bySubject->get($s['topic_id'], collect());
                        $value = $cell->count() >= $minSample ? round((float) $cell->avg('pct'), 1) : null;

                        return ['topic_id' => $s['topic_id'], 'value' => $value, 'answers' => $cell->count(), 'below_goal' => $value !== null && $value < $goal];
                    })->all(),
                ];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        return [
            'topics' => $subjects->map(fn ($s) => ['topic_id' => $s['topic_id'], 'name' => $s['name']])->all(),
            'rows' => $classes->take(self::MATRIX_CLASSES)->all(),
            'truncated' => $classes->count() > self::MATRIX_CLASSES,
        ];
    }

    private function pct(int|float $part, int|float $total): ?float
    {
        return $total > 0 ? $part / $total * 100 : null;
    }
}
