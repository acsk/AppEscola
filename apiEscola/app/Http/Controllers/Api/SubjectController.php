<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreSubjectRequest;
use App\Http\Requests\UpdateSubjectRequest;
use App\Http\Resources\SubjectResource;
use App\Models\Subject;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class SubjectController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/subjects',
        tags: ['Subjects'],
        summary: 'Listar disciplinas',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de disciplinas'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Subject::query();
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"));

        return SubjectResource::collection($query->orderBy('name')->paginate(20));
    }

    #[OA\Post(
        path: '/api/subjects',
        tags: ['Subjects'],
        summary: 'Criar disciplina',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados da disciplina')),
        responses: [
            new OA\Response(response: 201, description: 'Disciplina criada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreSubjectRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $subject = Subject::create(array_merge($request->validated(), ['tenant_id' => $tenantId]));

        return $this->created(new SubjectResource($subject));
    }

    #[OA\Get(
        path: '/api/subjects/{id}',
        tags: ['Subjects'],
        summary: 'Exibir disciplina',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados da disciplina'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Subject $subject): JsonResponse
    {
        $this->authorizeTenant($request, $subject->tenant_id);

        return $this->success(new SubjectResource($subject));
    }

    #[OA\Put(
        path: '/api/subjects/{id}',
        tags: ['Subjects'],
        summary: 'Atualizar disciplina',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Disciplina atualizada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateSubjectRequest $request, Subject $subject): JsonResponse
    {
        $this->authorizeTenant($request, $subject->tenant_id);

        $subject->update($request->validated());

        return $this->success(new SubjectResource($subject));
    }

    #[OA\Delete(
        path: '/api/subjects/{id}',
        tags: ['Subjects'],
        summary: 'Remover disciplina',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Subject $subject): JsonResponse
    {
        $this->authorizeTenant($request, $subject->tenant_id);

        $subject->delete();

        return response()->json(['message' => 'Disciplina removida com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
