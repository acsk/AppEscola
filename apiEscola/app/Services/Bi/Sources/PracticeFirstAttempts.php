<?php

namespace App\Services\Bi\Sources;

use App\Models\PracticeAnswer;
use App\Services\Bi\BiFilters;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Banco de questões pela mesma régua do app (LearningDiagnosisService): só respostas que contam
 * e só a primeira tentativa de cada questão. Retentativas ficam de fora.
 */
class PracticeFirstAttempts
{
    public function __construct(private readonly AnswerFacts $facts)
    {
    }

    /**
     * Primeiras tentativas respondidas no período.
     * Colunas: student_id, exam_question_id, subject_id, exam_type_id, option_id, is_correct, answered_at.
     * Lê de bi_answer_facts quando o tenant já tem fatos gerados; senão calcula ao vivo.
     */
    public function query(StudentUniverse $universe, ?BiFilters $filters = null): Builder
    {
        $filters ??= $universe->filters;
        [$from, $until] = $filters->utcRange();
        $tenantId = $universe->scope->tenantId;

        $source = $this->facts->ready($tenantId)
            ? DB::table('bi_answer_facts')
                ->where('tenant_id', $tenantId)
                ->where('source', AnswerFacts::SOURCE_PRACTICE)
                ->whereIn('student_id', $universe->ids() ?: [0])
                ->where('answered_at', '>=', $from)
                ->where('answered_at', '<', $until)
                ->select('student_id', 'question_id as exam_question_id', 'subject_id', 'exam_type_id', 'option_id', 'is_correct', 'answered_at')
            : DB::query()->fromSub($this->numbered($tenantId, $universe->ids()), 'n')
                ->where('n.tentativa', 1)
                ->where('n.answered_at', '>=', $from)
                ->where('n.answered_at', '<', $until);

        return DB::query()->fromSub($source, 'pa')
            ->when($filters->examTypeId !== null, fn ($q) => $q->where('pa.exam_type_id', $filters->examTypeId))
            ->when($filters->subjectId !== null, fn ($q) => $q->where('pa.subject_id', $filters->subjectId));
    }

    /**
     * Respostas que contam numeradas por aluno × questão em toda a história (tentativa 1 = primeira).
     * Mesma régua do app; usada ao vivo e na geração de bi_answer_facts.
     *
     * @param  list<int>|null  $studentIds  null = todos os alunos do tenant
     */
    public function numbered(int $tenantId, ?array $studentIds = null): Builder
    {
        return PracticeAnswer::query()->counted()
            ->join('exam_questions as q', 'q.id', '=', 'practice_answers.exam_question_id')
            ->where('practice_answers.tenant_id', $tenantId)
            ->when($studentIds !== null, fn ($q) => $q->whereIn('practice_answers.student_id', $studentIds ?: [0]))
            ->select('practice_answers.student_id', 'practice_answers.exam_question_id', 'q.subject_id', 'q.exam_type_id', 'practice_answers.option_id', 'practice_answers.is_correct', 'practice_answers.answered_at')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY practice_answers.student_id, practice_answers.exam_question_id ORDER BY practice_answers.answered_at, practice_answers.id) as tentativa')
            ->toBase();
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

    /** Respostas e acertos por aluno. @return Collection<int, object{student_id: int, answers: int, correct: int}> */
    public function byStudent(StudentUniverse $universe, ?BiFilters $filters = null): Collection
    {
        return $this->query($universe, $filters)
            ->groupBy('pa.student_id')
            ->select('pa.student_id')
            ->selectRaw('COUNT(*) as answers')
            ->selectRaw('SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) as correct')
            ->get()
            ->keyBy('student_id');
    }
}
