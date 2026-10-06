<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\ExamQuestion;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection as SupportCollection;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/** Assuntos de disciplina: nome único dentro da disciplina; assunto em uso não troca de disciplina nem é excluído. */
class SubjectTopicService
{
    public function list(int $tenantId, ?array $subjectIds = null, ?string $search = null): Collection
    {
        return SubjectTopic::query()
            ->where('tenant_id', $tenantId)
            ->when($subjectIds, fn (Builder $q, array $ids) => $q->whereIn('subject_id', $ids))
            ->when($search, fn (Builder $q, string $v) => $q->where('name', 'like', '%'.$v.'%'))
            ->withCount(['questions' => fn (Builder $q) => $q->where('exam_questions.tenant_id', $tenantId)])
            ->orderBy('name')
            ->get();
    }

    /** Disciplinas ativas do tenant com a contagem de questões (árvore da taxonomia). */
    public function subjectsWithCounts(int $tenantId): SupportCollection
    {
        return Subject::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->select(['id', 'name'])
            ->selectSub(
                ExamQuestion::query()
                    ->inQuestionBank($tenantId)
                    ->whereColumn('exam_questions.subject_id', 'subjects.id')
                    ->selectRaw('count(*)'),
                'questions_count'
            )
            ->orderBy('name')
            ->get()
            ->map(fn (Subject $s) => ['id' => $s->id, 'name' => $s->name, 'questions_count' => (int) $s->questions_count]);
    }

    public function find(int $tenantId, int $id): SubjectTopic
    {
        $topic = SubjectTopic::query()->where('tenant_id', $tenantId)->find($id);

        if (! $topic) {
            throw new NotFoundHttpException('Assunto não encontrado.');
        }

        return $topic;
    }

    /** @param array{subject_id: int, name: string, description?: ?string} $data */
    public function create(int $tenantId, array $data): SubjectTopic
    {
        $subject = $this->resolveSubject($tenantId, (int) $data['subject_id']);
        $name = QuestionCatalogService::normalizeName($data['name']);
        $this->assertNameAvailable($subject->id, $name);

        return $this->guardUnique(fn () => SubjectTopic::create([
            'tenant_id'   => $tenantId,
            'subject_id'  => $subject->id,
            'name'        => $name,
            'description' => $data['description'] ?? null,
        ]));
    }

    /** @param array{subject_id?: int, name?: string, description?: ?string} $data */
    public function update(int $tenantId, int $id, array $data): SubjectTopic
    {
        $topic = $this->find($tenantId, $id);

        if (array_key_exists('subject_id', $data) && (int) $data['subject_id'] !== (int) $topic->subject_id) {
            $subject = $this->resolveSubject($tenantId, (int) $data['subject_id']);
            if ($topic->questions()->exists()) {
                throw QuestionBankException::conflict(
                    "O assunto \"{$topic->name}\" está em uso por questões e não pode mudar de disciplina."
                );
            }
            $topic->subject_id = $subject->id;
        }
        if (array_key_exists('name', $data)) {
            $topic->name = QuestionCatalogService::normalizeName($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $topic->description = $data['description'];
        }

        $this->assertNameAvailable((int) $topic->subject_id, $topic->name, $topic->id);

        return $this->guardUnique(function () use ($topic) {
            $topic->save();

            return $topic;
        });
    }

    public function delete(int $tenantId, int $id): void
    {
        $topic = $this->find($tenantId, $id);
        $inUse = $topic->questions()->count();

        if ($inUse > 0) {
            throw QuestionBankException::conflict(
                "O assunto \"{$topic->name}\" está em uso por {$inUse} questão(ões) e não pode ser excluído."
            );
        }

        $topic->delete();
    }

    private function resolveSubject(int $tenantId, int $subjectId): Subject
    {
        $subject = Subject::query()->where('tenant_id', $tenantId)->find($subjectId);

        if (! $subject) {
            throw new QuestionBankException('Disciplina não encontrada.');
        }

        return $subject;
    }

    private function assertNameAvailable(int $subjectId, string $name, ?int $ignoreId = null): void
    {
        $exists = SubjectTopic::query()
            ->where('subject_id', $subjectId)
            ->where('name', $name)
            ->when($ignoreId, fn (Builder $q, int $id) => $q->whereKeyNot($id))
            ->exists();

        if ($exists) {
            throw QuestionBankException::conflict("Já existe o assunto \"{$name}\" nesta disciplina.");
        }
    }

    private function guardUnique(callable $callback): SubjectTopic
    {
        try {
            return $callback();
        } catch (UniqueConstraintViolationException) {
            throw QuestionBankException::conflict('Já existe um assunto com esse nome nesta disciplina.');
        }
    }
}
