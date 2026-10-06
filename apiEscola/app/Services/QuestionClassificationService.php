<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\ExamQuestion;
use App\Models\ExamType;
use App\Models\QuestionBoard;
use App\Models\QuestionDifficulty;
use App\Models\QuestionTag;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Classificação de questões (não altera enunciado, alternativas nem gabarito).
 *
 * Atualização parcial: campo ausente não altera; null remove o valor.
 * Disciplina/assuntos: sem disciplina informada, ela é deduzida dos assuntos;
 * com disciplina informada, todos os assuntos precisam ser dela.
 */
class QuestionClassificationService
{
    /** Campos aceitos no PATCH (individual e em lote). */
    public const FIELDS = [
        'difficulty_id', 'subject_id', 'topic_ids', 'board_id', 'year', 'exam_type_id',
        'is_annulled', 'is_outdated', 'tags', 'add_tags', 'remove_tags',
    ];

    public const RELATIONS = ['exam:id,title', 'subject:id,name', 'topics:id,name,subject_id', 'board:id,name',
        'difficulty:id,name,sort_order', 'examType:id,slug,label', 'tags:id,name'];

    public function __construct(private readonly QuestionCatalogService $catalogs)
    {
    }

    public function apply(ExamQuestion $question, array $data, int $tenantId): ExamQuestion
    {
        return DB::transaction(function () use ($question, $data, $tenantId) {
            $attributes = array_intersect_key($data, array_flip(['year', 'is_annulled', 'is_outdated']));

            if (array_key_exists('difficulty_id', $data)) {
                $attributes['difficulty_id'] = $this->resolveId(QuestionDifficulty::query(), $data['difficulty_id'], 'Dificuldade não encontrada.', $question->difficulty_id);
            }
            if (array_key_exists('board_id', $data)) {
                $attributes['board_id'] = $this->resolveId(QuestionBoard::query()->where('tenant_id', $tenantId), $data['board_id'], 'Banca não encontrada.', $question->board_id);
            }
            if (array_key_exists('exam_type_id', $data)) {
                $attributes['exam_type_id'] = $this->resolveId(ExamType::query()->active(), $data['exam_type_id'], 'Classificação de prova inválida ou inativa.', $question->exam_type_id);
            }

            $topicIds = null;
            $resolved = $this->resolveSubjectAndTopics($question, $data, $tenantId);
            if ($resolved !== null) {
                [$attributes['subject_id'], $topicIds] = $resolved;
            }

            $question->fill($attributes)->save();

            if ($topicIds !== null) {
                $question->topics()->sync($topicIds);
            }
            $this->applyTags($question, $data, $tenantId);

            return $question->load(self::RELATIONS);
        });
    }

    /**
     * Aplica uma classificação por item; a falha de um item não interrompe os demais.
     * Cada item devolve "previous" (valores anteriores) para o "Desfazer".
     *
     * @param  array<int, array<string, mixed>>  $items  cada item: ['id' => int, ...campos]
     * @return array<int, array{id: int, ok: bool, message?: string, previous?: array<string, mixed>}>
     */
    public function applyBatch(array $items, int $tenantId): array
    {
        $ids = array_map(fn ($item) => (int) $item['id'], $items);
        $questions = ExamQuestion::query()
            ->inQuestionBank($tenantId)
            ->whereIn('exam_questions.id', $ids)
            ->with(['topics:id', 'tags:id,name'])
            ->get()
            ->keyBy('id');

        $results = [];
        foreach ($items as $item) {
            $id = (int) $item['id'];
            $question = $questions->get($id);

            if (! $question) {
                $results[] = ['id' => $id, 'ok' => false, 'message' => 'Questão não encontrada.'];
                continue;
            }

            $previous = $this->snapshot($question);
            try {
                $this->apply($question, array_intersect_key($item, array_flip(self::FIELDS)), $tenantId);
                $results[] = ['id' => $id, 'ok' => true, 'previous' => $previous];
            } catch (QuestionBankException $e) {
                $results[] = ['id' => $id, 'ok' => false, 'message' => $e->getMessage()];
            }
        }

        return $results;
    }

    /** Classificação atual no mesmo formato do PATCH (usada para desfazer). */
    public function snapshot(ExamQuestion $question): array
    {
        $question->loadMissing(['topics:id', 'tags:id,name']);

        return [
            'difficulty_id' => $question->difficulty_id,
            'subject_id'    => $question->subject_id,
            'topic_ids'     => $question->topics->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
            'board_id'      => $question->board_id,
            'year'          => $question->year,
            'exam_type_id'  => $question->exam_type_id,
            'is_annulled'   => (bool) $question->is_annulled,
            'is_outdated'   => (bool) $question->is_outdated,
            'tags'          => $question->tags->pluck('name')->values()->all(),
        ];
    }

    /** @return array{0: ?int, 1: array<int, int>}|null  null quando nem disciplina nem assuntos foram enviados */
    private function resolveSubjectAndTopics(ExamQuestion $question, array $data, int $tenantId): ?array
    {
        $subjectGiven = array_key_exists('subject_id', $data);
        $topicsGiven = array_key_exists('topic_ids', $data);

        if (! $subjectGiven && ! $topicsGiven) {
            return null;
        }

        $subjectId = $subjectGiven ? $data['subject_id'] : $question->subject_id;
        if ($subjectGiven && $subjectId !== null) {
            $subjectId = $this->resolveId(Subject::query()->where('tenant_id', $tenantId), $subjectId, 'Disciplina não encontrada.', $question->subject_id);
        }

        if (! $topicsGiven) {
            // Disciplina trocada: descarta os assuntos que não são da nova disciplina.
            $topics = $question->topics()->get(['subject_topics.id', 'subject_topics.subject_id']);

            return [$subjectId, $this->idsOf($topics->where('subject_id', $subjectId))];
        }

        $topics = $this->loadTopics($data['topic_ids'] ?? [], $tenantId);
        $topicSubjectIds = $topics->pluck('subject_id')->map(fn ($id) => (int) $id)->unique();

        if ($subjectGiven && $subjectId !== null) {
            if ($topicSubjectIds->contains(fn ($id) => $id !== (int) $subjectId)) {
                throw new QuestionBankException('Todos os assuntos precisam ser da disciplina selecionada.');
            }
        } elseif ($topics->isNotEmpty()) {
            if ($topicSubjectIds->count() > 1) {
                throw new QuestionBankException('Os assuntos informados são de disciplinas diferentes.');
            }
            $subjectId = $topicSubjectIds->first();
        }

        return [$subjectId, $this->idsOf($topics)];
    }

    private function loadTopics(array $ids, int $tenantId): Collection
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($ids === []) {
            return collect();
        }

        $topics = SubjectTopic::query()->where('tenant_id', $tenantId)->whereIn('id', $ids)->get(['id', 'subject_id']);
        if ($topics->count() !== count($ids)) {
            throw new QuestionBankException('Assunto não encontrado.');
        }

        return $topics;
    }

    private function applyTags(ExamQuestion $question, array $data, int $tenantId): void
    {
        if (array_key_exists('tags', $data)) {
            $question->tags()->sync($this->catalogs->resolveTagIds($tenantId, $data['tags'] ?? []));
        }
        if (! empty($data['add_tags'])) {
            $question->tags()->syncWithoutDetaching($this->catalogs->resolveTagIds($tenantId, $data['add_tags']));
        }
        if (! empty($data['remove_tags'])) {
            $names = array_map(fn ($n) => QuestionCatalogService::normalizeName((string) $n), $data['remove_tags']);
            $ids = QuestionTag::query()->where('tenant_id', $tenantId)->whereIn('name', $names)->pluck('id');
            $question->tags()->detach($ids);
        }
    }

    /**
     * Valida o id no catálogo. O valor atual da questão é aceito sem revalidar
     * (ex.: desfazer para um tipo de prova que foi desativado depois).
     */
    private function resolveId($query, mixed $id, string $notFoundMessage, mixed $current = null): ?int
    {
        if ($id === null) {
            return null;
        }
        if ($current !== null && (int) $id === (int) $current) {
            return (int) $id;
        }
        if (! $query->whereKey((int) $id)->exists()) {
            throw new QuestionBankException($notFoundMessage);
        }

        return (int) $id;
    }

    private function idsOf(Collection $models): array
    {
        return $models->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
    }
}
