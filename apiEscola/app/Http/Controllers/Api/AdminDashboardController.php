<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AdminDashboardService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDashboardController extends Controller
{
    use ScopedByTenant;

    private const STAFF_ROLES = [
        'super_admin',
        'admin',
        'manager',
        'financial',
        'secretaria',
        'professor',
    ];

    public function __construct(
        private readonly AdminDashboardService $dashboard,
    ) {
    }

    /**
     * Métricas agregadas do painel (view SQL + consultas leves).
     */
    public function show(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->requireTenantId($request);

        $schoolClassId = $request->filled('school_class_id')
            ? (int) $request->query('school_class_id')
            : null;

        $body = $this->dashboard->build($tenantId, $schoolClassId);

        return $this->success($body, 'Dashboard carregado com sucesso.');
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        $role = $request->user()?->role;

        if (! in_array($role, self::STAFF_ROLES, true)) {
            return $this->forbidden('Sem permissão para acessar o dashboard.');
        }

        return null;
    }
}
