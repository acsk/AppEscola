<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\AttachGuardianRequest;
use App\Http\Resources\GuardianResource;
use App\Models\Guardian;
use App\Models\Student;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class StudentGuardianController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/students/{student}/guardians',
        tags: ['Guardians'],
        summary: 'Listar responsáveis do aluno',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'student', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Lista de responsáveis'),
            new OA\Response(response: 404, description: 'Aluno não encontrado'),
        ]
    )]
    public function index(Request $request, Student $student): AnonymousResourceCollection
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $student->load('guardians');

        return GuardianResource::collection($student->guardians);
    }

    #[OA\Post(
        path: '/api/students/{student}/guardians',
        tags: ['Guardians'],
        summary: 'Vincular responsável ao aluno',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'student', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['guardian_id'],
                properties: [
                    new OA\Property(property: 'guardian_id', type: 'integer'),
                    new OA\Property(property: 'is_financial_responsible', type: 'boolean'),
                    new OA\Property(property: 'is_pedagogical_responsible', type: 'boolean'),
                    new OA\Property(property: 'can_access_portal', type: 'boolean'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Responsáveis vinculados'),
            new OA\Response(response: 422, description: 'Responsável de outro tenant'),
        ]
    )]
    public function store(AttachGuardianRequest $request, Student $student): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $guardianId = $request->input('guardian_id');

        // Garante que o responsável pertence ao mesmo tenant
        $guardian = Guardian::where('id', $guardianId)
            ->where('tenant_id', $student->tenant_id)
            ->firstOrFail();

        $student->guardians()->syncWithoutDetaching([
            $guardian->id => [
                'tenant_id' => $student->tenant_id,
                'is_financial_responsible' => $request->boolean('is_financial_responsible', false),
                'is_pedagogical_responsible' => $request->boolean('is_pedagogical_responsible', false),
                'can_access_portal' => $request->boolean('can_access_portal', true),
            ],
        ]);

        $student->load('guardians');

        return response()->json(GuardianResource::collection($student->guardians));
    }

    #[OA\Delete(
        path: '/api/students/{student}/guardians/{guardian}',
        tags: ['Guardians'],
        summary: 'Desvincular responsável do aluno',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'student', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'guardian', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Responsável desvinculado'),
            new OA\Response(response: 422, description: 'Violação de regra (menor sem resp. financeiro)'),
        ]
    )]
    public function destroy(Request $request, Student $student, Guardian $guardian): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        // Valida responsável financeiro obrigatório para menor
        if ($student->is_minor) {
            $pivot = $student->guardians()->find($guardian->id)?->pivot;
            if ($pivot?->is_financial_responsible) {
                $otherFinancial = $student->guardians()
                    ->wherePivot('is_financial_responsible', true)
                    ->where('guardians.id', '!=', $guardian->id)
                    ->count();

                if ($otherFinancial === 0) {
                    return response()->json([
                        'message' => 'Aluno menor deve ter pelo menos um responsável financeiro.',
                    ], 422);
                }
            }
        }

        $student->guardians()->detach($guardian->id);

        return response()->json(['message' => 'Responsável desvinculado com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
