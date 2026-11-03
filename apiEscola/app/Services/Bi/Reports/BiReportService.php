<?php

namespace App\Services\Bi\Reports;

use App\Models\ExamType;
use App\Models\Subject;
use App\Services\Bi\AssessmentAnalyticsService;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Services\Bi\ClassAnalyticsService;
use App\Services\Bi\Diagnosis\StudentDiagnosisService;
use App\Services\Bi\EngagementService;
use App\Services\Bi\Interventions\InterventionService;
use App\Services\Bi\OverviewService;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\Bi\StudentEvolutionService;
use App\Services\Bi\StudentSignals;
use App\Services\Bi\SubjectAnalyticsService;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Facades\DB;

/**
 * Dados dos relatórios do BI. Reaproveita os serviços das telas (os números batem) e aplica as regras de LGPD:
 * Institucional e Resultados só com agregados, e grupos com menos de `bi.report_min_group` alunos ocultos.
 */
class BiReportService
{
    public const INDIVIDUAL = 'individual';

    public const CLASS_REPORT = 'class';

    public const SUBJECT = 'subject';

    public const INSTITUTIONAL = 'institutional';

    public const RESULTS = 'results';

    public const TYPES = [self::INDIVIDUAL, self::CLASS_REPORT, self::SUBJECT, self::INSTITUTIONAL, self::RESULTS];

    /** Relatórios só com agregados (sem nomes), restritos à coordenação. */
    public const AGGREGATED = [self::INSTITUTIONAL, self::RESULTS];

    public function __construct(
        private readonly BiFeatureGate $gate,
        private readonly OverviewService $overview,
        private readonly AssessmentAnalyticsService $assessmentsAnalytics,
        private readonly ClassAnalyticsService $classes,
        private readonly SubjectAnalyticsService $subjects,
        private readonly StudentEvolutionService $evolution,
        private readonly StudentDiagnosisService $diagnosis,
        private readonly EngagementService $engagement,
        private readonly InterventionService $interventions,
        private readonly AssessmentResults $assessments,
        private readonly AnswerStream $answers,
        private readonly StudentSignals $signals,
    ) {
    }

    public static function minGroup(): int
    {
        return (int) config('bi.report_min_group', 10);
    }

    /** @return array<string, mixed> */
    public function individual(BiAccessScope $scope, BiFilters $filters, int $studentId): array
    {
        $advanced = $this->advanced($scope);
        $class = $advanced ? $this->diagnosis->referenceClass($scope, $filters, $studentId) : null;

        return $this->envelope(self::INDIVIDUAL, $filters, [
            'evolution' => $this->evolution->evolution($scope, $filters, $studentId),
            'diagnosis' => $class ? $this->diagnosis->build($scope, $filters, $studentId, $class) : null,
            'interventions' => $advanced
                ? $this->interventions->visible($scope)
                    ->whereHas('students', fn ($q) => $q->where('student_id', $studentId))
                    ->with(['students.student:id,name', 'responsible:id,name', 'schoolClass:id,name', 'topic:id,name', 'subject:id,name'])
                    ->orderByDesc('starts_on')
                    ->limit(20)
                    ->get()
                    ->map(fn ($i) => $this->interventions->show($scope, $i))
                    ->map(fn ($i) => array_intersect_key($i, array_flip(['code', 'title', 'type_label', 'status', 'reason', 'target', 'starts_on', 'reassess_on', 'students', 'responsible'])))
                    ->all()
                : [],
        ]);
    }

    /** @return array<string, mixed> */
    public function classReport(BiAccessScope $scope, BiFilters $filters, int $schoolClassId): array
    {
        return $this->envelope(self::CLASS_REPORT, $filters, [
            'overview' => $this->overview->build($scope, $filters->withSchoolClass($schoolClassId)),
            'detail' => $this->classes->detail($scope, $filters, $schoolClassId),
        ]);
    }

    /** @return array<string, mixed> */
    public function subjectReport(BiAccessScope $scope, BiFilters $filters, Subject $subject): array
    {
        return $this->envelope(self::SUBJECT, $filters, [
            'analytics' => $this->subjects->build($scope, $filters, $subject, AnswerStream::SOURCE_BOTH),
        ]);
    }

    /** Agregados da escola (sem nomes); turmas com menos alunos que o mínimo ficam ocultas. */
    public function institutional(BiAccessScope $scope, BiFilters $filters): array
    {
        $this->assertGroupSize($scope, $filters);
        $min = self::minGroup();

        $overview = $this->overview->build($scope, $filters);
        unset($overview['needs_support']['items']);
        $classes = $this->classes->compare($scope, $filters);
        $classes['items'] = array_map(function ($c) use ($min) {
            $hidden = ($c['metrics']['students']['value'] ?? 0) < $min;

            return $hidden ? ['name' => $c['name'], 'course' => $c['course'], 'suppressed' => true] : $c + ['suppressed' => false];
        }, $classes['items']);

        $engagement = null;
        $interventions = null;
        if ($this->advanced($scope)) {
            $engagement = $this->engagement->build($scope, $filters);
            unset($engagement['lowest']);
            $interventions = [
                'summary' => $this->interventions->summary($scope, $filters),
                'effectiveness' => $this->interventions->effectiveness($scope, $filters),
            ];
        }

        $assessments = $this->assessmentsAnalytics->overview($scope, $filters);

        return $this->envelope(self::INSTITUTIONAL, $filters, [
            'overview' => $overview,
            'assessments' => ['metrics' => $assessments['metrics'], 'monthly' => $assessments['monthly'], 'total' => $assessments['items']['total']],
            'classes' => $classes,
            'engagement' => $engagement,
            'interventions' => $interventions,
        ]);
    }

    /**
     * Resultados do período para campanhas: só agregados verificáveis, com metodologia.
     * "Início × fim" = 1ª metade × 2ª metade do período.
     */
    public function results(BiAccessScope $scope, BiFilters $filters): array
    {
        $this->assertGroupSize($scope, $filters);
        $min = self::minGroup();
        $universe = new StudentUniverse($scope, $filters);
        $rows = $this->assessments->rows($universe);
        $evolution = $this->signals->evolution($rows);
        $threshold = (float) config('bi.evolution_threshold_pp', 5);
        $active = $universe->count();
        $participants = $rows->where('modality', AssessmentResults::ONLINE)->pluck('student_id')->unique()->count();

        $half = intdiv($filters->days(), 2);
        $first = $this->period($filters, $filters->from->copy(), $filters->from->copy()->addDays(max(0, $half - 1)));
        $second = $this->period($filters, $filters->from->copy()->addDays($half), $filters->to->copy());
        $bySubject = fn (BiFilters $f) => $this->answers->query(new StudentUniverse($scope, $f))
            ->groupBy('r.subject_id')
            ->select('r.subject_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->selectRaw('COUNT(DISTINCT r.student_id) as students')
            ->get()
            ->keyBy('subject_id');
        $start = $bySubject($first);
        $end = $bySubject($second);
        $names = Subject::query()->whereIn('id', $start->keys()->merge($end->keys())->unique()->all() ?: [0])->pluck('name', 'id');
        $subjects = $names->map(function ($name, $id) use ($start, $end, $min) {
            $a = $start->get($id);
            $b = $end->get($id);
            $ok = $a && $b && $a->students >= $min && $b->students >= $min;

            return [
                'subject_id' => (int) $id,
                'name' => $name,
                'suppressed' => ! $ok,
                'start' => $ok ? round($a->correct / $a->answers * 100, 1) : null,
                'end' => $ok ? round($b->correct / $b->answers * 100, 1) : null,
                'delta_pp' => $ok ? round($b->correct / $b->answers * 100 - $a->correct / $a->answers * 100, 1) : null,
            ];
        })->sortBy('name')->values()->all();

        $years = range((int) $filters->from->year, (int) $filters->to->year);
        $outcomes = DB::table('student_exam_outcomes')
            ->where('tenant_id', $scope->tenantId)
            ->whereNull('deleted_at')
            ->whereIn('year', $years)
            ->whereIn('result', ['approved', 'classified'])
            ->whereIn('student_id', $universe->ids() ?: [0])
            ->get(['exam_type_id', 'exam_name', 'result', 'consent_publish']);
        $types = ExamType::query()->pluck('label', 'id');

        $evolutionValues = array_values($evolution);

        return $this->envelope(self::RESULTS, $filters, [
            'sample' => ['active_students' => $active, 'students_with_evolution' => count($evolutionValues), 'min_group' => $min],
            'headline' => [
                'evolution_pp' => count($evolutionValues) >= $min ? round(array_sum($evolutionValues) / count($evolutionValues), 1) : null,
                'improving_pct' => count($evolutionValues) >= $min ? round(count(array_filter($evolutionValues, fn ($v) => $v >= $threshold)) / count($evolutionValues) * 100, 1) : null,
                'assessments_taken' => $rows->count(),
                'online_exams' => $rows->where('modality', AssessmentResults::ONLINE)->pluck('assessment_id')->unique()->count(),
                'questions_answered' => $this->answers->query($universe)->count(),
                'participation_pct' => $active >= $min ? round($participants / $active * 100, 1) : null,
            ],
            'halves' => [
                'start' => ['from' => $first->from->toDateString(), 'to' => $first->to->toDateString()],
                'end' => ['from' => $second->from->toDateString(), 'to' => $second->to->toDateString()],
            ],
            'monthly' => $this->assessments->monthly($rows, $filters),
            'subjects' => $subjects,
            'interventions' => $this->advanced($scope) ? $this->interventions->effectiveness($scope, $filters) : null,
            'approvals' => [
                'total' => $outcomes->count(),
                'with_consent' => $outcomes->where('consent_publish', true)->count(),
                'by_exam' => $outcomes->groupBy(fn ($o) => $o->exam_type_id ? ($types[$o->exam_type_id] ?? $o->exam_name) : $o->exam_name)
                    ->map(fn ($list, $label) => ['label' => $label, 'approved' => $list->where('result', 'approved')->count(), 'classified' => $list->where('result', 'classified')->count()])
                    ->values()
                    ->all(),
            ],
            'methodology' => [
                'Evolução: para cada aluno, média do último terço menos a do primeiro terço das avaliações comparáveis (mesma modalidade e concurso), com ao menos '.config('bi.min_student_results', 2).' avaliações; depois a média entre os alunos.',
                'Evolução positiva: variação de '.str_replace('.', ',', (string) $threshold).' p.p. ou mais.',
                'Por disciplina: acerto na 1ª tentativa (simulados online + banco) na 1ª metade × 2ª metade do período.',
                'Questões resolvidas: respostas na 1ª tentativa (retentativas não contam).',
                'Grupos com menos de '.$min.' alunos são ocultados. Nenhum aluno é identificado.',
                'Aprovações: só as cadastradas com evidência pela escola; uso em divulgação depende do consentimento registrado.',
            ],
        ]);
    }

    public function canSeeAggregated(BiAccessScope $scope): bool
    {
        return $scope->isTenantWide();
    }

    /** Envelope comum: tipo, período, filtros e geração. */
    private function envelope(string $type, BiFilters $filters, array $data): array
    {
        return [
            'report' => $type,
            'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
            'filters' => $filters->toArray(),
            'goal_pct' => (float) config('bi.goal_pct', 70),
            'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
        ] + $data;
    }

    private function assertGroupSize(BiAccessScope $scope, BiFilters $filters): void
    {
        if ((new StudentUniverse($scope, $filters))->count() < self::minGroup()) {
            throw new ReportSampleTooSmall(self::minGroup());
        }
    }

    private function advanced(BiAccessScope $scope): bool
    {
        return $this->gate->allows($this->gate->settings($scope->tenantId), BiFeatureGate::PLAN_ADVANCED);
    }

    private function period(BiFilters $base, $from, $to): BiFilters
    {
        return new BiFilters(
            from: $from,
            to: $to,
            schoolYear: $base->schoolYear,
            courseId: $base->courseId,
            schoolClassId: $base->schoolClassId,
            subjectId: $base->subjectId,
            teacherId: $base->teacherId,
            examTypeId: $base->examTypeId,
            modality: $base->modality,
        );
    }
}
