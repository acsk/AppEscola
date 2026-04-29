<?php

namespace App\Traits;

use Illuminate\Http\Request;

trait ScopedByTenant
{
    protected function getTenantId(Request $request): ?int
    {
        $user = $request->user();

        if ($user->isSuperAdmin()) {
            // Super admin pode filtrar por tenant via query param
            return $request->query('tenant_id') ? (int) $request->query('tenant_id') : null;
        }

        return $user->tenant_id;
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
