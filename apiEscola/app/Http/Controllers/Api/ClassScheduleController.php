<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreClassScheduleRequest;
use App\Http\Requests\UpdateClassScheduleRequest;
use App\Http\Resources\ClassScheduleResource;
use App\Models\ClassSchedule;
use App\Models\SchoolClass;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ClassScheduleController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/school-classes/{schoolClass}/schedules',
        tags: ['ClassSchedules'],
        summary: 'Listar horários da turma',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'schoolClass', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'weekday', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Horários da turma'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request, SchoolClass $schoolClass): AnonymousResourceCollection
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $schedules = ClassSchedule::query()
            ->where('school_class_id', $schoolClass->id)
            ->with(['subject', 'teacher'])
            ->when($request->query('weekday'), fn ($q, $v) => $q->where('weekday', $v))
            ->orderBy('weekday')
            ->orderBy('start_time')
            ->paginate(50);

        return ClassScheduleResource::collection($schedules);
    }

    #[OA\Post(
        path: '/api/school-classes/{schoolClass}/schedules',
        tags: ['ClassSchedules'],
        summary: 'Criar horário na turma',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'schoolClass', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do horário')),
        responses: [
            new OA\Response(response: 201, description: 'Horário criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreClassScheduleRequest $request, SchoolClass $schoolClass): JsonResponse
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $schedule = ClassSchedule::create(array_merge($request->validated(), [
            'tenant_id' => $schoolClass->tenant_id,
            'school_class_id' => $schoolClass->id,
        ]));

        $schedule->load(['subject', 'teacher']);

        return $this->created(new ClassScheduleResource($schedule));
    }

    #[OA\Put(
        path: '/api/class-schedules/{classSchedule}',
        tags: ['ClassSchedules'],
        summary: 'Atualizar horário',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'classSchedule', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Horário atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdateClassScheduleRequest $request, ClassSchedule $classSchedule): JsonResponse
    {
        $this->authorizeTenant($request, $classSchedule->tenant_id);

        $classSchedule->update($request->validated());
        $classSchedule->load(['subject', 'teacher']);

        return $this->success(new ClassScheduleResource($classSchedule));
    }

    #[OA\Delete(
        path: '/api/class-schedules/{classSchedule}',
        tags: ['ClassSchedules'],
        summary: 'Remover horário',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'classSchedule', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, ClassSchedule $classSchedule): JsonResponse
    {
        $this->authorizeTenant($request, $classSchedule->tenant_id);

        $classSchedule->delete();

        return response()->json(['message' => 'Horário removido com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
