<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreGuardianRequest;
use App\Http\Requests\UpdateGuardianRequest;
use App\Http\Resources\GuardianResource;
use App\Models\Guardian;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class GuardianController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/guardians',
        tags: ['Guardians'],
        summary: 'Listar responsáveis',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de responsáveis'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Guardian::query();
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"));

        return GuardianResource::collection($query->orderBy('name')->paginate(20));
    }

    #[OA\Post(
        path: '/api/guardians',
        tags: ['Guardians'],
        summary: 'Criar responsável',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do responsável')),
        responses: [
            new OA\Response(response: 201, description: 'Responsável criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreGuardianRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $validated = $request->validated();
        $document = $this->normalizeDocument((string) ($validated['document'] ?? ''));

        $guardian = null;
        if ($document !== '') {
            $guardian = Guardian::withTrashed()
                ->where('tenant_id', $tenantId)
                ->where('document', $document)
                ->first();
        }

        if ($guardian) {
            if (method_exists($guardian, 'trashed') && $guardian->trashed()) {
                $guardian->restore();
            }

            $guardian->update([
                'name' => $validated['name'],
                'document' => $document,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'relationship' => $validated['relationship'] ?? null,
            ]);
        } else {
            $guardian = Guardian::create(array_merge($validated, [
                'tenant_id' => $tenantId,
                'document' => $document,
            ]));
        }

        return $this->created(new GuardianResource($guardian));
    }

    #[OA\Get(
        path: '/api/guardians/{id}',
        tags: ['Guardians'],
        summary: 'Exibir responsável',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do responsável'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Guardian $guardian): JsonResponse
    {
        $this->authorizeTenant($request, $guardian->tenant_id);

        return $this->success(new GuardianResource($guardian));
    }

    #[OA\Put(
        path: '/api/guardians/{id}',
        tags: ['Guardians'],
        summary: 'Atualizar responsável',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Responsável atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateGuardianRequest $request, Guardian $guardian): JsonResponse
    {
        $this->authorizeTenant($request, $guardian->tenant_id);

        $guardian->update($request->validated());

        return $this->success(new GuardianResource($guardian));
    }

    #[OA\Delete(
        path: '/api/guardians/{id}',
        tags: ['Guardians'],
        summary: 'Remover responsável',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 422, description: 'Responsável vinculado a aluno'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Guardian $guardian): JsonResponse
    {
        $this->authorizeTenant($request, $guardian->tenant_id);

        if ($guardian->students()->exists()) {
            return response()->json([
                'message' => 'Não é permitido excluir responsável vinculado a aluno.',
            ], 422);
        }

        $guardian->delete();

        return response()->json(['message' => 'Responsável removido com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }

    private function normalizeDocument(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }
}
