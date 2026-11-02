<?php

namespace App\Services\Bi;

use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\AttendanceRecords;
use App\Services\Bi\Sources\PracticeFirstAttempts;
use App\Services\Bi\Sources\StudentUniverse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Uma linha por aluno do recorte: médias por modalidade, banco, frequência, evolução e motivos de atenção.
 * Valor individual sem amostra mínima sai null (com o n), nunca zero. Em atenção primeiro, depois por nome.
 */
class StudentRoster
{
    public function __construct(
        private readonly MetricCatalog $catalog,
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
        private readonly AttendanceRecords $attendance,
        private readonly StudentSignals $signals,
    ) {
    }

    /** @return array{min_student_results: int, min_practice_answers: int, min_attendance_records: int} */
    public function thresholds(): array
    {
        return [
            'min_student_results' => (int) config('bi.min_student_results', 2),
            'min_practice_answers' => (int) $this->catalog->definition('practice.first_accuracy')['min_sample'],
            'min_attendance_records' => (int) $this->catalog->definition('attendance.rate')['min_sample'],
        ];
    }

    /** @return list<array<string, mixed>> */
    public function build(StudentUniverse $universe): array
    {
        ['min_student_results' => $minResults, 'min_practice_answers' => $minPractice, 'min_attendance_records' => $minAttendance] = $this->thresholds();

        $rows = $this->assessments->rows($universe);
        $evolution = $this->signals->evolution($rows);
        $reasons = $this->signals->supportReasons($universe, $rows, $evolution);
        $practice = $this->practice->byStudent($universe);
        $attendance = $this->attendance->byStudent($universe);

        $ids = DB::query()->fromSub($universe->query(), 'u')->pluck('student_id')->map(fn ($id) => (int) $id);
        $names = DB::table('students')->whereIn('id', $ids->all() ?: [0])->pluck('name', 'id');
        $classes = $universe->classNamesByStudent($ids->all());
        $byStudent = $rows->groupBy('student_id');

        $avg = function (?Collection $results, string $modality) use ($minResults) {
            $list = ($results ?? collect())->where('modality', $modality);

            return ['value' => $list->count() >= $minResults ? round((float) $list->avg('pct'), 1) : null, 'n' => $list->count()];
        };

        return $ids->map(function (int $id) use ($names, $classes, $byStudent, $avg, $practice, $attendance, $evolution, $reasons, $minPractice, $minAttendance) {
            $p = $practice->get($id);
            $a = $attendance->get($id);

            return [
                'student_id' => $id,
                'name' => $names[$id] ?? 'Aluno',
                'classes' => $classes[$id] ?? [],
                'online' => $avg($byStudent->get($id), AssessmentResults::ONLINE),
                'presencial' => $avg($byStudent->get($id), AssessmentResults::PRESENCIAL),
                'practice' => [
                    'value' => $p && $p->answers >= $minPractice ? round($p->correct / $p->answers * 100, 1) : null,
                    'n' => (int) ($p->answers ?? 0),
                ],
                'attendance' => [
                    'value' => $a && $a->records >= $minAttendance ? round($a->present / $a->records * 100, 1) : null,
                    'n' => (int) ($a->records ?? 0),
                ],
                'evolution_pp' => isset($evolution[$id]) ? round($evolution[$id], 1) : null,
                'reasons' => $reasons[$id] ?? [],
            ];
        })
            ->sortBy([fn ($x, $y) => count($y['reasons']) <=> count($x['reasons']), fn ($x, $y) => strnatcasecmp($x['name'], $y['name'])])
            ->values()
            ->all();
    }
}
