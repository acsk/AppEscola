<?php

namespace App\Traits;

use Illuminate\Http\Request;

trait ScopedByTenant
{
    protected function getTenantId(Request $request): ?int
    {
        if ($request->filled('_tenant_id')) {
            return (int) $request->input('_tenant_id');
        }

        $user = $request->user();

        if (! $user) {
            return null;
        }

        if ($user->isSuperAdmin()) {
            // Super admin pode filtrar por tenant via query param
            if ($request->query('tenant_id')) {
                return (int) $request->query('tenant_id');
            }

            if ($request->filled('tenant_id')) {
                return (int) $request->input('tenant_id');
            }

            return null;
        }

        return $user->tenant_id ? (int) $user->tenant_id : null;
    }

    protected function requireTenantId(Request $request): int
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId === null) {
            abort(422, 'tenant_id é obrigatório para esta operação.');
        }

        return $tenantId;
    }

    protected function applyTenantScope($query, Request $request)
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        return $query;
    }
}
