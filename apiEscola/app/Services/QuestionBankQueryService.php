<?php

namespace App\Services;

use App\Models\ExamQuestion;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * Consulta do banco de questões (avulsas e de simulados) de um tenant.
 *
 * Filtros: cada campo aceita vários valores combinados com OU; os campos se combinam com E.
 * As contagens por aba consideram busca e filtros, mas não a aba.
 */
class QuestionBankQueryService
{
    public const TABS = ['todas', 'regulares', 'anuladas', 'desatualizadas', 'sem_classificacao'];

    public const SORTS = ['id', 'board', 'difficulty', 'errors'];

    public const PER_PAGE = [20, 50, 100];

    /** Filtro da query string → coluna em exam_questions. */
    private const COLUMN_FILTERS = [
        'subject_id' => 'subject_id',
        'board_id' => 'board_id',
        'year' => 'year',
        'difficulty_id' => 'difficulty_id',
        'exam_id' => 'exam_id',
    ];

    /**
     * avulsa = sem simulado oficial; simulado = de simulado oficial;
     * simulado_banco = avulsa já usada em simulado do banco; avulsa_livre = avulsa fora de qualquer simulado.
     */
    public const ORIGINS = ['avulsa', 'simulado', 'simulado_banco', 'avulsa_livre'];

    /** Opções do filtro "Simulado oficial". */
    public const EXAM_OPTIONS_LIMIT = 30;

    /** Limite do "selecionar todas as N". */
    public const MAX_IDS = 5000;

    public function paginate(int $tenantId, array $params): array
    {
        $base = $this->filtered($tenantId, $params);
        $counts = $this->tabCounts(clone $base);

        $query = $this->applyTab($base, $params['tab'] ?? 'todas');
        $this->applySort($query, $params['sort'] ?? 'id', $params['direction'] ?? 'desc');

        $perPage = (int) ($params['per_page'] ?? 20);
        $perPage = in_array($perPage, self::PER_PAGE, true) ? $perPage : 20;

        /** @var LengthAwarePaginator $page */
        $page = $query->select('exam_questions.*')
            ->selectRaw('COALESCE(qe.wrong_count, 0) as wrong_count, COALESCE(qe.answer_count, 0) as answer_count')
            ->with(QuestionClassificationService::RELATIONS)
            ->paginate($perPage, ['*'], 'page', max(1, (int) ($params['page'] ?? 1)));

        return ['page' => $page, 'tab_counts' => $counts];
    }

    /** @return array<int, int> ids na ordem da listagem (para "selecionar todas"). */
    public function ids(int $tenantId, array $params): array
    {
        $query = $this->applyTab($this->filtered($tenantId, $params), $params['tab'] ?? 'todas');
        $this->applySort($query, $params['sort'] ?? 'id', $params['direction'] ?? 'desc');

        return $query->limit(self::MAX_IDS)->pluck('exam_questions.id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array<int, int> anos distintos, decrescente. */
    public function years(int $tenantId): array
    {
        return ExamQuestion::query()
            ->inQuestionBank($tenantId)
            ->whereNotNull('year')
            ->distinct()
            ->orderByDesc('year')
            ->pluck('year')
            ->map(fn ($year) => (int) $year)
            ->all();
    }

    /** Aceita "1,2" ou ["1","2"]; descarta valores não inteiros. */
    public static function idList(mixed $value): array
    {
        $values = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_unique(array_map('intval', array_filter(
            array_map('trim', array_map('strval', $values)),
            fn ($v) => ctype_digit($v)
        ))));
    }

    /** Aceita "a,b" ou ["a","b"] (nomes de tag). */
    public static function nameList(mixed $value): array
    {
        $values = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_filter(array_map(
            fn ($v) => QuestionCatalogService::normalizeName((string) $v),
            $values
        ), fn ($v) => $v !== ''));
    }

    private function filtered(int $tenantId, array $params): Builder
    {
        $query = ExamQuestion::query()->inQuestionBank($tenantId);
        $this->joinErrorStats($query, $tenantId);

        foreach (self::COLUMN_FILTERS as $param => $column) {
            $ids = self::idList($params[$param] ?? []);
            if ($ids !== []) {
                $query->whereIn("exam_questions.{$column}", $ids);
            }
        }

        $this->applyOrigin($query, (string) ($params['origin'] ?? ''));

        // Questão de simulado oficial sem modalidade própria herda a do simulado.
        $examTypeIds = self::idList($params['exam_type_id'] ?? []);
        if ($examTypeIds !== []) {
            $query->where(fn (Builder $q) => $q->whereIn('exam_questions.exam_type_id', $examTypeIds)
                ->orWhere(fn (Builder $inherited) => $inherited->whereNull('exam_questions.exam_type_id')
                    ->whereExists(fn ($s) => $s->select(DB::raw(1))->from('exams')
                        ->whereColumn('exams.id', 'exam_questions.exam_id')
                        ->whereIn('exams.exam_type_id', $examTypeIds))));
        }

        $setIds = self::idList($params['question_set_id'] ?? []);
        if ($setIds !== []) {
            $query->whereExists(fn ($q) => $q->select(DB::raw(1))->from('question_set_items as qsi')
                ->whereColumn('qsi.exam_question_id', 'exam_questions.id')
                ->whereIn('qsi.question_set_id', $setIds));
        }

        $topicIds = self::idList($params['topic_id'] ?? []);
        if ($topicIds !== []) {
            $query->whereExists(fn ($q) => $q->select(DB::raw(1))->from('exam_question_topic as eqt')
                ->whereColumn('eqt.exam_question_id', 'exam_questions.id')
                ->whereIn('eqt.subject_topic_id', $topicIds));
        }

        $tags = self::nameList($params['tag'] ?? []);
        if ($tags !== []) {
            $query->whereExists(fn ($q) => $q->select(DB::raw(1))->from('exam_question_tag as eqg')
                ->join('question_tags as qt', 'qt.id', '=', 'eqg.question_tag_id')
                ->whereColumn('eqg.exam_question_id', 'exam_questions.id')
                ->whereIn('qt.name', $tags));
        }

        if (filter_var($params['exclude_annulled'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('exam_questions.is_annulled', false);
        }
        if (filter_var($params['exclude_outdated'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('exam_questions.is_outdated', false);
        }
        if (filter_var($params['only_with_explanation'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereNotNull('exam_questions.explanation')->where('exam_questions.explanation', '!=', '');
        }
        if (filter_var($params['with_errors'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('qe.wrong_count', '>', 0);
        }
        if (filter_var($params['hide_revalidated'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereNull('exam_questions.revalidated_at');
        }
        if (filter_var($params['without_subject'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereNull('exam_questions.subject_id');
        }

        $this->applySearch($query, trim((string) ($params['search'] ?? '')));

        return $query;
    }

    private function applyOrigin(Builder $query, string $origin): void
    {
        if (! in_array($origin, self::ORIGINS, true)) {
            return;
        }
        if ($origin === 'simulado') {
            $query->whereNotNull('exam_questions.exam_id');

            return;
        }

        $query->whereNull('exam_questions.exam_id');
        $inSet = fn ($q) => $q->select(DB::raw(1))->from('question_set_items as qsi_origin')
            ->whereColumn('qsi_origin.exam_question_id', 'exam_questions.id');
        if ($origin === 'simulado_banco') {
            $query->whereExists($inSet);
        } elseif ($origin === 'avulsa_livre') {
            $query->whereNotExists($inSet);
        }
    }

    /**
     * Simulados oficiais com questões no banco (filtro "Simulado oficial"); `ids` resolve os já escolhidos.
     *
     * @return array<int, array{id: int, title: string, questions_count: int}>
     */
    public function examOptions(int $tenantId, string $search = '', array $ids = []): array
    {
        $query = DB::table('exams')
            ->join('exam_questions', 'exam_questions.exam_id', '=', 'exams.id')
            ->where('exams.tenant_id', $tenantId)
            ->where('exam_questions.tenant_id', $tenantId)
            ->whereNull('exams.deleted_at')
            ->whereNull('exam_questions.deleted_at')
            ->groupBy('exams.id', 'exams.title')
            ->select('exams.id', 'exams.title', DB::raw('COUNT(exam_questions.id) AS questions_count'));

        if ($ids !== []) {
            $query->whereIn('exams.id', $ids);
        } elseif ($search !== '') {
            $query->where('exams.title', 'like', '%'.addcslashes($search, '%_\\').'%');
        }

        return $query->orderBy('exams.title')->limit(self::EXAM_OPTIONS_LIMIT)->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'title' => (string) $row->title, 'questions_count' => (int) $row->questions_count])
            ->all();
    }

    /**
     * "#123" ou "123" busca pelo id; o resto procura no enunciado, no título do simulado e nas tags.
     * Acentos e maiúsculas são ignorados pela collation utf8mb4_unicode_ci do MySQL.
     */
    private function applySearch(Builder $query, string $search): void
    {
        if ($search === '') {
            return;
        }

        if (preg_match('/^#?(\d+)$/', $search, $m)) {
            $query->where('exam_questions.id', (int) $m[1]);

            return;
        }

        $like = '%'.addcslashes($search, '%_\\').'%';
        $query->where(function (Builder $q) use ($like) {
            $q->where('exam_questions.question_text', 'like', $like)
                ->orWhere('exam_questions.source_exam_name', 'like', $like)
                ->orWhereExists(fn ($s) => $s->select(DB::raw(1))->from('exams')
                    ->whereColumn('exams.id', 'exam_questions.exam_id')
                    ->where('exams.title', 'like', $like))
                ->orWhereExists(fn ($s) => $s->select(DB::raw(1))->from('exam_question_tag as eqs')
                    ->join('question_tags as qts', 'qts.id', '=', 'eqs.question_tag_id')
                    ->whereColumn('eqs.exam_question_id', 'exam_questions.id')
                    ->where('qts.name', 'like', $like));
        });
    }

    /** Sem classificação = sem disciplina, sem assunto ou sem dificuldade. */
    private function unclassifiedCondition(): string
    {
        return '(exam_questions.subject_id IS NULL OR exam_questions.difficulty_id IS NULL OR NOT EXISTS ('
            .'SELECT 1 FROM exam_question_topic t WHERE t.exam_question_id = exam_questions.id))';
    }

    private function tabCounts(Builder $query): array
    {
        $row = $query->toBase()->selectRaw(
            'COUNT(*) AS todas,'
            .' COALESCE(SUM(CASE WHEN exam_questions.is_annulled = 0 AND exam_questions.is_outdated = 0 THEN 1 ELSE 0 END), 0) AS regulares,'
            .' COALESCE(SUM(CASE WHEN exam_questions.is_annulled = 1 THEN 1 ELSE 0 END), 0) AS anuladas,'
            .' COALESCE(SUM(CASE WHEN exam_questions.is_outdated = 1 THEN 1 ELSE 0 END), 0) AS desatualizadas,'
            .' COALESCE(SUM(CASE WHEN '.$this->unclassifiedCondition().' THEN 1 ELSE 0 END), 0) AS sem_classificacao'
        )->first();

        return array_map('intval', (array) $row);
    }

    private function applyTab(Builder $query, string $tab): Builder
    {
        return match ($tab) {
            'regulares' => $query->where('exam_questions.is_annulled', false)->where('exam_questions.is_outdated', false),
            'anuladas' => $query->where('exam_questions.is_annulled', true),
            'desatualizadas' => $query->where('exam_questions.is_outdated', true),
            'sem_classificacao' => $query->whereRaw($this->unclassifiedCondition()),
            default => $query,
        };
    }

    private function applySort(Builder $query, string $sort, string $direction): void
    {
        $direction = $direction === 'asc' ? 'asc' : 'desc';

        if ($sort === 'board') {
            $query->leftJoin('question_boards as qb', 'qb.id', '=', 'exam_questions.board_id')
                ->orderByRaw('qb.name IS NULL')
                ->orderBy('qb.name', $direction);
        } elseif ($sort === 'difficulty') {
            // Ordena pela ordem da dificuldade, não pelo nome; sem dificuldade fica no fim.
            $query->leftJoin('question_difficulties as qd', 'qd.id', '=', 'exam_questions.difficulty_id')
                ->orderByRaw('qd.sort_order IS NULL')
                ->orderBy('qd.sort_order', $direction);
        } elseif ($sort === 'errors') {
            // Taxa de erro; sem respostas fica no fim. O volume de erros desempata.
            $query->orderByRaw('CASE WHEN COALESCE(qe.answer_count, 0) = 0 THEN 1 ELSE 0 END')
                ->orderByRaw('(COALESCE(qe.wrong_count, 0) / GREATEST(COALESCE(qe.answer_count, 0), 1)) '.$direction)
                ->orderByRaw('COALESCE(qe.wrong_count, 0) '.$direction);
        }

        $query->orderBy('exam_questions.id', $direction);
    }

    /** Erros dos alunos na prática e em simulados oficiais, por questão. */
    private function joinErrorStats(Builder $query, int $tenantId): void
    {
        $practice = DB::table('practice_answers')
            ->where('tenant_id', $tenantId)
            ->groupBy('exam_question_id')
            ->selectRaw('exam_question_id as question_id, SUM(is_correct = 0) as wrong_count, COUNT(*) as answer_count');
        ExamQuestion::whereLatestReviewApproved($practice, 'practice_answers.exam_question_id');

        $official = DB::table('exam_answers as ea')
            ->join('exam_questions as eq_err', 'eq_err.id', '=', 'ea.question_id')
            ->where('eq_err.tenant_id', $tenantId)
            ->whereNotNull('ea.is_correct')
            ->groupBy('ea.question_id')
            ->selectRaw('ea.question_id as question_id, SUM(ea.is_correct = 0) as wrong_count, COUNT(*) as answer_count');
        ExamQuestion::whereLatestReviewApproved($official, 'ea.question_id');

        $stats = DB::query()
            ->fromSub($practice->unionAll($official), 'answer_errors')
            ->groupBy('question_id')
            ->selectRaw('question_id, SUM(wrong_count) as wrong_count, SUM(answer_count) as answer_count');

        $query->leftJoinSub($stats, 'qe', 'qe.question_id', '=', 'exam_questions.id');
    }
}
