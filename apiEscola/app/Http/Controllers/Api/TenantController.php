<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreTenantRequest;
use App\Http\Requests\UpdateTenantRequest;
use App\Http\Resources\TenantResource;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TenantController extends Controller
{
    #[OA\Get(
        path: '/api/tenants',
        tags: ['Tenants'],
        summary: 'Listar tenants',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de tenants'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $tenants = Tenant::query()
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"))
            ->orderBy('name')
            ->paginate(20);

        return TenantResource::collection($tenants);
    }

    #[OA\Post(
        path: '/api/tenants',
        tags: ['Tenants'],
        summary: 'Criar tenant',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do tenant')),
        responses: [
            new OA\Response(response: 201, description: 'Tenant criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreTenantRequest $request): JsonResponse
    {
        $tenant = Tenant::create($request->validated());

        return $this->created(new TenantResource($tenant));
    }

    #[OA\Get(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Exibir tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do tenant'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Tenant $tenant): TenantResource
    {
        return new TenantResource($tenant);
    }

    #[OA\Put(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Atualizar tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Tenant atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateTenantRequest $request, Tenant $tenant): TenantResource
    {
        $tenant->update($request->validated());

        return new TenantResource($tenant);
    }

    #[OA\Delete(
        path: '/api/tenants/{id}',
        tags: ['Tenants'],
        summary: 'Remover tenant',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Tenant $tenant): JsonResponse
    {
        $tenant->delete();

        return response()->json(['message' => 'Tenant removido com sucesso.']);
    }
}
