<?php

namespace App\Services\Bi\Interventions;

use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFilters;
use App\Services\Bi\MetricCatalog;
use App\Services\Bi\Sources\AnswerStream;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\StudentUniverse;
use Illuminate\Support\Carbon;

/**
 * Aproveitamento de alunos numa janela de datas, no alvo da intervenção: acerto no assunto (1ª tentativa,
 * simulados + banco); sem assunto, na disciplina; sem disciplina, média nas avaliações. Sem amostra mínima → null.
 */
class InterventionMeasure
{
    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AnswerStream $answers,
        private readonly AssessmentResults $assessments,
    ) {
    }

    /**
     * @param  list<int>  $studentIds
     * @return array<int, array{pct: float|null, n: int}>
     */
    public function measure(int $tenantId, array $studentIds, ?int $subjectId, ?int $topicId, Carbon $from, Carbon $to): array
    {
        $result = array_fill_keys($studentIds, ['pct' => null, 'n' => 0]);
        if ($studentIds === [] || $to->lt($from)) {
            return $result;
        }

        $universe = new StudentUniverse(BiAccessScope::system($tenantId), new BiFilters(from: $from->copy()->startOfDay(), to: $to->copy()->startOfDay(), subjectId: $subjectId));

        if ($subjectId === null && $topicId === null) {
            $min = (int) config('bi.min_student_results', 2);
            $this->assessments->rows($universe)->whereIn('student_id', $studentIds)->groupBy('student_id')
                ->each(function ($rows, $id) use (&$result, $min) {
                    $result[(int) $id] = ['pct' => $rows->count() >= $min ? round((float) $rows->avg('pct'), 1) : null, 'n' => $rows->count()];
                });

            return $result;
        }

        $min = (int) $this->catalog->definition('topics.mastery')['min_sample'];
        $this->answers->query($universe)
            ->whereIn('r.student_id', $studentIds)
            ->when($topicId !== null, fn ($q) => $q
                ->join('exam_question_topic as t', 't.exam_question_id', '=', 'r.question_id')
                ->where('t.subject_topic_id', $topicId))
            ->groupBy('r.student_id')
            ->select('r.student_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->each(function ($row) use (&$result, $min) {
                $n = (int) $row->answers;
                $result[(int) $row->student_id] = ['pct' => $n >= $min ? round($row->correct / $n * 100, 1) : null, 'n' => $n];
            });

        return $result;
    }
}
