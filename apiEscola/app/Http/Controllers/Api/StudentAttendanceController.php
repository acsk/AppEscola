<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStudentAttendanceBatchRequest;
use App\Http\Resources\StudentAttendanceResource;
use App\Models\Enrollment;
use App\Models\ClassSchedule;
use App\Models\SchoolClass;
use App\Models\StudentAttendance;
use App\Traits\ScopedByTenant;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;

class StudentAttendanceController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/school-classes/{schoolClass}/attendances',
        tags: ['StudentAttendances'],
        summary: 'Listar frequencias da turma',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'schoolClass', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'attendance_date', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'student_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista de frequencias da turma'),
            new OA\Response(response: 401, description: 'Nao autenticado'),
        ]
    )]
    public function index(Request $request, SchoolClass $schoolClass): AnonymousResourceCollection
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $attendanceDate = $request->query('attendance_date')
            ? Carbon::parse($request->query('attendance_date'))
            : now();

        if (! $this->canDisplayAttendanceForDate($schoolClass, $attendanceDate)) {
            return StudentAttendanceResource::collection(collect());
        }

        $query = StudentAttendance::query()
            ->where('school_class_id', $schoolClass->id)
            ->with('student')
            ->whereDate('attendance_date', $attendanceDate->toDateString())
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v));

        return StudentAttendanceResource::collection(
            $query->orderByDesc('attendance_date')->orderBy('student_id')->paginate(100)
        );
    }

    #[OA\Post(
        path: '/api/school-classes/{schoolClass}/attendances',
        tags: ['StudentAttendances'],
        summary: 'Lancamento de frequencia em lote por turma e dia',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'schoolClass', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Data e lista de alunos com status da frequencia')),
        responses: [
            new OA\Response(response: 201, description: 'Frequencias lancadas/atualizadas com sucesso'),
            new OA\Response(response: 422, description: 'Dados invalidos'),
        ]
    )]
    public function store(StoreStudentAttendanceBatchRequest $request, SchoolClass $schoolClass): JsonResponse
    {
        $this->authorizeTenant($request, $schoolClass->tenant_id);

        $validated = $request->validated();
        $attendanceDate = Carbon::parse($validated['attendance_date']);

        $schedule = $this->resolveScheduleForDate($schoolClass, $attendanceDate);
        if (! $schedule) {
            throw ValidationException::withMessages([
                'attendance_date' => 'Nao ha aula cadastrada para esta turma na data informada.',
            ]);
        }

        if (! $this->isAttendanceUpdateAllowed($attendanceDate, $schedule)) {
            throw ValidationException::withMessages([
                'attendance_date' => 'A frequencia so pode ser atualizada apos o inicio da primeira aula cadastrada para este dia.',
            ]);
        }

        $studentIds = collect($validated['records'])->pluck('student_id')->unique()->values();

        $enrolledStudentIds = Enrollment::query()
            ->where('tenant_id', $schoolClass->tenant_id)
            ->forSchoolClass($schoolClass->id)
            ->whereNotIn('status', ['cancelled'])
            ->whereIn('student_id', $studentIds)
            ->pluck('student_id')
            ->unique();

        if ($enrolledStudentIds->count() !== $studentIds->count()) {
            throw ValidationException::withMessages([
                'records' => 'Um ou mais alunos nao pertencem a turma informada.',
            ]);
        }

        DB::transaction(function () use ($validated, $schoolClass): void {
            foreach ($validated['records'] as $record) {
                StudentAttendance::query()->updateOrCreate(
                    [
                        'school_class_id' => $schoolClass->id,
                        'student_id' => $record['student_id'],
                        'attendance_date' => $validated['attendance_date'],
                    ],
                    [
                        'tenant_id' => $schoolClass->tenant_id,
                        'status' => $record['status'],
                        'notes' => $record['notes'] ?? null,
                    ]
                );
            }
        });

        $attendances = StudentAttendance::query()
            ->where('school_class_id', $schoolClass->id)
            ->whereDate('attendance_date', $validated['attendance_date'])
            ->whereIn('student_id', $studentIds)
            ->with('student')
            ->orderBy('student_id')
            ->get();

        return $this->created(StudentAttendanceResource::collection($attendances), 'Frequencia lancada com sucesso.');
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }

    private function canDisplayAttendanceForDate(SchoolClass $schoolClass, Carbon $attendanceDate): bool
    {
        return $this->resolveScheduleForDate($schoolClass, $attendanceDate) !== null;
    }

    private function resolveScheduleForDate(SchoolClass $schoolClass, Carbon $attendanceDate): ?ClassSchedule
    {
        if ($schoolClass->start_date && $attendanceDate->lt($schoolClass->start_date->copy()->startOfDay())) {
            return null;
        }

        if ($schoolClass->end_date && $attendanceDate->gt($schoolClass->end_date->copy()->endOfDay())) {
            return null;
        }

        $weekday = strtolower($attendanceDate->englishDayOfWeek);

        return ClassSchedule::query()
            ->where('tenant_id', $schoolClass->tenant_id)
            ->where('school_class_id', $schoolClass->id)
            ->where('weekday', $weekday)
            ->orderBy('start_time')
            ->first();
    }

    private function isAttendanceUpdateAllowed(Carbon $attendanceDate, ClassSchedule $schedule): bool
    {
        $attendanceStart = Carbon::parse($attendanceDate->toDateString() . ' ' . $schedule->start_time);

        return now()->greaterThanOrEqualTo($attendanceStart);
    }
}
