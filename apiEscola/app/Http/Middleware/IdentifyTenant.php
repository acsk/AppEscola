<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
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
            $selectedTenantId = TenantContext::selectedTenantIdForSuperAdmin($request, $user);

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
}
