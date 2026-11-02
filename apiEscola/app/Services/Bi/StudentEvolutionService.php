<?php

namespace App\Services\Bi;

use App\Models\ExamType;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Evolução dos alunos: lista com sinais individuais e o detalhe de um aluno (avaliações comparáveis
 * contra a média dos colegas de turma, acerto por disciplina e assuntos críticos/em evolução).
 */
class StudentEvolutionService
{
    public const FILTER_ALL = 'all';

    public const FILTER_ATTENTION = 'attention';

    public const FILTER_IMPROVING = 'improving';

    public const FILTER_DECLINING = 'declining';

    public const FILTERS = [self::FILTER_ALL, self::FILTER_ATTENTION, self::FILTER_IMPROVING, self::FILTER_DECLINING];

    private const TOPICS_LIMIT = 5;

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly AnswerStream $answers,
        private readonly StudentRoster $roster,
    ) {
    }

    /** @return array<string, mixed> */
    public function list(BiAccessScope $scope, BiFilters $filters, string $filter, ?string $search, int $page, int $perPage): array
    {
        $roster = collect($this->rosterFor($scope, $filters));
        $threshold = (float) config('bi.evolution_threshold_pp', 5);

        $summary = [
            'total' => $roster->count(),
            'attention' => $roster->filter(fn ($s) => $s['reasons'] !== [])->count(),
            'improving' => $roster->filter(fn ($s) => $s['evolution_pp'] !== null && $s['evolution_pp'] >= $threshold)->count(),
            'declining' => $roster->filter(fn ($s) => $s['evolution_pp'] !== null && $s['evolution_pp'] <= -$threshold)->count(),
            'with_evolution' => $roster->filter(fn ($s) => $s['evolution_pp'] !== null)->count(),
        ];

        $needle = $search !== null ? mb_strtolower(trim($search)) : '';
        $filtered = $roster
            ->filter(fn ($s) => match ($filter) {
                self::FILTER_ATTENTION => $s['reasons'] !== [],
                self::FILTER_IMPROVING => $s['evolution_pp'] !== null && $s['evolution_pp'] >= $threshold,
                self::FILTER_DECLINING => $s['evolution_pp'] !== null && $s['evolution_pp'] <= -$threshold,
                default => true,
            })
            ->filter(fn ($s) => $needle === '' || str_contains(mb_strtolower($s['name']), $needle))
            ->when($filter === self::FILTER_IMPROVING, fn ($c) => $c->sortByDesc('evolution_pp'))
            ->when($filter === self::FILTER_DECLINING, fn ($c) => $c->sortBy('evolution_pp'))
            ->values();

        $lastPage = max(1, (int) ceil($filtered->count() / $perPage));
        $page = min(max(1, $page), $lastPage);

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'filters' => $filters->toArray(),
                'goal_pct' => (float) config('bi.goal_pct', 70),
                'evolution_threshold_pp' => $threshold,
                ...$this->roster->thresholds(),
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'summary' => $summary,
            'items' => $filtered->forPage($page, $perPage)->values()->all(),
            'pagination' => ['page' => $page, 'per_page' => $perPage, 'total' => $filtered->count(), 'last_page' => $lastPage],
        ];
    }

    /** O aluno está no recorte do usuário (turmas do escopo e filtros)? */
    public function inScope(BiAccessScope $scope, BiFilters $filters, int $studentId): bool
    {
        return in_array($studentId, (new StudentUniverse($scope, $filters))->ids(), true);
    }

    /** @return array<string, mixed> */
    public function evolution(BiAccessScope $scope, BiFilters $filters, int $studentId): array
    {
        return $this->remember('student', $scope, $filters, [$studentId], function () use ($scope, $filters, $studentId) {
            $universe = new StudentUniverse($scope, $filters);
            $classmates = $this->classmates($universe, $studentId);
            $row = collect($this->rosterFor($scope, $filters))->firstWhere('student_id', $studentId);
            $goal = (float) config('bi.goal_pct', 70);

            return [
                'meta' => [
                    'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                    'previous_period' => ['from' => $filters->previous()->from->toDateString(), 'to' => $filters->previous()->to->toDateString()],
                    'goal_pct' => $goal,
                    'evolution_threshold_pp' => (float) config('bi.evolution_threshold_pp', 5),
                    'min_answers' => $this->minAnswers(),
                    ...$this->roster->thresholds(),
                    'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
                ],
                'student' => $row,
                'peers' => ['students' => count($classmates), 'classes' => $row['classes'] ?? []],
                'series' => $this->series($universe, $studentId, $classmates),
                'subjects' => $this->subjects($universe, $studentId, $classmates),
                'topics' => $this->topics($scope, $filters, $studentId),
            ];
        });
    }

    /**
     * Uma série por modalidade + concurso (só avaliações comparáveis entre si), com a média dos colegas
     * das mesmas turmas na mesma avaliação.
     */
    private function series(StudentUniverse $universe, int $studentId, array $classmates): array
    {
        $rows = $this->assessments->rows($universe);
        $mine = $rows->where('student_id', $studentId);
        if ($mine->isEmpty()) {
            return [];
        }

        $peerSet = array_flip($classmates);
        $peers = $rows->filter(fn ($r) => isset($peerSet[$r->student_id]) && $r->student_id !== $studentId)
            ->groupBy(fn ($r) => $r->modality.':'.$r->assessment_id);
        $titles = $this->titles($mine);
        $types = ExamType::query()->pluck('label', 'id');

        return $mine->groupBy(fn ($r) => $r->modality.':'.($r->exam_type_id ?? 0))
            ->map(fn (Collection $group) => [
                'modality' => $group->first()->modality,
                'exam_type_id' => $group->first()->exam_type_id,
                'exam_type' => $group->first()->exam_type_id !== null ? ($types[$group->first()->exam_type_id] ?? null) : null,
                'points' => $group->sortBy('at')->map(function ($r) use ($peers, $titles) {
                    $others = $peers->get($r->modality.':'.$r->assessment_id, collect());

                    return [
                        'assessment_id' => $r->assessment_id,
                        'title' => $titles[$r->modality.':'.$r->assessment_id] ?? 'Avaliação',
                        'date' => $r->at,
                        'pct' => round($r->pct, 1),
                        'peers_avg' => $others->isEmpty() ? null : round((float) $others->avg('pct'), 1),
                        'peers_n' => $others->count(),
                    ];
                })->values()->all(),
            ])
            ->sortBy(fn ($s) => [$s['modality'], $s['exam_type'] ?? ''])
            ->values()
            ->all();
    }

    /** Acerto por disciplina (simulados online + banco, 1ª tentativa) do aluno e dos colegas de turma. */
    private function subjects(StudentUniverse $universe, int $studentId, array $classmates): array
    {
        $min = $this->minAnswers();
        $aggregate = fn (Builder $q) => $q->groupBy('r.subject_id')
            ->select('r.subject_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->keyBy('subject_id');

        $mine = $aggregate($this->answers->query($universe)->where('r.student_id', $studentId));
        $peers = $aggregate($this->answers->query($universe)->whereIn('r.student_id', array_values(array_diff($classmates, [$studentId])) ?: [0]));
        $names = DB::table('subjects')->whereIn('id', $mine->keys()->all() ?: [0])->pluck('name', 'id');

        return $mine
            ->map(fn ($s, $id) => [
                'subject_id' => (int) $id,
                'name' => $names[$id] ?? 'Disciplina',
                'answers' => (int) $s->answers,
                'accuracy' => $s->answers >= $min ? round($s->correct / $s->answers * 100, 1) : null,
                'peers_accuracy' => ($p = $peers->get($id)) && $p->answers >= $min ? round($p->correct / $p->answers * 100, 1) : null,
                'peers_answers' => (int) ($peers->get($id)->answers ?? 0),
            ])
            ->sortBy(fn ($s) => $s['accuracy'] ?? 101)
            ->values()
            ->all();
    }

    /** Assuntos críticos (menor acerto no período) e em evolução (maior ganho vs. período anterior). */
    private function topics(BiAccessScope $scope, BiFilters $filters, int $studentId): array
    {
        $min = $this->minAnswers();
        $threshold = (float) config('bi.evolution_threshold_pp', 5);
        $stats = fn (BiFilters $f) => $this->answers->query(new StudentUniverse($scope, $f))
            ->where('r.student_id', $studentId)
            ->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id')
            ->join('subject_topics as st', 'st.id', '=', 't.subject_topic_id')
            ->join('subjects as s', 's.id', '=', 'st.subject_id')
            ->groupBy('st.id', 'st.name', 's.name')
            ->select('st.id as topic_id', 'st.name', 's.name as subject')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->havingRaw('COUNT(*) >= ?', [$min])
            ->get()
            ->map(fn ($t) => ['topic_id' => (int) $t->topic_id, 'name' => $t->name, 'subject' => $t->subject, 'answers' => (int) $t->answers, 'accuracy' => round($t->correct / $t->answers * 100, 1)])
            ->keyBy('topic_id');

        $now = $stats($filters);
        $before = $stats($filters->previous());
        $withDelta = $now->map(fn ($t) => $t + [
            'previous' => $before->get($t['topic_id'])['accuracy'] ?? null,
            'delta_pp' => $before->has($t['topic_id']) ? round($t['accuracy'] - $before->get($t['topic_id'])['accuracy'], 1) : null,
        ]);

        return [
            'critical' => $withDelta->sortBy('accuracy')->take(self::TOPICS_LIMIT)->values()->all(),
            'improving' => $withDelta->filter(fn ($t) => $t['delta_pp'] !== null && $t['delta_pp'] >= $threshold)
                ->sortByDesc('delta_pp')->take(self::TOPICS_LIMIT)->values()->all(),
        ];
    }

    /** Alunos do recorte que dividem ao menos uma turma com o aluno (inclui o próprio). @return list<int> */
    private function classmates(StudentUniverse $universe, int $studentId): array
    {
        $classIds = $universe->classMemberships()->where('m.student_id', $studentId)->pluck('m.school_class_id')->all();

        return $universe->classMemberships()
            ->whereIn('m.school_class_id', $classIds ?: [0])
            ->pluck('m.student_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<string, string> chave modalidade:id → título */
    private function titles(Collection $rows): array
    {
        $online = $rows->where('modality', AssessmentResults::ONLINE)->pluck('assessment_id')->all();
        $presencial = $rows->where('modality', AssessmentResults::PRESENCIAL)->pluck('assessment_id')->all();
        $titles = [];
        foreach (DB::table('exams')->whereIn('id', $online ?: [0])->pluck('title', 'id') as $id => $title) {
            $titles[AssessmentResults::ONLINE.':'.$id] = $title;
        }
        foreach (DB::table('official_assessments')->whereIn('id', $presencial ?: [0])->pluck('title', 'id') as $id => $title) {
            $titles[AssessmentResults::PRESENCIAL.':'.$id] = $title;
        }

        return $titles;
    }

    /** Lista do recorte, compartilhada entre a lista e o detalhe (mesmo cache). */
    private function rosterFor(BiAccessScope $scope, BiFilters $filters): array
    {
        return $this->remember('students', $scope, $filters, [], fn () => $this->roster->build(new StudentUniverse($scope, $filters)));
    }

    private function minAnswers(): int
    {
        return (int) $this->catalog->definition('topics.mastery')['min_sample'];
    }

    private function remember(string $name, BiAccessScope $scope, BiFilters $filters, array $extra, callable $compute): array
    {
        $key = 'bi:'.$name.':'.$scope->tenantId.':'.md5(json_encode([$scope->classIds, $filters->toArray(), $extra]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), $compute);
    }
}
