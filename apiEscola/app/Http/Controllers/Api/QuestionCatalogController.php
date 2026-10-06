<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionCatalogItemRequest;
use App\Services\ExamAccessService;
use App\Services\QuestionCatalogService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** CRUD genérico dos cadastros simples do banco de questões (difficulties, boards, tags). */
class QuestionCatalogController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly QuestionCatalogService $catalogs,
    ) {}

    /** Lista os cadastros disponíveis (nome, rótulo e se aceita edição). */
    public function catalogs(Request $request): JsonResponse
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->success(collect(QuestionCatalogService::CATALOGS)->map(fn ($def, $key) => [
            'key'      => $key,
            'label'    => $def['label'],
            'editable' => $def['editable'],
        ])->values());
    }

    public function index(Request $request, string $catalog): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $items = $this->catalogs->list($catalog, $tenantId, $request->query('search'));

        return $this->success($items->map(fn ($item) => $this->present($item))->values());
    }

    public function store(QuestionCatalogItemRequest $request, string $catalog): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $item = $this->catalogs->create($catalog, $tenantId, $request->validated());

        return $this->created($this->present($item), 'Cadastro criado com sucesso.');
    }

    public function update(QuestionCatalogItemRequest $request, string $catalog, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $item = $this->catalogs->update($catalog, $tenantId, $id, $request->validated());

        return $this->success($this->present($item), 'Cadastro atualizado com sucesso.');
    }

    public function destroy(Request $request, string $catalog, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $this->catalogs->delete($catalog, $tenantId, $id);

        return $this->deleted('Cadastro removido com sucesso.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }

    private function present($item): array
    {
        return [
            'id'              => $item->id,
            'name'            => $item->name,
            'description'     => $item->description,
            'sort_order'      => $item->sort_order ?? null,
            'questions_count' => (int) ($item->questions_count ?? 0),
        ];
    }
}
