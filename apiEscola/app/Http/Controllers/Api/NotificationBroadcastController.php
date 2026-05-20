<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SendStudentNotificationRequest;
use App\Http\Resources\NotificationBroadcastResource;
use App\Models\NotificationBroadcast;
use App\Models\Tenant;
use App\Services\StudentNotificationService;
use App\Services\TenantNotificationSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationBroadcastController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly StudentNotificationService $notificationService,
        private readonly TenantNotificationSettingsService $notificationSettings,
    ) {}

    public function types(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);
        $tenant = Tenant::findOrFail($tenantId);

        return $this->success([
            'types'                  => config('student_notifications.types'),
            'audience_types'         => config('student_notifications.audience_types'),
            'calendar_enabled_types' => $this->notificationSettings->calendarEnabledTypes($tenant),
            'calendar_type_labels'   => $this->notificationSettings->calendarTypeLabels(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);

        $perPage = min(max((int) $request->query('per_page', 20), 1), 50);

        $paginator = NotificationBroadcast::query()
            ->where('tenant_id', $tenantId)
            ->with('sentBy:id,name')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return $this->success([
            'items' => NotificationBroadcastResource::collection($paginator->items()),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'last_page'    => $paginator->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, NotificationBroadcast $broadcast): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);

        if ((int) $broadcast->tenant_id !== $tenantId) {
            return $this->notFound('Envio não encontrado.');
        }

        $broadcast->load('sentBy:id,name');

        return $this->success(
            new NotificationBroadcastResource($broadcast),
            'Detalhes do envio carregados com sucesso.'
        );
    }

    public function preview(SendStudentNotificationRequest $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);
        $audienceParams = $request->audienceParams();

        $this->notificationService->assertAudienceBelongsToTenant(
            $tenantId,
            $request->input('audience_type'),
            $audienceParams,
        );

        $count = $this->notificationService->previewRecipientCount(
            $tenantId,
            $request->input('audience_type'),
            $audienceParams,
        );

        return $this->success([
            'recipients_count' => $count,
        ]);
    }

    public function send(SendStudentNotificationRequest $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);
        $audienceParams = $request->audienceParams();

        $this->notificationService->assertAudienceBelongsToTenant(
            $tenantId,
            $request->input('audience_type'),
            $audienceParams,
        );

        $broadcast = $this->notificationService->send(
            tenantId: $tenantId,
            sender: $request->user(),
            type: $request->input('type'),
            title: $request->input('title'),
            body: $request->input('body'),
            audienceType: $request->input('audience_type'),
            audienceParams: $audienceParams,
            data: $request->input('data'),
            showOnCalendar: $request->showOnCalendar(),
            startsAt: $request->showOnCalendar() ? \Illuminate\Support\Carbon::parse($request->input('starts_at')) : null,
            endsAt: $request->showOnCalendar() ? \Illuminate\Support\Carbon::parse($request->input('ends_at')) : null,
        );

        if ($broadcast->recipients_count === 0 && ! $broadcast->show_on_calendar) {
            return $this->error(
                'Nenhum aluno elegível recebeu a notificação. Verifique matrículas ativas e acesso ao app.',
                ['recipients_count' => 0],
                422,
            );
        }

        $calendarNote = $broadcast->show_on_calendar ? ' Também publicado no calendário.' : '';

        return $this->created(
            new NotificationBroadcastResource($broadcast),
            "Notificação enviada para {$broadcast->recipients_count} aluno(s).{$calendarNote}"
        );
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'super_admin', 'professor'], true)) {
            return $this->forbidden('Sem permissão para gerenciar notificações.');
        }

        return null;
    }
}
