<?php

namespace App\Services\Bi;

use App\Models\ExamType;
use App\Models\OfficialAssessment;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Análise de simulados: indicadores do período, evolução mensal, lista de avaliações (online e presencial
 * separados) e o detalhe de uma avaliação (distribuição de notas, turmas, disciplinas, assuntos e alunos).
 */
class AssessmentAnalyticsService
{
    private const LIST_LIMIT = 100;

    private const STUDENTS_LIMIT = 100;

    private const TOPICS_LIMIT = 10;

    private const TOPIC_MIN_ANSWERS = 5;

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
    ) {
    }

    /** @return array<string, mixed> */
    public function overview(BiAccessScope $scope, BiFilters $filters): array
    {
        return $this->remember('assessments', $scope, $filters, [], function () use ($scope, $filters) {
            $previousFilters = $filters->previous();
            $current = new StudentUniverse($scope, $filters);
            $previous = new StudentUniverse($scope, $previousFilters);

            $now = $this->snapshot($current);
            $before = $this->snapshot($previous);
            $goal = (float) config('bi.goal_pct', 70);

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                    'filters' => $filters->toArray(),
                    'scope' => ['role' => $scope->role, 'tenant_wide' => $scope->isTenantWide()],
                    'goal_pct' => $goal,
                    'min_sample' => (int) $this->catalog->definition('assessments.avg_online')['min_sample'],
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'metrics' => [
                    $this->catalog->make('assessments.count', $now['count'], $now['count'], [], $before['count'], $before['count']),
                    $this->catalog->make(
                        'exams.participation',
                        $this->pct($now['participants'], $now['active']),
                        $now['active'],
                        ['students' => $now['participants']],
                        $this->pct($before['participants'], $before['active']),
                        $before['active'],
                    ),
                    $this->modalityMetric('assessments.avg_online', AssessmentResults::ONLINE, $now['rows'], $before['rows']),
                    $this->modalityMetric('assessments.avg_presencial', AssessmentResults::PRESENCIAL, $now['rows'], $before['rows']),
                    $this->catalog->make(
                        'assessments.below_goal_share',
                        $this->pct($now['rows']->where('pct', '<', $goal)->count(), $now['rows']->count()),
                        $now['rows']->count(),
                        ['results' => $now['rows']->count(), 'below' => $now['rows']->where('pct', '<', $goal)->count()],
                        $this->pct($before['rows']->where('pct', '<', $goal)->count(), $before['rows']->count()),
                        $before['rows']->count(),
                    ),
                ],
                'monthly' => $this->assessments->monthly($now['rows'], $filters),
                'items' => $this->items($current, $now['rows'], $goal),
            ];
        });
    }

    /**
     * Detalhe de uma avaliação no recorte (período e turmas do usuário).
     *
     * @return array<string, mixed>
     */
    public function detail(BiAccessScope $scope, BiFilters $filters, string $modality, int $assessmentId): array
    {
        return $this->remember('assessment', $scope, $filters, [$modality, $assessmentId], function () use ($scope, $filters, $modality, $assessmentId) {
            $universe = new StudentUniverse($scope, $filters);
            $rows = $this->assessments->rows($universe, $this->onlyModality($filters, $modality))
                ->where('assessment_id', $assessmentId)
                ->values();
            $goal = (float) config('bi.goal_pct', 70);
            $minSample = (int) $this->catalog->definition('assessments.avg_online')['min_sample'];
            $values = $rows->pluck('pct')->sort()->values();
            $absent = $modality === AssessmentResults::PRESENCIAL ? $this->absentCount($universe, $assessmentId) : null;
            $studentIds = $rows->pluck('student_id')->all();
            $classes = $universe->classNamesByStudent($studentIds);
            $names = DB::table('students')->whereIn('id', $studentIds ?: [0])->pluck('name', 'id');

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'filters' => $filters->toArray(),
                    'goal_pct' => $goal,
                    'min_sample' => $minSample,
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'assessment' => $this->header($scope->tenantId, $modality, $assessmentId, $rows),
                'stats' => [
                    'participants' => $values->count(),
                    'absent' => $absent,
                    'sufficient' => $values->count() >= $minSample,
                    'avg' => $this->stat($values, $minSample, fn ($v) => $v->avg()),
                    'median' => $this->stat($values, $minSample, fn ($v) => $this->median($v)),
                    'min' => $values->isEmpty() ? null : round((float) $values->first(), 1),
                    'max' => $values->isEmpty() ? null : round((float) $values->last(), 1),
                    'at_goal_pct' => $this->stat($values, $minSample, fn ($v) => $v->filter(fn ($p) => $p >= $goal)->count() / $v->count() * 100),
                ],
                'histogram' => $this->histogram($values),
                'classes' => $this->byClass($universe, $rows, $minSample),
                'subjects' => $modality === AssessmentResults::ONLINE
                    ? $this->onlineSubjects($universe, $filters, $assessmentId)
                    : $this->presencialSubjects($universe, $assessmentId),
                'topics' => $modality === AssessmentResults::ONLINE ? $this->onlineTopics($universe, $filters, $assessmentId) : [],
                'students' => [
                    'total' => $rows->count(),
                    'items' => $rows->sortBy('pct')->take(self::STUDENTS_LIMIT)->map(fn ($r) => [
                        'student_id' => $r->student_id,
                        'name' => $names[$r->student_id] ?? 'Aluno',
                        'classes' => $classes[$r->student_id] ?? [],
                        'pct' => round($r->pct, 1),
                        'below_goal' => $r->pct < $goal,
                    ])->values()->all(),
                ],
            ];
        });
    }

    /** Avaliação existe no tenant e, para presencial, está publicada e numa turma do escopo. */
    public function exists(BiAccessScope $scope, string $modality, int $assessmentId): bool
    {
        if ($modality === AssessmentResults::ONLINE) {
            return DB::table('exams')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')->where('id', $assessmentId)->exists();
        }

        return DB::table('official_assessments')
            ->where('tenant_id', $scope->tenantId)
            ->whereNull('deleted_at')
            ->where('status', OfficialAssessment::STATUS_PUBLISHED)
            ->where('id', $assessmentId)
            ->exists();
    }

    public function allowsPresencial(BiAccessScope $scope, int $assessmentId): bool
    {
        $classId = DB::table('official_assessments')->where('id', $assessmentId)->value('school_class_id');

        return $classId === null ? $scope->isTenantWide() : $scope->allowsClass((int) $classId);
    }

    /** @return array{rows: Collection, count: int, participants: int, active: int} */
    private function snapshot(StudentUniverse $universe): array
    {
        $rows = $this->assessments->rows($universe);

        return [
            'rows' => $rows,
            'count' => $rows->map(fn ($r) => $r->modality.':'.$r->assessment_id)->unique()->count(),
            'participants' => $rows->where('modality', AssessmentResults::ONLINE)->pluck('student_id')->unique()->count(),
            'active' => DB::query()->fromSub($universe->query(), 'u')->count(),
        ];
    }

    private function modalityMetric(string $key, string $modality, Collection $now, Collection $before): array
    {
        $current = $now->where('modality', $modality);
        $prior = $before->where('modality', $modality);

        return $this->catalog->make(
            $key,
            $current->isEmpty() ? null : (float) $current->avg('pct'),
            $current->count(),
            ['results' => $current->count(), 'students' => $current->pluck('student_id')->unique()->count()],
            $prior->isEmpty() ? null : (float) $prior->avg('pct'),
            $prior->count(),
        );
    }

    /** Uma linha por avaliação, da mais recente para a mais antiga. */
    private function items(StudentUniverse $universe, Collection $rows, float $goal): array
    {
        $minSample = (int) $this->catalog->definition('assessments.avg_online')['min_sample'];
        $groups = $rows->groupBy(fn ($r) => $r->modality.':'.$r->assessment_id);

        $onlineIds = $rows->where('modality', AssessmentResults::ONLINE)->pluck('assessment_id')->unique();
        $presencialIds = $rows->where('modality', AssessmentResults::PRESENCIAL)->pluck('assessment_id')->unique();
        $exams = DB::table('exams')->whereIn('id', $onlineIds->all() ?: [0])->pluck('title', 'id');
        $official = DB::table('official_assessments as oa')
            ->leftJoin('school_classes as sc', 'sc.id', '=', 'oa.school_class_id')
            ->whereIn('oa.id', $presencialIds->all() ?: [0])
            ->get(['oa.id', 'oa.title', 'sc.name as class_name'])
            ->keyBy('id');
        $absent = $this->absentByAssessment($universe, $presencialIds->all());
        $types = ExamType::query()->pluck('label', 'id');

        $items = $groups->map(function (Collection $list) use ($exams, $official, $absent, $types, $goal, $minSample) {
            $first = $list->first();
            $online = $first->modality === AssessmentResults::ONLINE;
            $values = $list->pluck('pct')->sort()->values();

            return [
                'modality' => $first->modality,
                'assessment_id' => $first->assessment_id,
                'title' => $online ? ($exams[$first->assessment_id] ?? 'Simulado') : ($official[$first->assessment_id]->title ?? 'Avaliação'),
                'school_class' => $online ? null : ($official[$first->assessment_id]->class_name ?? null),
                'exam_type' => $first->exam_type_id !== null ? ($types[$first->exam_type_id] ?? null) : null,
                'date' => $list->min('at'),
                'participants' => $values->count(),
                'absent' => $online ? null : ($absent[$first->assessment_id] ?? 0),
                'avg' => $this->stat($values, $minSample, fn ($v) => $v->avg()),
                'median' => $this->stat($values, $minSample, fn ($v) => $this->median($v)),
                'below_goal' => $values->filter(fn ($p) => $p < $goal)->count(),
                'sufficient' => $values->count() >= $minSample,
            ];
        })->sortByDesc('date')->values();

        return [
            'total' => $items->count(),
            'items' => $items->take(self::LIST_LIMIT)->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function header(int $tenantId, string $modality, int $assessmentId, Collection $rows): array
    {
        if ($modality === AssessmentResults::ONLINE) {
            $exam = DB::table('exams')->where('tenant_id', $tenantId)->where('id', $assessmentId)->first(['id', 'title', 'exam_type_id']);

            return [
                'modality' => $modality,
                'id' => $assessmentId,
                'title' => $exam->title ?? 'Simulado',
                'exam_type' => $exam?->exam_type_id ? ExamType::query()->whereKey($exam->exam_type_id)->value('label') : null,
                'date' => $rows->min('at'),
                'date_to' => $rows->max('at'),
                'school_class' => null,
                'max_score' => null,
            ];
        }

        $oa = DB::table('official_assessments as oa')
            ->leftJoin('school_classes as sc', 'sc.id', '=', 'oa.school_class_id')
            ->where('oa.tenant_id', $tenantId)
            ->where('oa.id', $assessmentId)
            ->first(['oa.id', 'oa.title', 'oa.exam_type_id', 'oa.assessment_date', 'oa.max_score', 'sc.name as class_name']);

        return [
            'modality' => $modality,
            'id' => $assessmentId,
            'title' => $oa->title ?? 'Avaliação',
            'exam_type' => $oa?->exam_type_id ? ExamType::query()->whereKey($oa->exam_type_id)->value('label') : null,
            'date' => $oa ? substr((string) $oa->assessment_date, 0, 10) : null,
            'date_to' => null,
            'school_class' => $oa->class_name ?? null,
            'max_score' => $oa ? (float) $oa->max_score : null,
        ];
    }

    /** Faixas de 10 p.p.; 100% entra na última. @return list<array{from: int, to: int, count: int}> */
    private function histogram(Collection $values): array
    {
        $bins = array_fill(0, 10, 0);
        foreach ($values as $value) {
            $bins[min(9, max(0, (int) floor($value / 10)))]++;
        }

        return array_map(fn ($count, $i) => ['from' => $i * 10, 'to' => $i * 10 + 10, 'count' => $count], $bins, array_keys($bins));
    }

    /** Média por turma do recorte; aluno em duas turmas conta nas duas. */
    private function byClass(StudentUniverse $universe, Collection $rows, int $minSample): array
    {
        if ($rows->isEmpty()) {
            return [];
        }

        $pct = $rows->pluck('pct', 'student_id');

        return $universe->classMemberships()
            ->whereIn('m.student_id', $pct->keys()->all())
            ->get()
            ->groupBy('school_class_id')
            ->map(function (Collection $members) use ($pct, $minSample) {
                $values = $members->map(fn ($m) => $pct[$m->student_id])->sort()->values();

                return [
                    'school_class_id' => (int) $members->first()->school_class_id,
                    'name' => $members->first()->class_name,
                    'participants' => $values->count(),
                    'avg' => $this->stat($values, $minSample, fn ($v) => $v->avg()),
                    'median' => $this->stat($values, $minSample, fn ($v) => $this->median($v)),
                ];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /** Pontos obtidos ÷ pontos possíveis por disciplina, nas 1ªs tentativas do simulado. */
    private function onlineSubjects(StudentUniverse $universe, BiFilters $filters, int $examId): array
    {
        $attempts = $this->assessments->firstOnlineAttempts($universe, $filters)->where('a.exam_id', $examId);
        $participants = (clone $attempts)->count();
        if ($participants === 0) {
            return [];
        }

        $possible = DB::table('exam_questions')
            ->where('exam_id', $examId)
            ->where('is_annulled', false)
            ->whereNull('deleted_at')
            ->whereNotNull('subject_id')
            ->when($filters->subjectId !== null, fn ($q) => $q->where('subject_id', $filters->subjectId))
            ->groupBy('subject_id')
            ->select('subject_id')
            ->selectRaw('SUM(points) as points')
            ->selectRaw('COUNT(*) as questions')
            ->get()
            ->keyBy('subject_id');

        $earned = DB::table('exam_answers as ans')
            ->joinSub($attempts, 'fa', 'fa.attempt_id', '=', 'ans.attempt_id')
            ->join('exam_questions as q', 'q.id', '=', 'ans.question_id')
            ->where('q.is_annulled', false)
            ->whereIn('q.subject_id', $possible->keys()->all() ?: [0])
            ->groupBy('q.subject_id')
            ->select('q.subject_id')
            ->selectRaw('SUM(ans.points_earned) as earned')
            ->pluck('earned', 'subject_id');

        $names = DB::table('subjects')->whereIn('id', $possible->keys()->all())->pluck('name', 'id');

        return $possible
            ->filter(fn ($p) => (float) $p->points > 0)
            ->map(fn ($p, $subjectId) => [
                'subject_id' => (int) $subjectId,
                'name' => $names[$subjectId] ?? 'Disciplina',
                'questions' => (int) $p->questions,
                'participants' => $participants,
                'pct' => round((float) ($earned[$subjectId] ?? 0) / ((float) $p->points * $participants) * 100, 1),
            ])
            ->sortBy('pct')
            ->values()
            ->all();
    }

    /** Média de nota ÷ nota máxima por disciplina; faltas e notas não lançadas ficam fora. */
    private function presencialSubjects(StudentUniverse $universe, int $assessmentId): array
    {
        return DB::table('official_assessment_grades as g')
            ->join('official_assessments as oa', 'oa.id', '=', 'g.official_assessment_id')
            ->join('subjects as s', 's.id', '=', 'g.subject_id')
            ->where('oa.id', $assessmentId)
            ->where('oa.max_score', '>', 0)
            ->where('g.is_absent', false)
            ->whereNotNull('g.grade')
            ->whereIn('g.student_id', $universe->query())
            ->when($universe->filters->subjectId !== null, fn ($q) => $q->where('g.subject_id', $universe->filters->subjectId))
            ->groupBy('g.subject_id', 's.name')
            ->select('g.subject_id', 's.name')
            ->selectRaw('COUNT(DISTINCT g.student_id) as participants')
            ->selectRaw('AVG(g.grade / oa.max_score * 100) as pct')
            ->get()
            ->map(fn ($row) => [
                'subject_id' => (int) $row->subject_id,
                'name' => $row->name,
                'questions' => null,
                'participants' => (int) $row->participants,
                'pct' => round((float) $row->pct, 1),
            ])
            ->sortBy('pct')
            ->values()
            ->all();
    }

    /** Assuntos com menor acerto no simulado (respostas objetivas da 1ª tentativa). */
    private function onlineTopics(StudentUniverse $universe, BiFilters $filters, int $examId): array
    {
        return DB::table('exam_answers as ans')
            ->joinSub($this->assessments->firstOnlineAttempts($universe, $filters)->where('a.exam_id', $examId), 'fa', 'fa.attempt_id', '=', 'ans.attempt_id')
            ->join('exam_questions as q', 'q.id', '=', 'ans.question_id')
            ->join('exam_question_topic as t', 't.exam_question_id', '=', 'q.id')
            ->join('subject_topics as st', 'st.id', '=', 't.subject_topic_id')
            ->join('subjects as s', 's.id', '=', 'st.subject_id')
            ->where('q.is_annulled', false)
            ->whereNotNull('ans.is_correct')
            ->when($filters->subjectId !== null, fn ($q) => $q->where('q.subject_id', $filters->subjectId))
            ->groupBy('st.id', 'st.name', 's.name')
            ->select('st.id as topic_id', 'st.name', 's.name as subject')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->havingRaw('COUNT(*) >= ?', [self::TOPIC_MIN_ANSWERS])
            ->get()
            ->map(fn ($t) => [
                'topic_id' => (int) $t->topic_id,
                'name' => $t->name,
                'subject' => $t->subject,
                'answers' => (int) $t->answers,
                'accuracy' => round($t->correct / $t->answers * 100, 1),
            ])
            ->sortBy('accuracy')
            ->take(self::TOPICS_LIMIT)
            ->values()
            ->all();
    }

    private function absentCount(StudentUniverse $universe, int $assessmentId): int
    {
        return $this->absentByAssessment($universe, [$assessmentId])[$assessmentId] ?? 0;
    }

    /** Alunos do recorte com falta (em todas as disciplinas lançadas) por avaliação presencial. @return array<int, int> */
    private function absentByAssessment(StudentUniverse $universe, array $assessmentIds): array
    {
        if ($assessmentIds === []) {
            return [];
        }

        $perStudent = DB::table('official_assessment_grades as g')
            ->whereIn('g.official_assessment_id', $assessmentIds)
            ->whereIn('g.student_id', $universe->query())
            ->groupBy('g.official_assessment_id', 'g.student_id')
            ->select('g.official_assessment_id')
            ->havingRaw('MIN(g.is_absent) = 1');

        return DB::query()->fromSub($perStudent, 'p')
            ->groupBy('p.official_assessment_id')
            ->select('p.official_assessment_id')
            ->selectRaw('COUNT(*) as total')
            ->pluck('total', 'official_assessment_id')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    private function onlyModality(BiFilters $filters, string $modality): BiFilters
    {
        return new BiFilters(
            from: $filters->from,
            to: $filters->to,
            schoolYear: $filters->schoolYear,
            courseId: $filters->courseId,
            schoolClassId: $filters->schoolClassId,
            subjectId: $filters->subjectId,
            teacherId: $filters->teacherId,
            examTypeId: $filters->examTypeId,
            modality: $modality,
        );
    }

    private function stat(Collection $values, int $minSample, callable $fn): ?float
    {
        return $values->count() >= $minSample ? round((float) $fn($values), 1) : null;
    }

    private function median(Collection $sorted): float
    {
        $n = $sorted->count();
        $mid = intdiv($n, 2);

        return $n % 2 ? (float) $sorted[$mid] : ((float) $sorted[$mid - 1] + (float) $sorted[$mid]) / 2;
    }

    private function pct(int|float $part, int|float $total): ?float
    {
        return $total > 0 ? $part / $total * 100 : null;
    }

    private function remember(string $name, BiAccessScope $scope, BiFilters $filters, array $extra, callable $compute): array
    {
        $key = 'bi:'.$name.':'.$scope->tenantId.':'.md5(json_encode([$scope->classIds, $filters->toArray(), $extra]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), $compute);
    }
}
