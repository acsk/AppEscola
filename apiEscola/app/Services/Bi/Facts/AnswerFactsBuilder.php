<?php

namespace App\Services\Bi\Facts;

use App\Services\Bi\Sources\AnswerFacts;
use App\Services\Bi\Sources\AssessmentResults;
use App\Services\Bi\Sources\PracticeFirstAttempts;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Gera bi_answer_facts com as mesmas regras das fontes ao vivo (PracticeFirstAttempts::numbered e
 * AssessmentResults::numberedAttempts). Incremental: refaz só os alunos com resposta, sessão ou
 * simulado concluído desde a última execução. Completa: refaz o tenant inteiro (pega anulações,
 * troca de disciplina e exclusões).
 */
class AnswerFactsBuilder
{
    private const STUDENT_CHUNK = 300;

    /** Folga para respostas gravadas durante a execução anterior. */
    private const OVERLAP_MINUTES = 5;

    public const COLUMNS = [
        'tenant_id', 'source', 'student_id', 'exam_key', 'exam_id', 'attempt_id',
        'question_id', 'subject_id', 'exam_type_id', 'option_id', 'is_correct', 'answered_at',
    ];

    public function __construct(
        private readonly AssessmentResults $assessments,
        private readonly PracticeFirstAttempts $practice,
        private readonly AnswerFacts $facts,
    ) {
    }

    /**
     * @return array{mode: string, students: int, rows: int, ms: int}|null null quando outro processo já gera o tenant
     */
    public function refresh(int $tenantId, bool $full = false): ?array
    {
        $lock = Cache::lock('bi:facts:'.$tenantId, 3600);
        if (! $lock->get()) {
            return null;
        }

        try {
            $start = microtime(true);
            $startedAt = Carbon::now('UTC');
            $state = DB::table('bi_fact_refreshes')->where('tenant_id', $tenantId)->first();
            $full = $full || $state?->full_refreshed_at === null;

            if ($full) {
                $students = null;
                $rows = DB::transaction(fn () => $this->rebuild($tenantId, null));
            } else {
                $students = $this->changedStudents($tenantId, Carbon::parse($state->refreshed_at, 'UTC')->subMinutes(self::OVERLAP_MINUTES));
                $rows = 0;
                foreach (array_chunk($students, self::STUDENT_CHUNK) as $chunk) {
                    $rows += DB::transaction(fn () => $this->rebuild($tenantId, $chunk));
                }
            }

            $result = [
                'mode' => $full ? 'full' : 'incremental',
                'students' => $students === null ? (int) DB::table('bi_answer_facts')->where('tenant_id', $tenantId)->distinct()->count('student_id') : count($students),
                'rows' => $rows,
                'ms' => (int) round((microtime(true) - $start) * 1000),
            ];

            DB::table('bi_fact_refreshes')->updateOrInsert(['tenant_id' => $tenantId], [
                'refreshed_at' => $startedAt,
                'full_refreshed_at' => $full ? $startedAt : $state->full_refreshed_at,
                'last_students' => $result['students'],
                'last_rows' => $rows,
                'last_ms' => $result['ms'],
            ]);
            $this->facts->forget();

            return $result;
        } finally {
            $lock->release();
        }
    }

    /**
     * Apaga e regrava os fatos do tenant (ou só dos alunos informados). Retorna as linhas gravadas.
     *
     * @param  list<int>|null  $studentIds
     */
    private function rebuild(int $tenantId, ?array $studentIds): int
    {
        DB::table('bi_answer_facts')
            ->where('tenant_id', $tenantId)
            ->when($studentIds !== null, fn ($q) => $q->whereIn('student_id', $studentIds))
            ->delete();

        $online = DB::table('exam_answers as ans')
            ->joinSub(
                DB::query()->fromSub($this->assessments->numberedAttempts($tenantId, $studentIds), 'a')->where('a.tentativa', 1),
                'a',
                'a.attempt_id',
                '=',
                'ans.attempt_id',
            )
            ->join('exam_questions as q', 'q.id', '=', 'ans.question_id')
            ->where('q.is_annulled', false)
            ->whereNotNull('ans.is_correct')
            ->selectRaw("? as tenant_id, '".AnswerFacts::SOURCE_ONLINE."' as source", [$tenantId])
            ->addSelect('a.student_id', 'a.exam_id as exam_key', 'a.exam_id', 'a.attempt_id', 'ans.question_id', 'q.subject_id', 'a.exam_type_id', 'ans.option_id', 'ans.is_correct', 'a.finished_at as answered_at');

        // Banco: anuladas continuam (régua do app); a leitura descarta questões sem disciplina quando precisa.
        $practice = DB::query()->fromSub($this->practice->numbered($tenantId, $studentIds), 'p')
            ->where('p.tentativa', 1)
            ->selectRaw("? as tenant_id, '".AnswerFacts::SOURCE_PRACTICE."' as source, p.student_id, 0 as exam_key, NULL as exam_id, NULL as attempt_id", [$tenantId])
            ->addSelect('p.exam_question_id as question_id', 'p.subject_id', 'p.exam_type_id', 'p.option_id', 'p.is_correct', 'p.answered_at');

        return DB::table('bi_answer_facts')->insertUsing(self::COLUMNS, $online)
            + DB::table('bi_answer_facts')->insertUsing(self::COLUMNS, $practice);
    }

    /**
     * Alunos com resposta no banco, sessão finalizada ou simulado concluído desde $since.
     *
     * @return list<int>
     */
    private function changedStudents(int $tenantId, Carbon $since): array
    {
        $practice = DB::table('practice_answers')->where('tenant_id', $tenantId)->where('answered_at', '>=', $since)->select('student_id');
        $sessions = DB::table('practice_attempts')->where('tenant_id', $tenantId)->where('finished_at', '>=', $since)->select('student_id');
        $exams = DB::table('exam_attempts')->where('tenant_id', $tenantId)->where('finished_at', '>=', $since)->select('student_id');

        return DB::query()->fromSub($practice->union($sessions)->union($exams), 'c')
            ->pluck('c.student_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
