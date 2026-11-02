<?php

namespace App\Services\Bi;

use App\Models\PracticeAnswer;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\PracticeFirstAttempts;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** Dashboard executivo (Visão geral): indicadores, evolução mensal, disciplinas críticas e alunos em atenção. */
class OverviewService
{
    private const SUPPORT_LIST_LIMIT = 10;

    private const DIFFICULTY_LIMIT = 5;

    private const TOPIC_MIN_SAMPLE = 5;

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
        private readonly AttendanceRecords $attendance,
        private readonly AnswerStream $answers,
        private readonly StudentSignals $signals,
    ) {
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters): array
    {
        $key = 'bi:overview:'.$scope->tenantId.':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), fn () => $this->compute($scope, $filters));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters): array
    {
        $previousFilters = $filters->previous();
        $current = new StudentUniverse($scope, $filters);
        $previous = new StudentUniverse($scope, $previousFilters);

        $now = $this->snapshot($current);
        $before = $this->snapshot($previous);
        $minResults = (int) config('bi.min_student_results', 2);

        $metrics = [
            $this->catalog->make('students.active', $now['active'], $now['active'], [], $before['active'], $before['active']),
            $this->catalog->make(
                'students.recent_activity',
                $this->pct($now['recent'], $now['active']),
                $now['active'],
                ['students' => $now['recent']],
                $this->pct($before['recent'], $before['active']),
                $before['active'],
            ),
            $this->catalog->make(
                'exams.participation',
                $this->pct($now['participants'], $now['active']),
                $now['active'],
                ['students' => $now['participants']],
                $this->pct($before['participants'], $before['active']),
                $before['active'],
            ),
            $this->catalog->make(
                'assessments.avg_pct',
                $this->mean($now['rows']->pluck('pct')),
                $now['rows']->count(),
                ['results' => $now['rows']->count(), 'students' => $now['rows']->pluck('student_id')->unique()->count()],
                $this->mean($before['rows']->pluck('pct')),
                $before['rows']->count(),
            ),
            $this->catalog->make(
                'practice.first_accuracy',
                $this->pct($now['practice']['correct'], $now['practice']['answers']),
                $now['practice']['answers'],
                ['answers' => $now['practice']['answers'], 'students' => $now['practice']['students']],
                $this->pct($before['practice']['correct'], $before['practice']['answers']),
                $before['practice']['answers'],
            ),
            $this->catalog->make(
                'attendance.rate',
                $this->pct($now['attendance']['present'], $now['attendance']['records']),
                $now['attendance']['records'],
                ['records' => $now['attendance']['records'], 'students' => $now['attendance']['students']],
                $this->pct($before['attendance']['present'], $before['attendance']['records']),
                $before['attendance']['records'],
            ),
            $this->catalog->make(
                'students.improving',
                $this->pct($now['improving'], count($now['evolution'])),
                count($now['evolution']),
                ['students' => $now['improving'], 'with_sample' => count($now['evolution'])],
                $this->pct($before['improving'], count($before['evolution'])),
                count($before['evolution']),
            ),
            $this->catalog->make(
                'students.needs_support',
                count($now['support']),
                $now['active'],
                [],
                count($before['support']),
                $before['active'],
            ),
        ];

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                'filters' => $filters->toArray(),
                'scope' => ['role' => $scope->role, 'tenant_wide' => $scope->isTenantWide()],
                'goal_pct' => (float) config('bi.goal_pct', 70),
                'evolution_threshold_pp' => (float) config('bi.evolution_threshold_pp', 5),
                'min_student_results' => $minResults,
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'metrics' => $metrics,
            'monthly' => $this->assessments->monthly($now['rows'], $filters),
            'subjects_difficulty' => $this->subjectsDifficulty($current),
            'needs_support' => $this->supportList($current, $now['support']),
        ];
    }

    /** Números de um período, reaproveitados pelos indicadores e pelas listas. */
    private function snapshot(StudentUniverse $universe): array
    {
        $rows = $this->assessments->rows($universe);
        $evolution = $this->signals->evolution($rows);
        $threshold = (float) config('bi.evolution_threshold_pp', 5);

        return [
            'active' => DB::query()->fromSub($universe->query(), 'u')->count(),
            'recent' => $this->recentlyActive($universe),
            'participants' => $rows->where('modality', AssessmentResults::ONLINE)->pluck('student_id')->unique()->count(),
            'rows' => $rows,
            'practice' => $this->practice->totals($universe),
            'attendance' => $this->attendance->totals($universe),
            'evolution' => $evolution,
            'improving' => count(array_filter($evolution, fn (float $pp) => $pp >= $threshold)),
            'support' => $this->signals->supportReasons($universe, $rows, $evolution),
        ];
    }

    /** @param  array<int, list<array<string, mixed>>>  $reasons */
    private function supportList(StudentUniverse $universe, array $reasons): array
    {
        uasort($reasons, fn (array $a, array $b) => count($b) <=> count($a) ?: ($a[0]['value'] <=> $b[0]['value']));
        $top = array_slice($reasons, 0, self::SUPPORT_LIST_LIMIT, true);
        $ids = array_keys($top);
        $names = Student::query()->whereIn('id', $ids)->pluck('name', 'id');
        $classes = $universe->classNamesByStudent($ids);

        return [
            'total' => count($reasons),
            'items' => array_map(fn (int $id) => [
                'student_id' => $id,
                'name' => $names[$id] ?? 'Aluno',
                'classes' => $classes[$id] ?? [],
                'reasons' => $top[$id],
            ], $ids),
        ];
    }

    /** Alunos do recorte com questão respondida, simulado concluído ou presença nos últimos dias do período. */
    private function recentlyActive(StudentUniverse $universe): int
    {
        $days = (int) config('bi.recent_activity_days', 14);
        $window = new BiFilters(
            from: $universe->filters->to->copy()->subDays($days - 1),
            to: $universe->filters->to->copy(),
        );
        [$from, $until] = $window->utcRange();
        $tenantId = $universe->scope->tenantId;

        $practice = PracticeAnswer::query()->counted()
            ->where('practice_answers.tenant_id', $tenantId)
            ->where('practice_answers.answered_at', '>=', $from)
            ->where('practice_answers.answered_at', '<', $until)
            ->select('practice_answers.student_id')
            ->toBase();
        $exams = DB::table('exam_attempts')
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->where('finished_at', '>=', $from)
            ->where('finished_at', '<', $until)
            ->select('student_id');
        $presence = DB::table('student_attendances')
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereBetween('attendance_date', $window->dateRange())
            ->whereIn('status', ['present', 'late'])
            ->select('student_id');

        return DB::query()
            ->fromSub($practice->union($exams)->union($presence), 'act')
            ->whereIn('act.student_id', $universe->query())
            ->distinct()
            ->count('act.student_id');
    }

    /** Disciplinas com menor taxa de acerto (simulados online + banco, 1ª tentativa) e o assunto mais crítico de cada uma. */
    private function subjectsDifficulty(StudentUniverse $universe): array
    {
        $minSample = (int) $this->catalog->definition('subjects.difficulty_rank')['min_sample'];
        $answers = $this->answers->query($universe);

        $aggregate = function (bool $withTopic) use ($answers) {
            $groups = $withTopic ? ['r.subject_id', 't.subject_topic_id'] : ['r.subject_id'];

            return (clone $answers)
                ->when($withTopic, fn ($q) => $q->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id'))
                ->groupBy($groups)
                ->select('r.subject_id')
                ->when($withTopic, fn ($q) => $q->addSelect('t.subject_topic_id as topic_id'))
                ->selectRaw('COUNT(*) as answers')
                ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
                ->get();
        };

        $subjects = $aggregate(false)
            ->filter(fn ($s) => (int) $s->answers >= $minSample)
            ->map(fn ($s) => (object) [
                'subject_id' => (int) $s->subject_id,
                'answers' => (int) $s->answers,
                'accuracy' => round($s->correct / $s->answers * 100, 1),
            ])
            ->sortBy('accuracy')
            ->take(self::DIFFICULTY_LIMIT)
            ->values();

        if ($subjects->isEmpty()) {
            return [];
        }

        $topics = $aggregate(true)
            ->filter(fn ($t) => (int) $t->answers >= self::TOPIC_MIN_SAMPLE)
            ->groupBy('subject_id')
            ->map(fn (Collection $list) => $list->sortBy(fn ($t) => $t->correct / $t->answers)->first());
        $subjectNames = Subject::query()->whereIn('id', $subjects->pluck('subject_id'))->pluck('name', 'id');
        $topicNames = SubjectTopic::query()->whereIn('id', $topics->pluck('topic_id'))->pluck('name', 'id');

        return $subjects->map(function ($s) use ($subjectNames, $topics, $topicNames) {
            $topic = $topics->get($s->subject_id);

            return [
                'subject_id' => $s->subject_id,
                'name' => $subjectNames[$s->subject_id] ?? 'Disciplina',
                'accuracy' => $s->accuracy,
                'answers' => $s->answers,
                'critical_topic' => $topic ? [
                    'topic_id' => (int) $topic->topic_id,
                    'name' => $topicNames[$topic->topic_id] ?? 'Assunto',
                    'accuracy' => round($topic->correct / $topic->answers * 100, 1),
                    'answers' => (int) $topic->answers,
                ] : null,
            ];
        })->all();
    }

    private function pct(int|float $part, int|float $total): ?float
    {
        return $total > 0 ? $part / $total * 100 : null;
    }

    private function mean(Collection $values): ?float
    {
        return $values->isEmpty() ? null : (float) $values->avg();
    }
}
