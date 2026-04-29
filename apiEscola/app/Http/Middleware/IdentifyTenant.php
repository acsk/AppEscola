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

        // Super admin não precisa de tenant
        if ($user->isSuperAdmin()) {
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
