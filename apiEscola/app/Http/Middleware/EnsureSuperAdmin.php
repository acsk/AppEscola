<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Rotas globais do Super Admin SaaS: nunca acessíveis por usuários de tenant. */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isSuperAdmin()) {
            return response()->json(['type' => 'error', 'message' => 'Acesso permitido apenas para super admin.', 'body' => null], 403);
        }

        return $next($request);
    }
}
