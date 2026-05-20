<?php

namespace App\Services;

use App\Models\Student;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StudentPerformanceService
{
    /**
     * @return array{
     *   student_id: int,
     *   months: int,
     *   overview: array<string, mixed>,
     *   by_subject: array<int, array<string, mixed>>,
     *   monthly_evolution: array<int, array<string, mixed>>
     * }
     */
    public function build(Student $student, int $months = 6, ?int $subjectId = null): array
    {
        $months = max(1, min(24, $months));

        $rows = $this->fetchCompletedAttempts($student->id, $subjectId);

        $monthKeys = $this->monthKeys($months);
        $bySubject = $this->aggregateBySubject($rows);
        $monthlyEvolution = $this->aggregateMonthly($rows, $monthKeys);
        $overview = $this->buildOverview($rows, $bySubject, $monthKeys);

        return [
            'student_id' => $student->id,
            'months' => $months,
            'overview' => $overview,
            'by_subject' => array_values($bySubject),
            'monthly_evolution' => $monthlyEvolution,
        ];
    }

    /**
     * @return Collection<int, object{
     *   attempt_id: int,
     *   percentage: float,
     *   score: ?float,
     *   max_score: ?float,
     *   finished_at: string,
     *   exam_id: int,
     *   exam_title: string,
     *   passing_score: ?float,
     *   subject_id: ?int,
     *   subject_name: ?string,
     *   subject_icon: ?string,
     *   subject_color: ?string
     * }>
     */
    private function fetchCompletedAttempts(int $studentId, ?int $subjectId): Collection
    {
        $query = DB::table('exam_attempts')
            ->join('exam_attempt_statuses', 'exam_attempts.attempt_status_id', '=', 'exam_attempt_statuses.id')
            ->join('exams', 'exam_attempts.exam_id', '=', 'exams.id')
            ->leftJoin('subjects', 'exams.subject_id', '=', 'subjects.id')
            ->where('exam_attempts.student_id', $studentId)
            ->where('exam_attempt_statuses.slug', 'completed')
            ->whereNotNull('exam_attempts.percentage')
            ->whereNotNull('exam_attempts.finished_at')
            ->whereNull('exam_attempts.deleted_at')
            ->whereNull('exams.deleted_at')
            ->select([
                'exam_attempts.id as attempt_id',
                'exam_attempts.percentage',
                'exam_attempts.score',
                'exam_attempts.max_score',
                'exam_attempts.finished_at',
                'exams.id as exam_id',
                'exams.title as exam_title',
                'exams.passing_score',
                'exams.subject_id',
                'subjects.name as subject_name',
                'subjects.icon as subject_icon',
                'subjects.color as subject_color',
            ])
            ->orderBy('exam_attempts.finished_at');

        if ($subjectId !== null) {
            $query->where('exams.subject_id', $subjectId);
        }

        return $query->get()->map(function ($row) {
            $row->percentage = round((float) $row->percentage, 1);
            $row->score = $row->score !== null ? round((float) $row->score, 2) : null;
            $row->max_score = $row->max_score !== null ? round((float) $row->max_score, 2) : null;
            $row->passing_score = $row->passing_score !== null ? round((float) $row->passing_score, 1) : null;

            return $row;
        });
    }

    /**
     * @param  Collection<int, object>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function aggregateBySubject(Collection $rows): array
    {
        $grouped = [];

        foreach ($rows as $row) {
            $key = $row->subject_id !== null ? (string) $row->subject_id : 'general';

            if (! isset($grouped[$key])) {
                $grouped[$key] = [
                    'subject_id' => $row->subject_id !== null ? (int) $row->subject_id : null,
                    'subject' => $row->subject_id !== null
                        ? [
                            'id' => (int) $row->subject_id,
                            'name' => (string) $row->subject_name,
                            'icon' => $row->subject_icon,
                            'color' => $row->subject_color ?? '#7C3AED',
                        ]
                        : [
                            'id' => null,
                            'name' => 'Geral',
                            'icon' => 'chart-bar',
                            'color' => '#6B7280',
                        ],
                    'attempts_count' => 0,
                    'avg_percentage' => null,
                    'latest_percentage' => null,
                    'latest_finished_at' => null,
                    'passing_score_avg' => null,
                    'month_change' => null,
                    '_percentages' => [],
                    '_passing' => [],
                    '_by_month' => [],
                ];
            }

            $grouped[$key]['attempts_count']++;
            $grouped[$key]['_percentages'][] = (float) $row->percentage;

            if ($row->passing_score !== null) {
                $grouped[$key]['_passing'][] = (float) $row->passing_score;
            }

            $monthKey = Carbon::parse($row->finished_at)->format('Y-m');
            $grouped[$key]['_by_month'][$monthKey][] = (float) $row->percentage;

            $finishedAt = Carbon::parse($row->finished_at);
            if (
                $grouped[$key]['latest_finished_at'] === null
                || $finishedAt->gt(Carbon::parse($grouped[$key]['latest_finished_at']))
            ) {
                $grouped[$key]['latest_finished_at'] = $finishedAt->toISOString();
                $grouped[$key]['latest_percentage'] = (float) $row->percentage;
            }
        }

        $currentMonth = now()->format('Y-m');
        $previousMonth = now()->subMonth()->format('Y-m');

        foreach ($grouped as &$item) {
            $percentages = $item['_percentages'];
            $item['avg_percentage'] = count($percentages) > 0
                ? round(array_sum($percentages) / count($percentages), 1)
                : null;

            $passing = $item['_passing'];
            $item['passing_score_avg'] = count($passing) > 0
                ? round(array_sum($passing) / count($passing), 1)
                : null;

            $currentAvg = $this->avgFromMonthBucket($item['_by_month'], $currentMonth);
            $previousAvg = $this->avgFromMonthBucket($item['_by_month'], $previousMonth);

            $item['month_change'] = ($currentAvg !== null && $previousAvg !== null)
                ? round($currentAvg - $previousAvg, 1)
                : null;

            unset($item['_percentages'], $item['_passing'], $item['_by_month']);
        }
        unset($item);

        usort($grouped, fn ($a, $b) => ($b['avg_percentage'] ?? 0) <=> ($a['avg_percentage'] ?? 0));

        return $grouped;
    }

    /**
     * @param  Collection<int, object>  $rows
     * @param  array<int, string>  $monthKeys
     * @return array<int, array<string, mixed>>
     */
    private function aggregateMonthly(Collection $rows, array $monthKeys): array
    {
        $buckets = array_fill_keys($monthKeys, []);

        foreach ($rows as $row) {
            $monthKey = Carbon::parse($row->finished_at)->format('Y-m');

            if (! array_key_exists($monthKey, $buckets)) {
                continue;
            }

            $subjectKey = $row->subject_id !== null ? (string) $row->subject_id : 'general';

            if (! isset($buckets[$monthKey][$subjectKey])) {
                $buckets[$monthKey][$subjectKey] = [
                    'subject_id' => $row->subject_id !== null ? (int) $row->subject_id : null,
                    'subject_name' => $row->subject_id !== null
                        ? (string) $row->subject_name
                        : 'Geral',
                    'percentages' => [],
                ];
            }

            $buckets[$monthKey][$subjectKey]['percentages'][] = (float) $row->percentage;
        }

        $result = [];

        foreach ($monthKeys as $monthKey) {
            $carbon = Carbon::createFromFormat('Y-m', $monthKey)->locale('pt_BR');
            $monthSubjects = [];
            $allPercentages = [];

            foreach ($buckets[$monthKey] as $subjectData) {
                $avg = round(array_sum($subjectData['percentages']) / count($subjectData['percentages']), 1);
                $allPercentages = array_merge($allPercentages, $subjectData['percentages']);

                $monthSubjects[] = [
                    'subject_id' => $subjectData['subject_id'],
                    'subject_name' => $subjectData['subject_name'],
                    'attempts_count' => count($subjectData['percentages']),
                    'avg_percentage' => $avg,
                ];
            }

            usort($monthSubjects, fn ($a, $b) => strcmp($a['subject_name'], $b['subject_name']));

            $result[] = [
                'month' => $monthKey,
                'label' => ucfirst($carbon->translatedFormat('M/Y')),
                'attempts_count' => count($allPercentages),
                'avg_percentage' => count($allPercentages) > 0
                    ? round(array_sum($allPercentages) / count($allPercentages), 1)
                    : null,
                'by_subject' => $monthSubjects,
            ];
        }

        return $result;
    }

    /**
     * @param  Collection<int, object>  $rows
     * @param  array<int, array<string, mixed>>  $bySubject
     * @param  array<int, string>  $monthKeys
     * @return array<string, mixed>
     */
    private function buildOverview(Collection $rows, array $bySubject, array $monthKeys): array
    {
        $percentages = $rows->pluck('percentage')->map(fn ($v) => (float) $v)->all();

        $currentMonth = end($monthKeys) ?: now()->format('Y-m');
        $previousMonth = count($monthKeys) > 1 ? $monthKeys[count($monthKeys) - 2] : null;

        $currentRows = $rows->filter(
            fn ($r) => Carbon::parse($r->finished_at)->format('Y-m') === $currentMonth
        );
        $previousRows = $previousMonth
            ? $rows->filter(fn ($r) => Carbon::parse($r->finished_at)->format('Y-m') === $previousMonth)
            : collect();

        $currentAvg = $this->average($currentRows->pluck('percentage')->all());
        $previousAvg = $this->average($previousRows->pluck('percentage')->all());

        $bestSubject = $bySubject[0] ?? null;

        return [
            'total_attempts' => $rows->count(),
            'subjects_count' => count($bySubject),
            'avg_percentage' => $this->average($percentages),
            'month_avg_percentage' => $currentAvg,
            'month_change' => ($currentAvg !== null && $previousAvg !== null)
                ? round($currentAvg - $previousAvg, 1)
                : null,
            'best_subject' => $bestSubject ? [
                'subject_id' => $bestSubject['subject_id'],
                'name' => $bestSubject['subject']['name'],
                'avg_percentage' => $bestSubject['avg_percentage'],
            ] : null,
        ];
    }

    /**
     * @return array<int, string>
     */
    private function monthKeys(int $months): array
    {
        $keys = [];

        for ($i = $months - 1; $i >= 0; $i--) {
            $keys[] = now()->subMonths($i)->format('Y-m');
        }

        return $keys;
    }

    /**
     * @param  array<string, array<int, float>>  $byMonth
     */
    private function avgFromMonthBucket(array $byMonth, string $monthKey): ?float
    {
        if (! isset($byMonth[$monthKey]) || $byMonth[$monthKey] === []) {
            return null;
        }

        $values = $byMonth[$monthKey];

        return round(array_sum($values) / count($values), 1);
    }

    /**
     * @param  array<int, float>  $values
     */
    private function average(array $values): ?float
    {
        if ($values === []) {
            return null;
        }

        return round(array_sum($values) / count($values), 1);
    }
}
