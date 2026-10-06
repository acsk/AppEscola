<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SubjectTopicRequest;
use App\Models\SubjectTopic;
use App\Services\ExamAccessService;
use App\Services\QuestionBankQueryService;
use App\Services\SubjectTopicService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Assuntos de disciplina do banco de questões. */
class SubjectTopicController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly SubjectTopicService $topics,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $subjectIds = QuestionBankQueryService::idList($request->query('subject_id', []));
        $items = $this->topics->list($tenantId, $subjectIds ?: null, $request->query('search'));

        return $this->success($items->map(fn ($topic) => $this->present($topic))->values());
    }

    public function subjects(Request $request): JsonResponse
    {
        return $this->success($this->topics->subjectsWithCounts($this->authorizeStaff($request)));
    }

    public function store(SubjectTopicRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $topic = $this->topics->create($tenantId, $request->validated());

        return $this->created($this->present($topic), 'Assunto criado com sucesso.');
    }

    public function update(SubjectTopicRequest $request, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $topic = $this->topics->update($tenantId, $id, $request->validated());

        return $this->success($this->present($topic), 'Assunto atualizado com sucesso.');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $this->topics->delete($tenantId, $id);

        return $this->deleted('Assunto removido com sucesso.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }

    private function present(SubjectTopic $topic): array
    {
        return [
            'id'              => $topic->id,
            'subject_id'      => $topic->subject_id,
            'name'            => $topic->name,
            'description'     => $topic->description,
            'questions_count' => (int) ($topic->questions_count ?? 0),
        ];
    }
}
