<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\Saas\SaasMetricsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super Admin SaaS: indicadores globais e visão administrativa de cada tenant. */
class SaasController extends Controller
{
    public function __construct(private readonly SaasMetricsService $metrics)
    {
    }

    public function dashboard(Request $request): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        $validated = $request->validate([
            'months' => ['nullable', 'integer', 'in:6,12,24'],
            'status' => ['nullable', 'exists:domain_statuses,slug'],
        ]);

        return $this->success(
            $this->metrics->dashboard((int) ($validated['months'] ?? 12), $validated['status'] ?? null),
            'Indicadores da plataforma carregados com sucesso.'
        );
    }

    public function tenantOverview(Request $request, Tenant $tenant): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        return $this->success($this->metrics->tenantOverview($tenant), 'Visão geral do tenant carregada com sucesso.');
    }
}
