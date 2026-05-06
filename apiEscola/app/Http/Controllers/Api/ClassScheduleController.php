<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreClassScheduleRequest;
use App\Http\Requests\UpdateClassScheduleRequest;
use App\Http\Resources\ClassScheduleResource;
use App\Models\ClassSchedule;
use App\Models\SchoolClass;
use App\Models\User;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

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
            ->with(['subject', 'teacher', 'teachers'])
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

        $validated = $request->validated();
        $teacherIds = $this->resolveTeacherIdsFromPayload($validated);

        if ($teacherIds !== null) {
            $this->validateTeacherIds($teacherIds, $schoolClass->tenant_id);
            $validated['teacher_id'] = $teacherIds[0] ?? null;
        }

        unset($validated['teacher_ids']);

        $schedule = ClassSchedule::create(array_merge($validated, [
            'tenant_id' => $schoolClass->tenant_id,
            'school_class_id' => $schoolClass->id,
        ]));

        if ($teacherIds !== null) {
            $this->syncTeachers($schedule, $teacherIds);
        }

        $schedule->load(['subject', 'teacher', 'teachers']);

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

        $validated = $request->validated();
        $teacherIds = $this->resolveTeacherIdsFromPayload($validated);

        if ($teacherIds !== null) {
            $this->validateTeacherIds($teacherIds, $classSchedule->tenant_id);
            $validated['teacher_id'] = $teacherIds[0] ?? null;
        }

        unset($validated['teacher_ids']);

        $classSchedule->update($validated);

        if ($teacherIds !== null) {
            $this->syncTeachers($classSchedule, $teacherIds);
        }

        $classSchedule->load(['subject', 'teacher', 'teachers']);

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

    private function resolveTeacherIdsFromPayload(array $validated): ?array
    {
        if (array_key_exists('teacher_ids', $validated)) {
            $teacherIds = $validated['teacher_ids'] ?? [];

            return collect($teacherIds)
                ->filter(fn ($id) => $id !== null)
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();
        }

        if (array_key_exists('teacher_id', $validated)) {
            return $validated['teacher_id'] ? [(int) $validated['teacher_id']] : [];
        }

        return null;
    }

    private function validateTeacherIds(array $teacherIds, int $tenantId): void
    {
        if ($teacherIds === []) {
            return;
        }

        $validCount = User::query()
            ->where('tenant_id', $tenantId)
            ->where('role', 'professor')
            ->whereIn('id', $teacherIds)
            ->count();

        if ($validCount !== count($teacherIds)) {
            throw ValidationException::withMessages([
                'teacher_ids' => 'Um ou mais professores sao invalidos para este tenant.',
            ]);
        }
    }

    private function syncTeachers(ClassSchedule $classSchedule, array $teacherIds): void
    {
        $classSchedule->teachers()->syncWithPivotValues($teacherIds, [
            'tenant_id' => $classSchedule->tenant_id,
        ]);
    }
}
