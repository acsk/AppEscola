<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\ExamQuestion;
use App\Models\QuestionSet;
use App\Models\QuestionSetItem;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Simulados do banco de questões (importados de PDF ou montados pelo admin). Diferente dos simulados
 * oficiais, as questões são só referenciadas: continuam avulsas no banco e podem estar em vários simulados.
 */
class QuestionSetService
{
    public const MAX_QUESTIONS = 200;

    public function __construct(private readonly ExamTypeService $examTypes) {}

    public function list(int $tenantId, array $params): LengthAwarePaginator
    {
        $search = trim((string) ($params['search'] ?? ''));

        return QuestionSet::query()
            ->where('tenant_id', $tenantId)
            ->when($params['status'] ?? null, fn (Builder $q, $status) => $q->where('status', $status))
            ->when($params['origin'] ?? null, fn (Builder $q, $origin) => $q->where('origin', $origin))
            ->when($search !== '', fn (Builder $q) => $q->where('title', 'like', '%'.addcslashes($search, '%_\\').'%'))
            ->with('examType:id,slug,label,logo_url')
            ->withCount(['items', 'attempts'])
            ->latest('id')
            ->paginate((int) ($params['per_page'] ?? 15));
    }

    /**
     * @param  int[]  $questionIds  na ordem desejada
     */
    public function create(int $tenantId, array $data, array $questionIds, string $origin): QuestionSet
    {
        $examTypeId = ! empty($data['exam_type'])
            ? $this->examTypes->resolveActiveBySlug($data['exam_type'])->id
            : null;

        return DB::transaction(function () use ($tenantId, $data, $questionIds, $origin, $examTypeId) {
            $set = QuestionSet::create([
                'tenant_id'        => $tenantId,
                'title'            => $data['title'],
                'description'      => $data['description'] ?? null,
                'origin'           => $origin,
                'status'           => QuestionSet::STATUS_DRAFT,
                'exam_type_id'     => $examTypeId,
                'source_exam_name' => $data['source_exam_name'] ?? null,
            ]);
            if ($questionIds !== []) {
                $this->appendItems($set, $questionIds, $examTypeId);
            }

            return $this->fresh($set);
        });
    }

    /** Acrescenta questões ao fim (ignora as que já estão no simulado). */
    public function append(QuestionSet $set, array $questionIds): QuestionSet
    {
        return DB::transaction(function () use ($set, $questionIds) {
            $this->appendItems($set, $questionIds, $set->origin === QuestionSet::ORIGIN_PDF_IMPORT ? $set->exam_type_id : null);

            return $this->fresh($set);
        });
    }

    public function update(QuestionSet $set, array $data): QuestionSet
    {
        if (($data['status'] ?? null) === QuestionSet::STATUS_PUBLISHED && ! $set->isPublished()
            && $this->practicableQuery($set)->doesntExist()) {
            throw new QuestionBankException('Inclua ao menos uma questão objetiva completa antes de publicar.');
        }
        $set->update(array_intersect_key($data, array_flip(['title', 'description', 'status'])));

        return $this->fresh($set);
    }

    /** Nova ordem: todos os ids das questões do simulado, sem faltar nem sobrar. */
    public function reorder(QuestionSet $set, array $questionIds): QuestionSet
    {
        $ids = array_values(array_unique(array_map('intval', $questionIds)));
        $current = $set->items()->pluck('exam_question_id')->map(fn ($id) => (int) $id)->all();
        if (count($ids) !== count($current) || array_diff($current, $ids) !== []) {
            throw new QuestionBankException('A nova ordem deve conter exatamente as questões do simulado.');
        }

        DB::transaction(function () use ($set, $ids) {
            foreach ($ids as $position => $id) {
                QuestionSetItem::where('question_set_id', $set->id)->where('exam_question_id', $id)
                    ->update(['position' => $position + 1]);
            }
        });

        return $this->fresh($set);
    }

    public function removeQuestion(QuestionSet $set, int $questionId): QuestionSet
    {
        DB::transaction(function () use ($set, $questionId) {
            $removed = QuestionSetItem::where('question_set_id', $set->id)->where('exam_question_id', $questionId)->delete();
            if ($removed === 0) {
                throw new QuestionBankException('Esta questão não está no simulado.', 404);
            }
            $set->items()->get()->values()->each(fn (QuestionSetItem $item, int $i) => $item->update(['position' => $i + 1]));
        });

        return $this->fresh($set);
    }

    /**
     * Monta um simulado sorteando questões praticáveis pelos filtros.
     *
     * @param  array{subject_ids?: int[], topic_ids?: int[], difficulty_ids?: int[], exam_type_ids?: int[], quantity: int}  $filters
     */
    public function generate(int $tenantId, array $data, array $filters): QuestionSet
    {
        $ids = ExamQuestion::query()->practicable($tenantId)
            ->when($filters['subject_ids'] ?? [], fn (Builder $q, $ids) => $q->whereIn('exam_questions.subject_id', $ids))
            ->when($filters['difficulty_ids'] ?? [], fn (Builder $q, $ids) => $q->whereIn('exam_questions.difficulty_id', $ids))
            ->when($filters['exam_type_ids'] ?? [], fn (Builder $q, $ids) => $q->whereIn('exam_questions.exam_type_id', $ids))
            ->when($filters['topic_ids'] ?? [], fn (Builder $q, $ids) => $q->whereHas('topics', fn (Builder $t) => $t->whereIn('subject_topics.id', $ids)))
            ->inRandomOrder()
            ->limit((int) $filters['quantity'])
            ->pluck('exam_questions.id')
            ->all();
        if ($ids === []) {
            throw new QuestionBankException('Nenhuma questão objetiva completa encontrada com esses filtros.');
        }

        return $this->create($tenantId, $data, $ids, QuestionSet::ORIGIN_ADMIN);
    }

    /** Exclui o simulado; as questões continuam no banco (são só referenciadas). */
    public function delete(QuestionSet $set): void
    {
        $set->delete();
    }

    /** Questões do simulado que o aluno vê, na ordem. */
    public function practicableQuery(QuestionSet $set): Builder
    {
        return ExamQuestion::query()->practicable((int) $set->tenant_id)
            ->join('question_set_items as qsi', 'qsi.exam_question_id', '=', 'exam_questions.id')
            ->where('qsi.question_set_id', $set->id)
            ->orderBy('qsi.position')
            ->select('exam_questions.*');
    }

    /**
     * Simulado do banco só referencia questões avulsas: as de simulado oficial já pertencem a ele
     * (e o aluno não pode ver o gabarito delas fora do simulado).
     */
    private function assertStandalone(array $ids, Collection $rows): void
    {
        $label = fn (array $list) => implode(', ', array_map(fn ($id) => "#{$id}", array_slice($list, 0, 10)))
            .(count($list) > 10 ? ' e outras '.(count($list) - 10) : '');
        $problems = [];

        $inExam = $rows->whereNotNull('exam_id');
        if ($inExam->isNotEmpty()) {
            $titles = $inExam->map(fn (ExamQuestion $q) => $q->exam?->title)->filter()->unique()->take(3)->implode('", "');
            $problems[] = "{$label($inExam->pluck('id')->all())} já pertence(m) a simulado oficial"
                .($titles !== '' ? " (\"{$titles}\")" : '')
                .'. Só questões avulsas entram em simulados do banco';
        }
        $missing = array_values(array_diff($ids, $rows->pluck('id')->map(fn ($id) => (int) $id)->all()));
        if ($missing !== []) {
            $problems[] = "{$label($missing)} não existe(m) ou não é(são) desta escola";
        }

        if ($problems !== []) {
            throw new QuestionBankException('Não foi possível adicionar ao simulado do banco: '.implode('; ', $problems).'.');
        }
    }

    private function appendItems(QuestionSet $set, array $questionIds, ?int $examTypeId): void
    {
        $ids = array_values(array_unique(array_map('intval', $questionIds)));
        $existing = QuestionSetItem::where('question_set_id', $set->id)->pluck('exam_question_id')->map(fn ($id) => (int) $id)->all();
        $ids = array_values(array_diff($ids, $existing));
        if ($ids === []) {
            return;
        }
        if (count($existing) + count($ids) > self::MAX_QUESTIONS) {
            throw new QuestionBankException('Um simulado do banco pode ter no máximo '.self::MAX_QUESTIONS.' questões.');
        }

        $rows = ExamQuestion::query()
            ->where('tenant_id', $set->tenant_id)
            ->whereIn('id', $ids)
            ->with('exam:id,title')
            ->get(['id', 'exam_id']);
        $this->assertStandalone($ids, $rows);

        $next = (int) QuestionSetItem::where('question_set_id', $set->id)->max('position');
        $now = now();
        QuestionSetItem::insert(array_map(fn ($id, $i) => [
            'question_set_id'  => $set->id,
            'exam_question_id' => $id,
            'position'         => $next + $i + 1,
            'created_at'       => $now,
            'updated_at'       => $now,
        ], $ids, array_keys($ids)));

        // Prova importada: a modalidade da prova vale para as questões dela.
        if ($examTypeId !== null) {
            ExamQuestion::whereIn('id', $ids)->update(['exam_type_id' => $examTypeId]);
        }
    }

    private function fresh(QuestionSet $set): QuestionSet
    {
        return $set->refresh()->load('examType:id,slug,label,logo_url')->loadCount(['items', 'attempts']);
    }
}
