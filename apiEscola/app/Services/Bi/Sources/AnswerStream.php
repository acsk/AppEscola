<?php

namespace App\Services\Bi\Sources;

use App\Services\Bi\BiFilters;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Respostas objetivas questão a questão: simulados online (1ª tentativa concluída) e banco de questões
 * (1ª tentativa de cada questão). Base de acerto por disciplina/assunto e de erros por alternativa.
 */
class AnswerStream
{
    public const SOURCE_BOTH = 'both';

    public const SOURCE_ONLINE = 'online';

    public const SOURCE_PRACTICE = 'practice';

    public const SOURCES = [self::SOURCE_BOTH, self::SOURCE_ONLINE, self::SOURCE_PRACTICE];

    public function __construct(
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
    ) {
    }

    /**
     * Colunas: source (online|practice), student_id, question_id, subject_id, option_id, is_correct.
     * Sem disciplina fica de fora; anuladas saem só dos simulados (o banco segue a régua do app).
     * O filtro de disciplina vale para as duas fontes.
     */
    public function query(StudentUniverse $universe, ?BiFilters $filters = null, string $source = self::SOURCE_BOTH): Builder
    {
        $filters ??= $universe->filters;
        $parts = [];

        if ($source !== self::SOURCE_PRACTICE) {
            $parts[] = DB::table('exam_answers as ans')
                ->joinSub($this->assessments->firstOnlineAttempts($universe, $filters), 'fa', 'fa.attempt_id', '=', 'ans.attempt_id')
                ->join('exam_questions as q', 'q.id', '=', 'ans.question_id')
                ->whereNotNull('q.subject_id')
                ->where('q.is_annulled', false)
                ->whereNotNull('ans.is_correct')
                ->when($filters->subjectId !== null, fn ($q) => $q->where('q.subject_id', $filters->subjectId))
                ->selectRaw("'online' as source")
                ->addSelect('fa.student_id', 'ans.question_id', 'q.subject_id', 'ans.option_id', 'ans.is_correct');
        }

        if ($source !== self::SOURCE_ONLINE) {
            $parts[] = $this->practice->query($universe, $filters)
                ->whereNotNull('pa.subject_id')
                ->selectRaw("'practice' as source")
                ->addSelect('pa.student_id', 'pa.exam_question_id as question_id', 'pa.subject_id', 'pa.option_id', 'pa.is_correct');
        }

        $union = array_shift($parts);
        foreach ($parts as $part) {
            $union->unionAll($part);
        }

        return DB::query()->fromSub($union, 'r');
    }
}
