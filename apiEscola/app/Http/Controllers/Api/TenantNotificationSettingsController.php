<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateNotificationCalendarSettingsRequest;
use App\Models\Tenant;
use App\Services\TenantNotificationSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantNotificationSettingsController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly TenantNotificationSettingsService $settings,
    ) {}

    public function show(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenant = $this->resolveTenant($request);

        return $this->success([
            'tenant_id'              => $tenant->id,
            'types'                  => config('student_notifications.types'),
            'calendar_enabled_types' => $this->settings->calendarEnabledTypes($tenant),
            'calendar_defaults'      => $this->settings->defaultCalendarEnabledTypes(),
            'calendar_type_map'      => config('student_notifications.calendar_type_map'),
            'calendar_type_labels'   => $this->settings->calendarTypeLabels(),
        ], 'Configurações de notificações carregadas.');
    }

    public function update(UpdateNotificationCalendarSettingsRequest $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenant = $this->resolveTenant($request);
        $this->ensureCanManage($request, $tenant);

        $enabled = $this->settings->updateCalendarEnabledTypes(
            $tenant,
            $request->calendarEnabledTypes(),
        );

        return $this->success([
            'tenant_id'              => $tenant->id,
            'calendar_enabled_types' => $enabled,
        ], 'Configurações de calendário salvas com sucesso.');
    }

    private function resolveTenant(Request $request): Tenant
    {
        $user = $request->user();

        if ($user && $user->isSuperAdmin() && $request->filled('tenant_id')) {
            return Tenant::findOrFail((int) $request->input('tenant_id'));
        }

        $tenantId = $this->requireTenantId($request);

        return Tenant::findOrFail($tenantId);
    }

    private function ensureCanManage(Request $request, Tenant $tenant): void
    {
        $user = $request->user();

        if (! $user) {
            throw new AccessDeniedHttpException('Não autenticado.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        $userRole = strtolower((string) ($user->role ?? ''));
        $isSameTenant = (int) $user->tenant_id === (int) $tenant->id;

        if ($isSameTenant && in_array($userRole, ['admin', 'manager', 'financial'], true)) {
            return;
        }

        throw new AccessDeniedHttpException(
            'Apenas administradores podem alterar quais notificações aparecem no calendário.'
        );
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'super_admin', 'professor', 'manager', 'financial'], true)) {
            return $this->forbidden('Sem permissão para acessar configurações de notificações.');
        }

        return null;
    }
}
