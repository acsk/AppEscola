<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCalendarEventRequest;
use App\Http\Requests\UpdateCalendarEventRequest;
use App\Http\Resources\CalendarEventResource;
use App\Models\CalendarEvent;
use App\Models\Course;
use App\Models\SchoolClass;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class CalendarEventController extends Controller
{
    use ScopedByTenant;

    public function types(): JsonResponse
    {
        return $this->success([
            'types'          => config('calendar_events.types'),
            'audience_types' => config('calendar_events.audience_types'),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);
        [$from, $to] = $this->parseRange($request);

        $query = CalendarEvent::query()
            ->where('tenant_id', $tenantId)
            ->with(['course:id,name', 'schoolClass:id,name'])
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('starts_at', [$from, $to])
                    ->orWhereBetween('ends_at', [$from, $to])
                    ->orWhere(function ($span) use ($from, $to) {
                        $span->where('starts_at', '<=', $from)
                            ->where(function ($end) use ($to) {
                                $end->whereNull('ends_at')->orWhere('ends_at', '>=', $to);
                            });
                    });
            })
            ->orderBy('starts_at');

        if ($request->filled('course_id')) {
            $query->where('course_id', (int) $request->query('course_id'));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        $events = $query->get();

        return $this->success([
            'from'   => $from->toISOString(),
            'to'     => $to->toISOString(),
            'items'  => CalendarEventResource::collection($events),
        ]);
    }

    public function store(StoreCalendarEventRequest $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);
        $data = $request->validated();
        $this->assertAudience($tenantId, $data);

        $event = CalendarEvent::create([
            'tenant_id'       => $tenantId,
            'source_type'     => 'manual',
            'source_id'       => null,
            'type'            => $data['type'],
            'title'           => $data['title'],
            'description'     => $data['description'] ?? null,
            'starts_at'       => $data['starts_at'],
            'ends_at'         => $data['ends_at'] ?? null,
            'all_day'         => (bool) ($data['all_day'] ?? false),
            'course_id'       => $data['course_id'] ?? null,
            'school_class_id' => $data['school_class_id'] ?? null,
            'location'        => $data['location'] ?? null,
            'audience_type'   => $data['audience_type'],
            'audience_params' => $this->audienceParams($data),
            'is_published'    => (bool) ($data['is_published'] ?? true),
            'created_by'      => $request->user()->id,
            'updated_by'      => $request->user()->id,
        ]);

        $event->load(['course:id,name', 'schoolClass:id,name']);

        return $this->created(
            new CalendarEventResource($event),
            'Evento criado com sucesso.'
        );
    }

    public function update(UpdateCalendarEventRequest $request, CalendarEvent $calendarEvent): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);

        if ((int) $calendarEvent->tenant_id !== $tenantId) {
            return $this->notFound('Evento não encontrado.');
        }

        if (in_array($calendarEvent->source_type, ['exam', 'invoice', 'notification_broadcast'], true)) {
            $label = match ($calendarEvent->source_type) {
                'invoice' => 'cobranças',
                'notification_broadcast' => 'notificações',
                default => 'simulados',
            };

            return $this->error(
                "Eventos gerados por {$label} são atualizados automaticamente no cadastro original.",
                null,
                422,
            );
        }

        $data = $request->validated();
        if ($data !== []) {
            $merged = array_merge($calendarEvent->only([
                'audience_type', 'course_id', 'school_class_id',
            ]), $data);
            $this->assertAudience($tenantId, $merged);
            if (isset($data['audience_type']) || isset($data['course_id']) || isset($data['school_class_id'])) {
                $data['audience_params'] = $this->audienceParams($merged);
            }
        }

        $data['updated_by'] = $request->user()->id;
        $calendarEvent->update($data);
        $calendarEvent->load(['course:id,name', 'schoolClass:id,name']);

        return $this->success(
            new CalendarEventResource($calendarEvent),
            'Evento atualizado com sucesso.'
        );
    }

    public function destroy(Request $request, CalendarEvent $calendarEvent): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);

        if ((int) $calendarEvent->tenant_id !== $tenantId) {
            return $this->notFound('Evento não encontrado.');
        }

        if ($calendarEvent->source_type === 'exam') {
            return $this->error(
                'Remova ou arquive o simulado para retirar este evento do calendário.',
                null,
                422,
            );
        }

        if ($calendarEvent->source_type === 'invoice') {
            return $this->error(
                'Cancele ou marque como paga a cobrança para retirar este evento do calendário.',
                null,
                422,
            );
        }

        if ($calendarEvent->source_type === 'notification_broadcast') {
            return $this->error(
                'Este evento foi criado a partir de uma notificação enviada e não pode ser removido aqui.',
                null,
                422,
            );
        }

        $calendarEvent->delete();

        return $this->deleted('Evento removido com sucesso.');
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function parseRange(Request $request): array
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfMonth();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : (clone $from)->endOfMonth();

        if ($to->lt($from)) {
            throw ValidationException::withMessages([
                'to' => ['A data final deve ser posterior à inicial.'],
            ]);
        }

        return [$from, $to];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function audienceParams(array $data): array
    {
        return match ($data['audience_type'] ?? 'tenant') {
            'course' => ['course_id' => (int) ($data['course_id'] ?? 0)],
            'school_class' => ['school_class_id' => (int) ($data['school_class_id'] ?? 0)],
            default => [],
        };
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function assertAudience(int $tenantId, array $data): void
    {
        $audience = $data['audience_type'] ?? 'tenant';

        if ($audience === 'course') {
            if (empty($data['course_id'])) {
                throw ValidationException::withMessages([
                    'course_id' => ['Informe o curso para este público.'],
                ]);
            }
            $exists = Course::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) $data['course_id'])
                ->exists();
            if (! $exists) {
                throw ValidationException::withMessages(['course_id' => ['Curso inválido.']]);
            }
        }

        if ($audience === 'school_class') {
            if (empty($data['school_class_id'])) {
                throw ValidationException::withMessages([
                    'school_class_id' => ['Informe a turma para este público.'],
                ]);
            }
            $exists = SchoolClass::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) $data['school_class_id'])
                ->exists();
            if (! $exists) {
                throw ValidationException::withMessages(['school_class_id' => ['Turma inválida.']]);
            }
        }
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'super_admin', 'professor'], true)) {
            return $this->forbidden('Sem permissão para gerenciar o calendário.');
        }

        return null;
    }
}
