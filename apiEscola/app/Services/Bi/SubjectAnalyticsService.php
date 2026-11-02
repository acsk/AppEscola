<?php

namespace App\Services\Bi;

use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Disciplinas e assuntos: indicadores da disciplina, mapa de calor turma × assunto, ranking e erros recorrentes. */
class SubjectAnalyticsService
{
    private const HEATMAP_TOPICS = 8;

    private const HEATMAP_CLASSES = 30;

    private const LETTERS = 'ABCDEFGHIJ';

    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AnswerStream $answers,
        private readonly BiFeatureGate $gate,
    ) {
    }

    /**
     * Disciplinas do escopo com respostas no período, da mais respondida para a menos (abas da tela).
     *
     * @return list<array{subject_id: int, name: string, answers: int}>
     */
    public function subjects(BiAccessScope $scope, BiFilters $filters, string $source): array
    {
        return $this->remember('subjects', $scope, $filters, [$source], function () use ($scope, $filters, $source) {
            $allowed = $scope->subjectIds();
            $counts = $this->answers->query(new StudentUniverse($scope, $filters), null, $source)
                ->when($allowed !== null, fn ($q) => $q->whereIn('r.subject_id', $allowed ?: [0]))
                ->groupBy('r.subject_id')
                ->select('r.subject_id')
                ->selectRaw('COUNT(*) as answers')
                ->pluck('answers', 'subject_id');

            $names = Subject::query()
                ->where('tenant_id', $scope->tenantId)
                ->whereIn('id', $counts->keys())
                ->pluck('name', 'id');

            return $counts
                ->filter(fn ($n, $id) => $names->has($id))
                ->map(fn ($n, $id) => ['subject_id' => (int) $id, 'name' => $names[$id], 'answers' => (int) $n])
                ->sortBy([['answers', 'desc'], ['name', 'asc']])
                ->values()
                ->all();
        });
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters, Subject $subject, string $source): array
    {
        $filters = $filters->withSubject($subject->id);

        return $this->remember('subject', $scope, $filters, [$source], fn () => $this->compute($scope, $filters, $subject, $source));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters, Subject $subject, string $source): array
    {
        $previousFilters = $filters->previous();
        $current = new StudentUniverse($scope, $filters);
        $previous = new StudentUniverse($scope, $previousFilters);

        $now = $this->totals($current, $source);
        $before = $this->totals($previous, $source);
        $topicsNow = $this->topicStats($current, $subject->id, $source);
        $topicsBefore = $this->topicStats($previous, $subject->id, $source);

        $minTopic = (int) $this->catalog->definition('subject.accuracy')['min_sample'];
        $goal = (float) config('bi.goal_pct', 70);
        $belowGoal = fn (Collection $topics) => $topics->filter(fn ($t) => $t->answers >= $minTopic);
        $sufficientNow = $belowGoal($topicsNow);
        $sufficientBefore = $belowGoal($topicsBefore);
        $countBelow = fn (Collection $topics) => $topics->isEmpty()
            ? null
            : (float) $topics->filter(fn ($t) => $t->correct / $t->answers * 100 < $goal)->count();

        $metrics = [
            $this->catalog->make(
                'subject.answers',
                $now['answers'],
                $now['answers'],
                ['students' => $now['students']],
                $before['answers'],
                $before['answers'],
            ),
            $this->catalog->make(
                'subject.accuracy',
                $this->pct($now['correct'], $now['answers']),
                $now['answers'],
                ['answers' => $now['answers']],
                $this->pct($before['correct'], $before['answers']),
                $before['answers'],
            ),
            $this->catalog->make(
                'subject.students_evaluated',
                $now['evaluated'],
                $now['active'],
                ['active' => $now['active'], 'pct_of_active' => $this->round($this->pct($now['evaluated'], $now['active']))],
                $before['evaluated'],
                $before['active'],
            ),
            $this->catalog->make(
                'subject.topics_below_goal',
                $countBelow($sufficientNow),
                $sufficientNow->count(),
                ['topics_with_sample' => $sufficientNow->count(), 'topics_total' => $topicsNow->count()],
                $countBelow($sufficientBefore),
                $sufficientBefore->count(),
            ),
        ];

        $features = $this->gate->settings($scope->tenantId);
        $heatmapAvailable = $this->gate->allows($features, BiFeatureGate::PLAN_ADVANCED);

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                'filters' => $filters->toArray(),
                'source' => $source,
                'scope' => ['role' => $scope->role, 'tenant_wide' => $scope->isTenantWide()],
                'goal_pct' => $goal,
                'topic_min_sample' => $minTopic,
                'min_subject_student_answers' => (int) config('bi.min_subject_student_answers', 10),
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'subject' => ['id' => $subject->id, 'name' => $subject->name],
            'metrics' => $metrics,
            'heatmap_available' => $heatmapAvailable,
            'heatmap' => $heatmapAvailable ? $this->heatmap($current, $subject->id, $source, $topicsNow, $minTopic, $goal) : null,
            'ranking' => $this->ranking($topicsNow, $topicsBefore, $minTopic, $goal),
        ];
    }

    /**
     * Questões do assunto com maior taxa de erro e a distribuição das alternativas marcadas.
     *
     * @return array<string, mixed>
     */
    public function errors(BiAccessScope $scope, BiFilters $filters, Subject $subject, SubjectTopic $topic, string $source, int $limit): array
    {
        $filters = $filters->withSubject($subject->id);

        return $this->remember('errors', $scope, $filters, [$source, $topic->id, $limit], function () use ($scope, $filters, $topic, $source, $limit) {
            $minAnswers = (int) $this->catalog->definition('questions.recurring_errors')['min_sample'];
            $answers = $this->topicAnswers(new StudentUniverse($scope, $filters), $topic->id, $source);

            $candidates = (clone $answers)
                ->groupBy('r.question_id')
                ->select('r.question_id')
                ->selectRaw('COUNT(*) as answers')
                ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
                ->selectRaw('COUNT(DISTINCT r.student_id) as students')
                ->havingRaw('COUNT(*) >= ?', [$minAnswers]);

            $total = DB::query()->fromSub($candidates, 'c')->count();
            $questions = DB::query()->fromSub($candidates, 'c')
                ->orderByRaw('(c.answers - c.correct) / c.answers DESC')
                ->orderByDesc('c.answers')
                ->orderBy('c.question_id')
                ->limit($limit)
                ->get();

            $ids = $questions->pluck('question_id')->map(fn ($id) => (int) $id)->all();
            $marked = (clone $answers)
                ->whereIn('r.question_id', $ids ?: [0])
                ->groupBy('r.question_id', 'r.option_id')
                ->select('r.question_id', 'r.option_id')
                ->selectRaw('COUNT(*) as total')
                ->get()
                ->groupBy('question_id');
            $options = DB::table('exam_question_options')
                ->whereIn('question_id', $ids ?: [0])
                ->orderBy('order')
                ->orderBy('id')
                ->get(['id', 'question_id', 'option_text', 'is_correct'])
                ->groupBy('question_id');
            $details = DB::table('exam_questions as q')
                ->leftJoin('exams as ex', fn ($j) => $j->on('ex.id', '=', 'q.exam_id')->whereNull('ex.deleted_at'))
                ->whereIn('q.id', $ids ?: [0])
                ->get(['q.id', 'q.question_text', 'q.source_exam_name', 'ex.title as exam_title'])
                ->keyBy('id');

            return [
                'topic' => ['id' => $topic->id, 'name' => $topic->name],
                'source' => $source,
                'min_answers' => $minAnswers,
                'total' => $total,
                'items' => $questions->map(fn ($q) => $this->errorItem(
                    $q,
                    $details->get($q->question_id),
                    $options->get($q->question_id, collect()),
                    $marked->get($q->question_id, collect()),
                ))->values()->all(),
            ];
        });
    }

    /** @return array{answers: int, correct: int, students: int, evaluated: int, active: int} */
    private function totals(StudentUniverse $universe, string $source): array
    {
        $minAnswers = (int) config('bi.min_subject_student_answers', 10);
        $perStudent = $this->answers->query($universe, null, $source)
            ->groupBy('r.student_id')
            ->select('r.student_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct');

        $row = DB::query()->fromSub($perStudent, 's')
            ->selectRaw('COALESCE(SUM(s.answers), 0) as answers')
            ->selectRaw('COALESCE(SUM(s.correct), 0) as correct')
            ->selectRaw('COUNT(*) as students')
            ->selectRaw('SUM(CASE WHEN s.answers >= ? THEN 1 ELSE 0 END) as evaluated', [$minAnswers])
            ->first();

        return [
            'answers' => (int) $row->answers,
            'correct' => (int) $row->correct,
            'students' => (int) $row->students,
            'evaluated' => (int) $row->evaluated,
            'active' => DB::query()->fromSub($universe->query(), 'u')->count(),
        ];
    }

    /** Respostas da disciplina marcadas com o assunto (questão com dois assuntos conta nos dois). */
    private function topicAnswers(StudentUniverse $universe, ?int $topicId, string $source): Builder
    {
        return $this->answers->query($universe, null, $source)
            ->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id')
            ->join('subject_topics as st', 'st.id', '=', 't.subject_topic_id')
            ->whereColumn('st.subject_id', 'r.subject_id')
            ->when($topicId !== null, fn ($q) => $q->where('st.id', $topicId));
    }

    /** @return Collection<int, object{topic_id: int, name: string, answers: int, correct: int, students: int}> */
    private function topicStats(StudentUniverse $universe, int $subjectId, string $source): Collection
    {
        return $this->topicAnswers($universe, null, $source)
            ->where('st.subject_id', $subjectId)
            ->groupBy('st.id', 'st.name')
            ->select('st.id as topic_id', 'st.name')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->selectRaw('COUNT(DISTINCT r.student_id) as students')
            ->get()
            ->map(fn ($t) => (object) [
                'topic_id' => (int) $t->topic_id,
                'name' => $t->name,
                'answers' => (int) $t->answers,
                'correct' => (int) $t->correct,
                'students' => (int) $t->students,
            ])
            ->keyBy('topic_id');
    }

    /** Assuntos com amostra suficiente, do menor aproveitamento para o maior, com a variação em p.p. */
    private function ranking(Collection $now, Collection $before, int $minSample, float $goal): array
    {
        $items = $now
            ->filter(fn ($t) => $t->answers >= $minSample)
            ->map(function ($t) use ($before, $minSample, $goal) {
                $accuracy = round($t->correct / $t->answers * 100, 1);
                $prior = $before->get($t->topic_id);
                $previous = $prior && $prior->answers >= $minSample ? round($prior->correct / $prior->answers * 100, 1) : null;

                return [
                    'topic_id' => $t->topic_id,
                    'name' => $t->name,
                    'accuracy' => $accuracy,
                    'below_goal' => $accuracy < $goal,
                    'previous' => $previous,
                    'delta_pp' => $previous === null ? null : round($accuracy - $previous, 1),
                    'answers' => $t->answers,
                    'students' => $t->students,
                ];
            })
            ->sortBy([['accuracy', 'asc'], ['answers', 'desc']])
            ->values();

        return [
            'items' => $items->all(),
            'insufficient' => $now->filter(fn ($t) => $t->answers < $minSample)
                ->sortByDesc('answers')
                ->map(fn ($t) => ['topic_id' => $t->topic_id, 'name' => $t->name, 'answers' => $t->answers])
                ->values()
                ->all(),
        ];
    }

    /** Turmas × assuntos mais respondidos; célula sem amostra mínima vem com value null (nunca zero). */
    private function heatmap(StudentUniverse $universe, int $subjectId, string $source, Collection $topics, int $minSample, float $goal): array
    {
        $columns = $topics->sortByDesc('answers')->take(self::HEATMAP_TOPICS)->values();
        if ($columns->isEmpty()) {
            return ['topics' => [], 'rows' => [], 'truncated' => false];
        }

        $cells = $this->topicAnswers($universe, null, $source)
            ->where('st.subject_id', $subjectId)
            ->whereIn('st.id', $columns->pluck('topic_id'))
            ->joinSub($universe->classMemberships(), 'cm', 'cm.student_id', '=', 'r.student_id')
            ->groupBy('cm.school_class_id', 'cm.class_name', 'st.id')
            ->select('cm.school_class_id', 'cm.class_name', 'st.id as topic_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->groupBy('school_class_id');

        $rows = $cells
            ->map(function (Collection $list, $classId) use ($columns, $minSample, $goal) {
                $byTopic = $list->keyBy('topic_id');

                return [
                    'school_class_id' => (int) $classId,
                    'name' => $list->first()->class_name,
                    'answers' => (int) $list->sum('answers'),
                    'cells' => $columns->map(function ($topic) use ($byTopic, $minSample, $goal) {
                        $cell = $byTopic->get($topic->topic_id);
                        $answers = (int) ($cell->answers ?? 0);
                        $value = $answers >= $minSample ? round($cell->correct / $answers * 100, 1) : null;

                        return [
                            'topic_id' => $topic->topic_id,
                            'value' => $value,
                            'answers' => $answers,
                            'below_goal' => $value !== null && $value < $goal,
                        ];
                    })->all(),
                ];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        return [
            'topics' => $columns->map(fn ($t) => ['topic_id' => $t->topic_id, 'name' => $t->name])->all(),
            'rows' => $rows->take(self::HEATMAP_CLASSES)->all(),
            'truncated' => $rows->count() > self::HEATMAP_CLASSES,
        ];
    }

    /** @return array<string, mixed> */
    private function errorItem(object $stats, ?object $question, Collection $options, Collection $marked): array
    {
        $answers = (int) $stats->answers;
        $byOption = $marked->pluck('total', 'option_id');
        $known = 0;

        $items = $options->values()->map(function ($option, $i) use ($byOption, $answers, &$known) {
            $count = (int) ($byOption[$option->id] ?? 0);
            $known += $count;

            return [
                'option_id' => (int) $option->id,
                'letter' => self::LETTERS[$i] ?? (string) ($i + 1),
                'text' => Str::limit($this->plain($option->option_text), 120),
                'is_correct' => (bool) $option->is_correct,
                'count' => $count,
                'pct' => round($count / $answers * 100, 1),
            ];
        });

        $distractor = $items->where('is_correct', false)->where('count', '>', 0)->sortByDesc('count')->first();
        $source = $question?->exam_title ?: ($question?->source_exam_name ?: 'Banco de questões');

        return [
            'question_id' => (int) $stats->question_id,
            'code' => '#Q-'.$stats->question_id,
            'source_label' => $source,
            'text' => Str::limit($this->plain($question?->question_text), 280),
            'answers' => $answers,
            'students' => (int) $stats->students,
            'error_rate' => round(($answers - (int) $stats->correct) / $answers * 100, 1),
            'options' => $items->all(),
            'other' => $answers - $known,
            'main_distractor' => $distractor ? ['option_id' => $distractor['option_id'], 'letter' => $distractor['letter'], 'pct' => $distractor['pct']] : null,
        ];
    }

    private function plain(?string $html): string
    {
        $text = html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], ' ', (string) $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(preg_replace('/\s+/u', ' ', $text));
    }

    /** Cache por tenant + escopo (turmas e disciplinas do professor) + filtros. */
    private function remember(string $name, BiAccessScope $scope, BiFilters $filters, array $extra, callable $compute): array
    {
        $key = 'bi:'.$name.':'.$scope->tenantId.':'.md5(json_encode([
            $scope->classIds,
            $scope->isTenantWide() ? null : $scope->userId,
            $filters->toArray(),
            $extra,
        ]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), $compute);
    }

    private function pct(int|float $part, int|float $total): ?float
    {
        return $total > 0 ? $part / $total * 100 : null;
    }

    private function round(?float $value): ?float
    {
        return $value === null ? null : round($value, 1);
    }
}
