<?php

namespace App\Services\Bi\Sources;

use App\Models\PracticeAnswer;
use App\Services\Bi\BiFilters;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Banco de questões pela mesma régua do app (LearningDiagnosisService): só respostas que contam
 * e só a primeira tentativa de cada questão. Retentativas ficam de fora.
 */
class PracticeFirstAttempts
{
    /**
     * Primeiras tentativas respondidas no período.
     * Colunas: student_id, exam_question_id, subject_id, is_correct, answered_at.
     */
    public function query(StudentUniverse $universe, ?BiFilters $filters = null): Builder
    {
        $filters ??= $universe->filters;
        [$from, $until] = $filters->utcRange();

        $numbered = PracticeAnswer::query()->counted()
            ->join('exam_questions as q', 'q.id', '=', 'practice_answers.exam_question_id')
            ->where('practice_answers.tenant_id', $universe->scope->tenantId)
            ->whereIn('practice_answers.student_id', $universe->query())
            ->when($filters->examTypeId !== null, fn ($q) => $q->where('q.exam_type_id', $filters->examTypeId))
            ->select('practice_answers.student_id', 'practice_answers.exam_question_id', 'practice_answers.is_correct', 'practice_answers.answered_at', 'q.subject_id')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY practice_answers.student_id, practice_answers.exam_question_id ORDER BY practice_answers.answered_at, practice_answers.id) as tentativa')
            ->toBase();

        return DB::query()->fromSub($numbered, 'pa')
            ->where('pa.tentativa', 1)
            ->where('pa.answered_at', '>=', $from)
            ->where('pa.answered_at', '<', $until)
            ->when($filters->subjectId !== null, fn ($q) => $q->where('pa.subject_id', $filters->subjectId));
    }

    /** @return array{answers: int, correct: int, students: int} */
    public function totals(StudentUniverse $universe, ?BiFilters $filters = null): array
    {
        $row = $this->query($universe, $filters)
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->selectRaw('COUNT(DISTINCT pa.student_id) as students')
            ->first();

        return [
            'answers' => (int) ($row->answers ?? 0),
            'correct' => (int) ($row->correct ?? 0),
            'students' => (int) ($row->students ?? 0),
        ];
    }
}
