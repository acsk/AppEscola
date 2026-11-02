<?php

namespace App\Services\Bi\Diagnosis;

use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiCriteria;
use App\Services\Bi\BiFilters;
use App\Services\Bi\Sources\StudentUniverse;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Perfis de aprendizagem e dedicação: aproveitamento (índice de Aprendizagem) × dias ativos por semana,
 * contra os limiares da escola. Classificação recalculada a cada período — não é rótulo permanente.
 */
class ProfileMatrixService
{
    public const QUADRANTS = [
        'A1' => ['label' => 'Alto desempenho', 'dedication' => 'alta dedicação', 'hint' => 'Manter acompanhamento e oferecer desafios progressivos.'],
        'A2' => ['label' => 'Alto desempenho', 'dedication' => 'baixa dedicação registrada', 'hint' => 'Investigar hábitos de estudo fora da plataforma e estimular continuidade.'],
        'B1' => ['label' => 'Baixo desempenho', 'dedication' => 'alta dedicação', 'hint' => 'Investigar lacunas de aprendizagem e oferecer reforço direcionado.'],
        'B2' => ['label' => 'Baixo desempenho', 'dedication' => 'baixa dedicação registrada', 'hint' => 'Acompanhamento individual e identificação de possíveis barreiras.'],
    ];

    public function __construct(private readonly DimensionCalculator $calculator)
    {
    }

    /** @return array<string, mixed> */
    public function build(BiAccessScope $scope, BiFilters $filters): array
    {
        $key = 'bi:profiles:'.$scope->tenantId.':'.BiCriteria::signature().':'.md5(json_encode([$scope->classIds, $filters->toArray()]));

        return Cache::remember($key, (int) config('bi.cache_ttl_seconds', 600), fn () => $this->compute($scope, $filters));
    }

    /** @return array<string, mixed> */
    private function compute(BiAccessScope $scope, BiFilters $filters): array
    {
        $universe = new StudentUniverse($scope, $filters);
        $students = $this->calculator->compute($universe, null)['students'];
        $goal = (float) config('bi.goal_pct', 70);
        $dedication = (float) config('bi.dedication_days_per_week', 3);
        $minAssessments = (int) config('bi.profile_min_assessments', 3);
        $minQuestions = (int) config('bi.profile_min_questions', 50);

        $ids = array_keys($students);
        $names = DB::table('students')->whereIn('id', $ids ?: [0])->pluck('name', 'id');
        $classes = $universe->classNamesByStudent($ids);

        $points = [];
        $unclassified = 0;
        foreach ($students as $id => $s) {
            $performance = $s[DimensionCalculator::LEARNING]['value'];
            if ($performance === null || $s['assessments'] < $minAssessments || $s['questions'] < $minQuestions) {
                $unclassified++;

                continue;
            }
            $quadrant = ($performance >= $goal ? 'A' : 'B').($s['active_days_per_week'] >= $dedication ? '1' : '2');
            $points[] = [
                'student_id' => $id,
                'name' => $names[$id] ?? 'Aluno',
                'classes' => $classes[$id] ?? [],
                'performance' => $performance,
                'dedication' => $s['active_days_per_week'],
                'questions' => $s['questions'],
                'assessments' => $s['assessments'],
                'quadrant' => $quadrant,
                'distance_pp' => round($performance - $goal, 1),
            ];
        }

        // Dentro do quadrante, maior afastamento da meta primeiro.
        usort($points, fn ($a, $b) => abs($b['distance_pp']) <=> abs($a['distance_pp']) ?: strnatcasecmp($a['name'], $b['name']));
        $counts = array_count_values(array_column($points, 'quadrant'));

        return [
            'meta' => [
                'period' => ['from' => $filters->from->toDateString(), 'to' => $filters->to->toDateString()],
                'filters' => $filters->toArray(),
                'criteria' => [
                    'goal_pct' => $goal,
                    'dedication_days_per_week' => $dedication,
                    'min_assessments' => $minAssessments,
                    'min_questions' => $minQuestions,
                ],
                'generated_at' => now(PracticePerformanceService::RANKING_TIMEZONE)->toIso8601String(),
            ],
            'summary' => ['total' => count($students), 'classified' => count($points), 'unclassified' => $unclassified],
            'quadrants' => array_map(
                fn (string $q) => ['key' => $q, 'count' => $counts[$q] ?? 0] + self::QUADRANTS[$q],
                array_keys(self::QUADRANTS),
            ),
            'points' => $points,
        ];
    }
}
