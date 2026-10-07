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

    public const SORTS = ['id', 'board', 'difficulty'];

    public const PER_PAGE = [20, 50, 100];

    /** Filtro da query string → coluna em exam_questions. */
    private const COLUMN_FILTERS = [
        'subject_id' => 'subject_id',
        'board_id' => 'board_id',
        'year' => 'year',
        'difficulty_id' => 'difficulty_id',
        'exam_type_id' => 'exam_type_id',
        'exam_id' => 'exam_id',
    ];

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

        foreach (self::COLUMN_FILTERS as $param => $column) {
            $ids = self::idList($params[$param] ?? []);
            if ($ids !== []) {
                $query->whereIn("exam_questions.{$column}", $ids);
            }
        }

        $origin = $params['origin'] ?? null;
        if ($origin === 'avulsa') {
            $query->whereNull('exam_questions.exam_id');
        } elseif ($origin === 'simulado') {
            $query->whereNotNull('exam_questions.exam_id');
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

        $this->applySearch($query, trim((string) ($params['search'] ?? '')));

        return $query;
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
        }

        $query->orderBy('exam_questions.id', $direction);
    }
}
