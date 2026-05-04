<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreCourseRequest;
use App\Http\Requests\UpdateCourseRequest;
use App\Http\Resources\CourseResource;
use App\Models\Course;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CourseController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/courses',
        tags: ['Courses'],
        summary: 'Listar cursos',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de cursos'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Course::query();
        $this->applyTenantScope($query, $request);

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('name', 'like', "%{$v}%"));

        return CourseResource::collection($query->orderBy('name')->paginate(20));
    }

    #[OA\Post(
        path: '/api/courses',
        tags: ['Courses'],
        summary: 'Criar curso',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do curso')),
        responses: [
            new OA\Response(response: 201, description: 'Curso criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreCourseRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $course = Course::create(array_merge($request->validated(), ['tenant_id' => $tenantId]));

        return $this->created(new CourseResource($course));
    }

    #[OA\Get(
        path: '/api/courses/{id}',
        tags: ['Courses'],
        summary: 'Exibir curso',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do curso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Course $course): JsonResponse
    {
        $this->authorizeTenant($request, $course->tenant_id);

        return $this->success(new CourseResource($course));
    }

    #[OA\Put(
        path: '/api/courses/{id}',
        tags: ['Courses'],
        summary: 'Atualizar curso',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Curso atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateCourseRequest $request, Course $course): JsonResponse
    {
        $this->authorizeTenant($request, $course->tenant_id);

        $course->update($request->validated());

        return $this->success(new CourseResource($course));
    }

    #[OA\Delete(
        path: '/api/courses/{id}',
        tags: ['Courses'],
        summary: 'Remover curso',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Course $course): JsonResponse
    {
        $this->authorizeTenant($request, $course->tenant_id);

        $course->delete();

        return response()->json(['message' => 'Curso removido com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
