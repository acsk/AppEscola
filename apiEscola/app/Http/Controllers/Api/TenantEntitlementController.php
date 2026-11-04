<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\Saas\SaasEntitlementService;
use App\Services\Saas\TenantQuotaService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** O que o tenant logado pode usar: status, funcionalidades e alertas de limite (para o painel avisar e esconder menus). */
class TenantEntitlementController extends Controller
{
    use ScopedByTenant;

    public function show(Request $request, SaasEntitlementService $entitlements, TenantQuotaService $quotas): JsonResponse
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $this->success(['tenant_status' => null, 'features' => null, 'quota_alerts' => []], 'Sem instituição selecionada.');
        }
        $resolved = $entitlements->forTenant($tenantId);

        return $this->success([
            'tenant_status' => Tenant::query()->whereKey($tenantId)->value('status'),
            'plan' => $resolved['plan'],
            'features' => collect($resolved['features'])->map(fn ($f) => $f['enabled']),
            'quota_alerts' => $quotas->alerts($tenantId),
        ], 'Permissões da instituição carregadas.');
    }
}
