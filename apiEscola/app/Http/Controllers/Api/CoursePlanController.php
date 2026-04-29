<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreCoursePlanRequest;
use App\Http\Requests\UpdateCoursePlanRequest;
use App\Http\Resources\CoursePlanResource;
use App\Models\Course;
use App\Models\CoursePlan;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CoursePlanController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/courses/{course}/plans',
        tags: ['CoursePlans'],
        summary: 'Listar planos de um curso',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'course', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista de planos do curso'),
            new OA\Response(response: 404, description: 'Curso não encontrado'),
        ]
    )]
    public function index(Request $request, Course $course): AnonymousResourceCollection
    {
        $this->authorizeTenant($request, $course->tenant_id);

        $query = $course->plans()
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v));

        return CoursePlanResource::collection($query->orderBy('billing_cycle')->get());
    }

    #[OA\Post(
        path: '/api/courses/{course}/plans',
        tags: ['CoursePlans'],
        summary: 'Criar plano para um curso',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'course', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'billing_cycle', 'price'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'Plano Mensal'),
                    new OA\Property(property: 'billing_cycle', type: 'string', enum: ['monthly', 'bimonthly', 'quadrimestral', 'semiannual', 'annual'], example: 'monthly'),
                    new OA\Property(property: 'price', type: 'number', format: 'float', example: 350.00),
                    new OA\Property(property: 'status', type: 'string', example: 'active'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Plano criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreCoursePlanRequest $request, Course $course): JsonResponse
    {
        $this->authorizeTenant($request, $course->tenant_id);

        $plan = $course->plans()->create(array_merge(
            $request->validated(),
            ['tenant_id' => $course->tenant_id]
        ));

        $plan->load('course');

        return response()->json(new CoursePlanResource($plan), 201);
    }

    #[OA\Get(
        path: '/api/course-plans/{plan}',
        tags: ['CoursePlans'],
        summary: 'Exibir plano',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'plan', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do plano'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, CoursePlan $plan): JsonResponse
    {
        $this->authorizeTenant($request, $plan->tenant_id);

        $plan->load('course');

        return response()->json(new CoursePlanResource($plan));
    }

    #[OA\Put(
        path: '/api/course-plans/{plan}',
        tags: ['CoursePlans'],
        summary: 'Atualizar plano',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'plan', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Plano atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateCoursePlanRequest $request, CoursePlan $plan): JsonResponse
    {
        $this->authorizeTenant($request, $plan->tenant_id);

        $plan->update($request->validated());
        $plan->load('course');

        return response()->json(new CoursePlanResource($plan));
    }

    #[OA\Delete(
        path: '/api/course-plans/{plan}',
        tags: ['CoursePlans'],
        summary: 'Remover plano',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'plan', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Plano removido'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, CoursePlan $plan): JsonResponse
    {
        $this->authorizeTenant($request, $plan->tenant_id);

        $plan->delete();

        return response()->json(['message' => 'Plano removido com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
