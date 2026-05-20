<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CalendarEventResource;
use App\Models\Student;
use App\Services\CalendarEventVisibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class StudentCalendarController extends Controller
{
    public function __construct(
        private readonly CalendarEventVisibilityService $visibility,
    ) {}

    public function types(Request $request): JsonResponse
    {
        [, , $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        return $this->success([
            'types' => config('calendar_events.types'),
        ], 'Tipos de evento do calendário.');
    }

    public function index(Request $request): JsonResponse
    {
        [$user, $student, $error] = $this->resolveAluno($request);
        if ($error) {
            return $error;
        }

        [$from, $to] = $this->parseRange($request);

        $events = $this->visibility
            ->studentEventsQuery((int) $user->tenant_id, $student, $from, $to)
            ->with(['course:id,name', 'schoolClass:id,name'])
            ->get();

        return $this->success([
            'from'  => $from->toISOString(),
            'to'    => $to->toISOString(),
            'items' => CalendarEventResource::collection($events),
        ], 'Agenda carregada com sucesso.');
    }

    /**
     * @return array{0: \App\Models\User|null, 1: Student|null, 2: JsonResponse|null}
     */
    private function resolveAluno(Request $request): array
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return [null, null, $this->forbidden('Este endpoint é exclusivo para alunos.')];
        }

        $student = Student::query()
            ->where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return [null, null, $this->forbidden('Aluno não encontrado ou inativo.')];
        }

        return [$user, $student, null];
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function parseRange(Request $request): array
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfWeek(Carbon::MONDAY);
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : (clone $from)->endOfWeek(Carbon::SUNDAY);

        if ($to->lt($from)) {
            throw ValidationException::withMessages([
                'to' => ['A data final deve ser posterior à inicial.'],
            ]);
        }

        return [$from, $to];
    }
}
