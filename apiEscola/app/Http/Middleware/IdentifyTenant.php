<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class IdentifyTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        // Super admin pode operar sem tenant, ou escolher um tenant via query/token.
        if ($user->isSuperAdmin()) {
            $selectedTenantId = null;

            if ($request->query('tenant_id')) {
                $selectedTenantId = (int) $request->query('tenant_id');
            } else {
                $selectedTenantId = $this->resolveTenantIdFromAbilities((array) ($user->currentAccessToken()?->abilities ?? []));
            }

            if ($selectedTenantId !== null) {
                $request->merge([
                    '_tenant_id' => $selectedTenantId,
                    'tenant_id' => $selectedTenantId,
                ]);
            }

            return $next($request);
        }

        if (! $user->tenant_id) {
            return response()->json([
                'message' => 'Usuário sem tenant associado.',
            ], 403);
        }

        // Injeta tenant_id na request para uso nos controllers
        $request->merge(['_tenant_id' => $user->tenant_id]);

        return $next($request);
    }

    private function resolveTenantIdFromAbilities(array $abilities): ?int
    {
        foreach ($abilities as $ability) {
            if (! is_string($ability) || ! str_starts_with($ability, 'tenant:')) {
                continue;
            }

            $value = substr($ability, strlen('tenant:'));

            if (is_numeric($value)) {
                return (int) $value;
            }
        }

        return null;
    }
}
