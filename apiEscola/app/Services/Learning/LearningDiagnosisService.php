<?php

namespace App\Services\Learning;

use App\Models\PracticeAnswer;
use App\Models\Student;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Diagnóstico do aluno a partir da primeira tentativa de cada questão.
 * Retentativa conta só como revisão. O cálculo fica no MySQL.
 */
class LearningDiagnosisService
{
    public const CRITICAL = 'critical';

    public const ATTENTION = 'attention';

    public const GOOD = 'good';

    public const EXCELLENT = 'excellent';

    public const INSUFFICIENT = 'insufficient';

    /** @return array{questions: int, first_correct: int, first_wrong: int, accuracy: ?float, retakes: int, reinforcement_topics: int, min_sample: int} */
    public function overview(Student $student): array
    {
        $row = DB::query()->fromSub($this->attemptNumbers($student), 'a')
            ->selectRaw('sum(case when a.tentativa = 1 then 1 else 0 end) as questions')
            ->selectRaw('sum(case when a.tentativa = 1 and a.is_correct = 1 then 1 else 0 end) as first_correct')
            ->selectRaw('sum(case when a.tentativa = 1 and a.is_correct = 0 then 1 else 0 end) as first_wrong')
            ->selectRaw('sum(case when a.tentativa > 1 then 1 else 0 end) as retakes')
            ->first();
        $questions = (int) ($row->questions ?? 0);
        $correct = (int) ($row->first_correct ?? 0);
        $reinforcement = 0;
        foreach ($this->topics($student) as $topic) {
            if (in_array($topic['level'], [self::CRITICAL, self::ATTENTION], true)) {
                $reinforcement++;
            }
        }

        return [
            'questions' => $questions,
            'first_correct' => $correct,
            'first_wrong' => (int) ($row->first_wrong ?? 0),
            'accuracy' => $questions > 0 ? round($correct / $questions * 100, 1) : null,
            'retakes' => (int) ($row->retakes ?? 0),
            'reinforcement_topics' => $reinforcement,
            'min_sample' => (int) config('learning.min_sample', 5),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function topics(Student $student): array
    {
        $rows = $this->aggregate($student);
        if ($rows->isEmpty()) {
            return [];
        }
        $subjects = Subject::query()->whereIn('id', $rows->pluck('subject_id')->filter()->unique())->pluck('name', 'id');
        $topics = SubjectTopic::query()->whereIn('id', $rows->pluck('topic_id')->filter()->unique())->pluck('name', 'id');

        return $rows->map(function ($row) use ($subjects, $topics) {
            $questions = (int) $row->questions;
            $correct = (int) $row->first_correct;
            $accuracy = $questions > 0 ? round($correct / $questions * 100, 1) : null;
            $level = $this->level($questions, $accuracy);

            return [
                'subject_id' => $row->subject_id ? (int) $row->subject_id : null,
                'subject_name' => $row->subject_id ? ($subjects[$row->subject_id] ?? 'Disciplina') : 'Sem disciplina',
                'topic_id' => $row->topic_id ? (int) $row->topic_id : null,
                'topic_name' => $row->topic_id ? ($topics[$row->topic_id] ?? 'Assunto') : 'Sem assunto',
                'questions' => $questions,
                'first_correct' => $correct,
                'first_wrong' => (int) $row->first_wrong,
                'accuracy' => $accuracy,
                'retakes' => (int) $row->retakes,
                'level' => $level,
                'label' => $this->label($level),
            ];
        })->sort(fn (array $a, array $b) => $this->priority($a) <=> $this->priority($b))->values()->all();
    }

    /**
     * Aproveitamento mês a mês (primeira tentativa) e a comparação dos últimos 30 dias com os 30 anteriores.
     *
     * @return array{months: list<array<string, mixed>>, comparison: array<string, mixed>}
     */
    public function evolution(Student $student): array
    {
        $day = DB::getDriverName() === 'sqlite'
            ? "date(a.answered_at, '-3 hours')"
            : "DATE(CONVERT_TZ(a.answered_at, '+00:00', '-03:00'))";
        $month = "DATE_FORMAT({$day}, '%Y-%m')";
        if (DB::getDriverName() === 'sqlite') {
            $month = "strftime('%Y-%m', {$day})";
        }

        $rows = DB::query()->fromSub($this->firstAttempts($student), 'a')
            ->selectRaw("{$month} as month")
            ->selectRaw('count(*) as questions')
            ->selectRaw('sum(case when a.is_correct = 1 then 1 else 0 end) as first_correct')
            ->groupByRaw($month)
            ->orderBy('month')
            ->get();

        $months = $rows->map(function ($row) {
            $questions = (int) $row->questions;
            $correct = (int) $row->first_correct;

            return [
                'month' => (string) $row->month,
                'label' => $this->monthLabel((string) $row->month),
                'questions' => $questions,
                'first_correct' => $correct,
                'first_wrong' => $questions - $correct,
                'accuracy' => $questions > 0 ? round($correct / $questions * 100, 1) : null,
            ];
        })->values()->all();

        return [
            'months' => $months,
            'comparison' => $this->comparePeriods($student),
        ];
    }

    public function level(int $questions, ?float $accuracy): string
    {
        if ($questions < (int) config('learning.min_sample', 5) || $accuracy === null) {
            return self::INSUFFICIENT;
        }
        if ($accuracy < (float) config('learning.critical_below', 50)) {
            return self::CRITICAL;
        }
        if ($accuracy < (float) config('learning.attention_below', 70)) {
            return self::ATTENTION;
        }
        if ($accuracy < (float) config('learning.good_below', 85)) {
            return self::GOOD;
        }

        return self::EXCELLENT;
    }

    public function label(string $level): string
    {
        return match ($level) {
            self::CRITICAL => 'Crítico',
            self::ATTENTION => 'Atenção',
            self::GOOD => 'Bom',
            self::EXCELLENT => 'Excelente',
            default => 'Dados insuficientes',
        };
    }

    /** @param  array{level: string, accuracy: ?float, questions: int}  $topic */
    private function priority(array $topic): array
    {
        $order = [self::CRITICAL => 0, self::ATTENTION => 1, self::INSUFFICIENT => 2, self::GOOD => 3, self::EXCELLENT => 4];

        return [$order[$topic['level']] ?? 9, $topic['accuracy'] ?? 100, -$topic['questions']];
    }

    private function aggregate(Student $student): Collection
    {
        $attempts = $this->attemptNumbers($student);

        return DB::query()->fromSub($attempts, 'a')
            ->join('exam_questions as eq', 'eq.id', '=', 'a.exam_question_id')
            ->leftJoin('exam_question_topic as eqt', 'eqt.exam_question_id', '=', 'eq.id')
            ->groupBy('eq.subject_id', 'eqt.subject_topic_id')
            ->selectRaw('eq.subject_id as subject_id')
            ->selectRaw('eqt.subject_topic_id as topic_id')
            ->selectRaw('sum(case when a.tentativa = 1 then 1 else 0 end) as questions')
            ->selectRaw('sum(case when a.tentativa = 1 and a.is_correct = 1 then 1 else 0 end) as first_correct')
            ->selectRaw('sum(case when a.tentativa = 1 and a.is_correct = 0 then 1 else 0 end) as first_wrong')
            ->selectRaw('sum(case when a.tentativa > 1 then 1 else 0 end) as retakes')
            ->havingRaw('sum(case when a.tentativa = 1 then 1 else 0 end) > 0')
            ->get();
    }

    /** Primeira tentativa de cada questão, já no fuso da escola. */
    private function firstAttempts(Student $student)
    {
        return DB::query()->fromSub($this->attemptNumbers($student), 'a')->where('a.tentativa', 1);
    }

    private function attemptNumbers(Student $student)
    {
        return PracticeAnswer::query()->counted()
            ->where('practice_answers.student_id', $student->id)
            ->where('practice_answers.tenant_id', $student->tenant_id)
            ->select('practice_answers.exam_question_id', 'practice_answers.is_correct', 'practice_answers.answered_at')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY practice_answers.exam_question_id ORDER BY practice_answers.answered_at ASC, practice_answers.id ASC) as tentativa');
    }

    /** @return array{current: array<string, mixed>, previous: array<string, mixed>} */
    private function comparePeriods(Student $student): array
    {
        $now = now(PracticePerformanceService::RANKING_TIMEZONE);
        $currentStart = $now->copy()->subDays(30)->utc();
        $previousStart = $now->copy()->subDays(60)->utc();

        return [
            'current' => $this->window($student, $currentStart, null),
            'previous' => $this->window($student, $previousStart, $currentStart),
        ];
    }

    /** @return array{questions: int, first_correct: int, first_wrong: int, accuracy: ?float} */
    private function window(Student $student, Carbon $from, ?Carbon $until): array
    {
        $row = DB::query()->fromSub($this->firstAttempts($student), 'a')
            ->where('a.answered_at', '>=', $from)
            ->when($until, fn ($q) => $q->where('a.answered_at', '<', $until))
            ->selectRaw('count(*) as questions')
            ->selectRaw('sum(case when a.is_correct = 1 then 1 else 0 end) as first_correct')
            ->first();
        $questions = (int) ($row->questions ?? 0);
        $correct = (int) ($row->first_correct ?? 0);

        return [
            'questions' => $questions,
            'first_correct' => $correct,
            'first_wrong' => $questions - $correct,
            'accuracy' => $questions > 0 ? round($correct / $questions * 100, 1) : null,
        ];
    }

    private function monthLabel(string $month): string
    {
        $names = [1 => 'jan', 2 => 'fev', 3 => 'mar', 4 => 'abr', 5 => 'mai', 6 => 'jun', 7 => 'jul', 8 => 'ago', 9 => 'set', 10 => 'out', 11 => 'nov', 12 => 'dez'];
        $parts = explode('-', $month);
        $index = (int) ($parts[1] ?? 0);

        return isset($names[$index], $parts[0]) ? $names[$index].'/'.$parts[0] : $month;
    }
}
