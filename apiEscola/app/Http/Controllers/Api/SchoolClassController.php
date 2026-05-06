<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreSchoolClassRequest;
use App\Http\Requests\UpdateSchoolClassRequest;
use App\Http\Resources\SchoolClassResource;
use App\Models\SchoolClass;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class SchoolClassController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/school-classes',
        tags: ['SchoolClasses'],
        summary: 'Listar turmas',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'course_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'year', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'period', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de turmas'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = SchoolClass::query()->with(['course', 'schedules.subject', 'schedules.teacher', 'schedules.teachers']);
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('course_id'), fn ($q, $v) => $q->where('course_id', $v))
            ->when($request->query('year'), fn ($q, $v) => $q->where('year', $v))
            ->when($request->query('period'), fn ($q, $v) => $q->where('period', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"));

        return SchoolClassResource::collection($query->orderBy('name')->paginate(20));
    }

    #[OA\Post(
        path: '/api/school-classes',
        tags: ['SchoolClasses'],
        summary: 'Criar turma',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados da turma')),
        responses: [
            new OA\Response(response: 201, description: 'Turma criada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreSchoolClassRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $schoolClass = SchoolClass::create(array_merge($request->validated(), ['tenant_id' => $tenantId]));
        $schoolClass->load(['course', 'schedules.subject', 'schedules.teacher', 'schedules.teachers']);

        return $this->created(new SchoolClassResource($schoolClass));
    }

    #[OA\Get(
        path: '/api/school-classes/{id}',
        tags: ['SchoolClasses'],
        summary: 'Exibir turma',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados da turma'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, SchoolClass $schoolClass): JsonResponse
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $schoolClass->load(['course', 'schedules.subject', 'schedules.teacher', 'schedules.teachers']);

        return $this->success(new SchoolClassResource($schoolClass));
    }

    #[OA\Put(
        path: '/api/school-classes/{id}',
        tags: ['SchoolClasses'],
        summary: 'Atualizar turma',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Turma atualizada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateSchoolClassRequest $request, SchoolClass $schoolClass): JsonResponse
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $schoolClass->update($request->validated());
        $schoolClass->load(['course', 'schedules.subject', 'schedules.teacher', 'schedules.teachers']);

        return $this->success(new SchoolClassResource($schoolClass));
    }

    #[OA\Delete(
        path: '/api/school-classes/{id}',
        tags: ['SchoolClasses'],
        summary: 'Remover turma',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, SchoolClass $schoolClass): JsonResponse
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $schoolClass->delete();

        return response()->json(['message' => 'Turma removida com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
