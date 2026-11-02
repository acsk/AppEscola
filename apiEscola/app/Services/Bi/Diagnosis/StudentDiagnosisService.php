<?php

namespace App\Services\Bi\Diagnosis;

use App\Models\ExamType;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiCriteria;
use App\Services\Bi\BiFilters;
use App\Services\Bi\MetricCatalog;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\Bi\StudentSignals;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Diagnóstico pedagógico 360° de um aluno: três índices comparados com a turma e com o período anterior,
 * histórico mensal, domínio por assunto e recomendações por regra (explicáveis, sem gravar nada).
 */
class StudentDiagnosisService
{
    private const HISTORY_MONTHS = 8;

    private const DOMAIN_TOPICS = 5;

    private const RECOMMENDATIONS = 5;

    private const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    private const DIMENSIONS = [
        DimensionCalculator::LEARNING => 'index.learning',
        DimensionCalculator::ENGAGEMENT => 'index.engagement',
        DimensionCalculator::PREPARATION => 'index.preparation',
    ];

    public function __construct(
        private readonly DimensionCalculator $calculator,
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly StudentSignals $signals,
    ) {
    }

    /** Turma de referência do aluno no recorte (a 1ª em ordem alfabética), ou null se ele não está no recorte. */
    public function referenceClass(BiAccessScope $scope, BiFilters $filters, int $studentId): ?object
    {
        return (new StudentUniverse($scope, $filters))->classMemberships()
            ->where('m.student_id', $studentId)
            ->orderBy('class_name')
            ->first();
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters, int $studentId, object $class): array
    {
        $key = 'bi:diagnosis:'.$scope->tenantId.':'.BiCriteria::signature().':'.md5(json_encode([$scope->classIds, $filters->toArray(), $studentId]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), fn () => $this->compute($scope, $filters, $studentId, $class));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters, int $studentId, object $class): array
    {
        $classFilters = $filters->withSchoolClass((int) $class->school_class_id);
        $previousFilters = $classFilters->previous();
        $course = DB::table('school_classes as sc')
            ->leftJoin('courses as c', 'c.id', '=', 'sc.course_id')
            ->where('sc.id', $class->school_class_id)
            ->first(['c.name as course', 'c.target_exam_type_id']);
        $examTypeId = $course?->target_exam_type_id ? (int) $course->target_exam_type_id : null;

        $universe = new StudentUniverse($scope, $classFilters);
        $now = $this->calculator->compute($universe, $examTypeId);
        $before = $this->calculator->compute(new StudentUniverse($scope, $previousFilters), $examTypeId);
        $mine = $now['students'][$studentId];
        $prior = $before['students'][$studentId] ?? null;
        $goal = (float) config('bi.goal_pct', 70);

        $dimensions = [];
        foreach (self::DIMENSIONS as $dimension => $metricKey) {
            $current = $mine[$dimension];
            $sufficient = count(array_filter($current['components'], fn ($c) => $c['sufficient']));
            $previous = $prior[$dimension] ?? null;
            $previousSufficient = $previous ? count(array_filter($previous['components'], fn ($c) => $c['sufficient'])) : 0;

            $dimensions[$dimension] = $this->catalog->make($metricKey, $current['value'], $sufficient, [], $previous['value'] ?? null, $previousSufficient) + [
                'class_avg' => DimensionCalculator::average($now['students'], $dimension),
                'components' => $current['components'],
            ];
        }

        $studentTopics = $now['topics']->where('student_id', $studentId);
        $rows = $this->assessments->rows($universe);
        $reasons = $this->signals->supportReasons($universe, $rows, $this->signals->evolution($rows))[$studentId] ?? [];

        return [
            'meta' => [
                'period' => ['from' => $classFilters->from->toDateString(), 'to' => $classFilters->to->toDateString()],
                'previous_period' => ['from' => $previousFilters->from->toDateString(), 'to' => $previousFilters->to->toDateString()],
                'goal_pct' => $goal,
                'min_topic_answers' => (int) $this->catalog->definition('topics.mastery')['min_sample'],
                'exam_type' => $examTypeId ? ['id' => $examTypeId, 'label' => ExamType::query()->whereKey($examTypeId)->value('label')] : null,
                'priorities_provisional' => $now['priorities']['provisional'],
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'student' => [
                'id' => $studentId,
                'name' => DB::table('students')->where('id', $studentId)->value('name'),
                'school_class' => ['id' => (int) $class->school_class_id, 'name' => $class->class_name],
                'course' => $course?->course,
                'reasons' => $reasons,
                'active_days_per_week' => $mine['active_days_per_week'],
                'questions' => $mine['questions'],
                'assessments' => $mine['assessments'],
                'assessments_avg' => $mine['assessments_avg'],
            ],
            'class' => ['students' => count($now['students'])],
            'dimensions' => $dimensions,
            'highlight' => $this->highlight($studentTopics, $goal),
            'history' => $this->history($scope, $classFilters, $studentId, $examTypeId),
            'domain' => $this->domain($now['topics'], $studentId, $now['priorities']['weights'], $goal),
            'recommendations' => $this->recommendations($mine, $dimensions, $studentTopics, $now['priorities']['weights'], $goal),
        ];
    }

    /** Disciplina mais fraca do aluno e seus dois assuntos com menor acerto (linha de alerta do card). */
    private function highlight(Collection $topics, float $goal): ?array
    {
        $min = (int) $this->catalog->definition('topics.mastery')['min_sample'];
        $subjects = $topics->groupBy('subject_id')
            ->map(fn (Collection $list) => (object) [
                'subject' => $list->first()->subject,
                'answers' => $list->sum('answers'),
                'accuracy' => $list->sum('answers') ? $list->sum('correct') / $list->sum('answers') * 100 : null,
                'topics' => $list->filter(fn ($t) => $t->answers >= $min)->sortBy(fn ($t) => $t->correct / $t->answers)->take(2)->pluck('topic')->values()->all(),
            ])
            ->filter(fn ($s) => $s->answers >= $min && $s->accuracy < $goal)
            ->sortBy('accuracy');

        $worst = $subjects->first();

        return $worst ? ['subject' => $worst->subject, 'accuracy' => round($worst->accuracy, 1), 'topics' => $worst->topics] : null;
    }

    /** Índices mês a mês (até 8 meses terminando no fim do período); mês sem amostra fica null. */
    private function history(BiAccessScope $scope, BiFilters $filters, int $studentId, ?int $examTypeId): array
    {
        $end = $filters->to->copy();
        $points = [];
        for ($i = self::HISTORY_MONTHS - 1; $i >= 0; $i--) {
            $month = $end->copy()->startOfMonth()->subMonthsNoOverflow($i);
            $monthEnd = $month->copy()->endOfMonth()->startOfDay();
            $monthFilters = new BiFilters(
                from: $month,
                to: $monthEnd->greaterThan($end) ? $end->copy() : $monthEnd,
                schoolYear: $filters->schoolYear,
                courseId: $filters->courseId,
                schoolClassId: $filters->schoolClassId,
                subjectId: $filters->subjectId,
                teacherId: $filters->teacherId,
                examTypeId: $filters->examTypeId,
                modality: $filters->modality,
            );
            $student = $this->calculator->compute(new StudentUniverse($scope, $monthFilters), $examTypeId)['students'][$studentId] ?? null;
            $points[] = [
                'month' => $month->format('Y-m'),
                'label' => self::MONTHS[$month->month - 1],
            ] + array_map(fn (string $d) => $student[$d]['value'] ?? null, array_combine(array_keys(self::DIMENSIONS), array_keys(self::DIMENSIONS)));
        }

        return $points;
    }

    /**
     * Disciplinas do aluno × até 5 assuntos (prioritários por peso; senão os mais respondidos pela turma),
     * com o acerto do aluno e da turma. Célula sem amostra mínima fica null.
     */
    private function domain(Collection $topics, int $studentId, array $weights, float $goal): array
    {
        $min = (int) $this->catalog->definition('topics.mastery')['min_sample'];
        $classByTopic = $topics->groupBy('topic_id');
        $mine = $topics->where('student_id', $studentId)->keyBy('topic_id');

        return $mine->groupBy('subject_id')
            ->map(function (Collection $list) use ($classByTopic, $mine, $weights, $min, $goal) {
                $subjectId = $list->first()->subject_id;
                $candidates = $classByTopic->filter(fn ($rows) => $rows->first()->subject_id === $subjectId)
                    ->map(fn ($rows, $topicId) => (object) [
                        'topic_id' => (int) $topicId,
                        'name' => $rows->first()->topic,
                        'weight' => $weights[$topicId] ?? 0,
                        'class_answers' => $rows->sum('answers'),
                        'class_correct' => $rows->sum('correct'),
                    ])
                    ->sortBy([['weight', 'desc'], ['class_answers', 'desc']])
                    ->take(self::DOMAIN_TOPICS)
                    ->values();

                return [
                    'subject_id' => $subjectId,
                    'name' => $list->first()->subject,
                    'topics' => $candidates->map(function ($t) use ($mine, $min, $goal) {
                        $own = $mine->get($t->topic_id);
                        $value = $own && $own->answers >= $min ? round($own->correct / $own->answers * 100, 1) : null;

                        return [
                            'topic_id' => $t->topic_id,
                            'name' => $t->name,
                            'weight' => $t->weight,
                            'value' => $value,
                            'answers' => (int) ($own->answers ?? 0),
                            'below_goal' => $value !== null && $value < $goal,
                            'class_value' => $t->class_answers >= $min ? round($t->class_correct / $t->class_answers * 100, 1) : null,
                        ];
                    })->all(),
                ];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /** Recomendações por regra, cada uma com o motivo (dado) que a gerou. */
    private function recommendations(array $mine, array $dimensions, Collection $topics, array $weights, float $goal): array
    {
        $min = (int) $this->catalog->definition('topics.mastery')['min_sample'];
        $items = [];

        $weak = $topics->filter(fn ($t) => $t->answers >= $min && $t->correct / $t->answers * 100 < $goal)
            ->sortBy([fn ($a, $b) => ($weights[$b->topic_id] ?? 0) <=> ($weights[$a->topic_id] ?? 0), fn ($a, $b) => $a->correct / $a->answers <=> $b->correct / $b->answers])
            ->take(2);
        foreach ($weak as $t) {
            $items[] = [
                'type' => 'practice_list',
                'category' => 'Atividade',
                'title' => "Lista direcionada: {$t->topic}",
                'reason' => sprintf('%s %s%% em %d respostas · meta %s%%', $t->topic, $this->fmt($t->correct / $t->answers * 100), $t->answers, $this->fmt($goal)),
            ];
        }

        $attendance = collect($dimensions[DimensionCalculator::ENGAGEMENT]['components'])->firstWhere('key', 'attendance');
        if ($attendance && $attendance['sufficient'] && $attendance['value'] < (float) config('bi.attendance_alert_below', 75)) {
            $items[] = [
                'type' => 'attendance',
                'category' => 'Acompanhamento',
                'title' => 'Conversar sobre a frequência',
                'reason' => sprintf('frequência %s%% em %d chamadas', $this->fmt($attendance['value']), $attendance['n']),
            ];
        }

        $target = (float) config('bi.dedication_days_per_week', 3);
        if ($mine['active_days_per_week'] < $target) {
            $items[] = [
                'type' => 'routine',
                'category' => 'Rotina',
                'title' => 'Combinar uma rotina de estudo na plataforma',
                'reason' => sprintf('%s dias ativos/semana · referência %s', $this->fmt($mine['active_days_per_week']), $this->fmt($target)),
            ];
        }

        $learning = $dimensions[DimensionCalculator::LEARNING];
        if ($learning['delta'] !== null && $learning['delta'] <= -(float) config('bi.evolution_threshold_pp', 5) && $weak->isNotEmpty()) {
            $items[] = [
                'type' => 'assessment',
                'category' => 'Avaliação',
                'title' => 'Simulado diagnóstico de '.$weak->first()->subject,
                'reason' => sprintf('Aprendizagem caiu %s pts vs. período anterior', $this->fmt(abs($learning['delta']))),
            ];
        }

        $strong = $topics->groupBy('subject_id')
            ->filter(fn ($list) => $list->sum('answers') >= $min && $list->sum('correct') / $list->sum('answers') * 100 >= $goal)
            ->map(fn ($list) => $list->first()->subject)
            ->values();
        if ($strong->isNotEmpty()) {
            $items[] = [
                'type' => 'keep',
                'category' => 'Acompanhamento',
                'title' => 'Manter ritmo em '.$strong->take(2)->join(' e '),
                'reason' => 'acima da meta de '.$this->fmt($goal).'%',
            ];
        }

        return array_slice($items, 0, self::RECOMMENDATIONS);
    }

    private function fmt(float $value): string
    {
        return str_replace('.', ',', (string) round($value, 1));
    }
}
