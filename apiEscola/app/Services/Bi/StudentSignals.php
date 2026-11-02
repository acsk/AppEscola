<?php

namespace App\Services\Bi;

use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\StudentUniverse;
use Illuminate\Support\Collection;

/** Sinais por aluno usados em mais de uma tela: evolução em avaliações comparáveis e motivos de atenção. */
class StudentSignals
{
    public function __construct(private readonly AttendanceRecords $attendance)
    {
    }

    /**
     * Evolução (p.p.) de cada aluno com ao menos 2 avaliações comparáveis (mesma modalidade e concurso):
     * média do último terço menos média do primeiro terço, depois a média entre os grupos do aluno.
     *
     * @return array<int, float>
     */
    public function evolution(Collection $rows): array
    {
        $minResults = (int) config('bi.min_student_results', 2);
        $byStudent = [];

        $rows->groupBy(fn ($r) => $r->student_id.'|'.$r->modality.'|'.($r->exam_type_id ?? 0))
            ->each(function (Collection $group) use (&$byStudent, $minResults) {
                if ($group->count() < $minResults) {
                    return;
                }
                $values = $group->sortBy('at')->pluck('pct')->values();
                $third = (int) max(1, floor($values->count() / 3));
                $diff = $values->slice(-$third)->avg() - $values->take($third)->avg();
                $byStudent[$group->first()->student_id][] = $diff;
            });

        return array_map(fn (array $diffs) => round(array_sum($diffs) / count($diffs), 2), $byStudent);
    }

    /**
     * Motivos de atenção por aluno.
     *
     * @param  array<int, float>  $evolution
     * @return array<int, list<array{code: string, label: string, value: float, detail: string}>>
     */
    public function supportReasons(StudentUniverse $universe, Collection $rows, array $evolution): array
    {
        $goal = (float) config('bi.goal_pct', 70);
        $threshold = (float) config('bi.evolution_threshold_pp', 5);
        $attendanceBelow = (float) config('bi.attendance_alert_below', 75);
        $minResults = (int) config('bi.min_student_results', 2);
        $reasons = [];

        $rows->groupBy('student_id')->each(function (Collection $results, $studentId) use (&$reasons, $goal, $minResults) {
            $avg = (float) $results->avg('pct');
            if ($results->count() >= $minResults && $avg < $goal) {
                $reasons[(int) $studentId][] = [
                    'code' => 'below_goal',
                    'label' => 'Aproveitamento abaixo da meta',
                    'value' => round($avg, 1),
                    'detail' => sprintf('%s%% · meta %s%%', $this->fmt($avg), $this->fmt($goal)),
                ];
            }
        });

        foreach ($evolution as $studentId => $pp) {
            if ($pp <= -$threshold) {
                $reasons[$studentId][] = [
                    'code' => 'declining',
                    'label' => 'Queda em avaliações comparáveis',
                    'value' => $pp,
                    'detail' => sprintf('%s p.p. no período', $this->fmt($pp)),
                ];
            }
        }

        $this->attendance->byStudent($universe)->each(function ($row, $studentId) use (&$reasons, $attendanceBelow) {
            if ((int) $row->records < 4) {
                return;
            }
            $rate = $row->present / $row->records * 100;
            if ($rate < $attendanceBelow) {
                $reasons[(int) $studentId][] = [
                    'code' => 'low_attendance',
                    'label' => 'Frequência baixa',
                    'value' => round($rate, 1),
                    'detail' => sprintf('%s%% em %d chamadas', $this->fmt($rate), $row->records),
                ];
            }
        });

        return $reasons;
    }

    private function fmt(float $value): string
    {
        return str_replace('.', ',', (string) round($value, 1));
    }
}
