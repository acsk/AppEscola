<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseBundleResource;
use App\Models\CourseBundle;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class CourseBundleController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/course-bundles',
        tags: ['CourseBundles'],
        summary: 'Listar pacotes de cursos',
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Lista de pacotes'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = CourseBundle::query()->with('courses');
        $this->applyTenantScope($query, $request);

        return CourseBundleResource::collection(
            $query->orderBy('name')->paginate(20)
        );
    }

    #[OA\Post(
        path: '/api/course-bundles',
        tags: ['CourseBundles'],
        summary: 'Criar pacote de cursos',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'billing_cycle', 'price', 'course_ids'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'CPM Completo'),
                    new OA\Property(property: 'description', type: 'string'),
                    new OA\Property(property: 'billing_cycle', type: 'string', enum: ['monthly','bimonthly','quadrimestral','semiannual','annual'], example: 'monthly'),
                    new OA\Property(property: 'price', type: 'number', format: 'float', example: 170.00),
                    new OA\Property(property: 'status', type: 'string', example: 'active'),
                    new OA\Property(
                        property: 'course_ids',
                        type: 'array',
                        description: 'IDs dos cursos que compõem o pacote',
                        items: new OA\Items(type: 'integer')
                    ),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Pacote criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'billing_cycle' => ['required', 'string', 'in:monthly,bimonthly,quadrimestral,semiannual,annual'],
            'price'         => ['required', 'numeric', 'min:0'],
            'status'        => ['nullable', 'exists:domain_statuses,slug'],
            'course_ids'    => ['required', 'array', 'min:2'],
            'course_ids.*'  => ['required', 'integer', 'exists:courses,id'],
        ]);

        $tenantId = $this->getTenantId($request);

        $bundle = CourseBundle::create([
            'tenant_id'     => $tenantId,
            'name'          => $data['name'],
            'description'   => $data['description'] ?? null,
            'billing_cycle' => $data['billing_cycle'],
            'price'         => $data['price'],
            'status'        => $data['status'] ?? 'active',
        ]);

        $bundle->courses()->sync($data['course_ids']);
        $bundle->load('courses');

        return $this->created(new CourseBundleResource($bundle));
    }

    #[OA\Get(
        path: '/api/course-bundles/{id}',
        tags: ['CourseBundles'],
        summary: 'Exibir pacote',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do pacote'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, CourseBundle $courseBundle): JsonResponse
    {
        $this->authorizeTenant($request, $courseBundle->tenant_id);
        $courseBundle->load('courses');

        return $this->success(new CourseBundleResource($courseBundle));
    }

    #[OA\Put(
        path: '/api/course-bundles/{id}',
        tags: ['CourseBundles'],
        summary: 'Atualizar pacote',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Pacote atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(Request $request, CourseBundle $courseBundle): JsonResponse
    {
        $this->authorizeTenant($request, $courseBundle->tenant_id);

        $data = $request->validate([
            'name'          => ['sometimes', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'billing_cycle' => ['sometimes', 'string', 'in:monthly,bimonthly,quadrimestral,semiannual,annual'],
            'price'         => ['sometimes', 'numeric', 'min:0'],
            'status'        => ['nullable', 'exists:domain_statuses,slug'],
            'course_ids'    => ['sometimes', 'array', 'min:2'],
            'course_ids.*'  => ['required', 'integer', 'exists:courses,id'],
        ]);

        $courseBundle->update(collect($data)->except('course_ids')->toArray());

        if (isset($data['course_ids'])) {
            $courseBundle->courses()->sync($data['course_ids']);
        }

        $courseBundle->load('courses');

        return $this->success(new CourseBundleResource($courseBundle));
    }

    #[OA\Delete(
        path: '/api/course-bundles/{id}',
        tags: ['CourseBundles'],
        summary: 'Remover pacote',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, CourseBundle $courseBundle): JsonResponse
    {
        $this->authorizeTenant($request, $courseBundle->tenant_id);
        $courseBundle->delete();

        return response()->json(['message' => 'Pacote removido com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
