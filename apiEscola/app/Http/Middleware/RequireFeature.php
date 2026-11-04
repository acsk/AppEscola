<?php

namespace App\Http\Middleware;

use App\Models\SaasFeature;
use App\Services\Saas\SaasEntitlementService;
use App\Traits\ScopedByTenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `feature:<chave>` — bloqueia a rota quando a funcionalidade não está disponível para o tenant
 * (plano, exceção ou status global). Super admin fora de um tenant não é afetado.
 */
class RequireFeature
{
    use ScopedByTenant;

    public function __construct(private readonly SaasEntitlementService $entitlements)
    {
    }

    public function handle(Request $request, Closure $next, string ...$features): Response
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $next($request);
        }

        foreach ($features as $feature) {
            if (! $this->entitlements->allows($tenantId, $feature)) {
                $name = SaasFeature::query()->where('key', $feature)->value('name') ?? $feature;

                return response()->json([
                    'type' => 'error',
                    'code' => 'feature_unavailable',
                    'message' => "{$name} não está disponível no plano da instituição.",
                    'body' => ['feature' => $feature],
                ], 403);
            }
        }

        return $next($request);
    }
}
