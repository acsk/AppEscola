<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloqueios de conta em toda requisição autenticada (não só no login):
 * - usuário não ativo → token revogado e 401 (o painel e o app voltam para o login com a mensagem);
 * - tenant suspenso → aluno e responsável sem acesso (401); equipe só leitura (escritas recebem 403).
 */
class EnforceAccountStatus
{
    public const STUDENT_ROLES = ['aluno', 'responsavel'];

    /** Escritas permitidas à equipe de tenant suspenso. */
    private const SUSPENDED_WRITE_ALLOWLIST = ['api/logout', 'api/me/password'];

    public const SUSPENDED_STUDENT_MESSAGE = 'O acesso ao app está temporariamente suspenso pela instituição. Procure a secretaria.';

    public const SUSPENDED_STAFF_MESSAGE = 'Instituição suspensa: o sistema está em modo somente leitura. Fale com o suporte para reativar.';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        if ($user->status !== 'active') {
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            return response()->json(['type' => 'error', 'code' => 'user_blocked', 'message' => 'Seu acesso foi bloqueado. Procure a administração da instituição.', 'body' => null], 401);
        }

        if ($user->isSuperAdmin() || ! $user->tenant_id || self::tenantStatus((int) $user->tenant_id) !== 'suspended') {
            return $next($request);
        }

        if (in_array($user->role, self::STUDENT_ROLES, true)) {
            return response()->json(['type' => 'error', 'code' => 'tenant_suspended', 'message' => self::SUSPENDED_STUDENT_MESSAGE, 'body' => null], 401);
        }

        if (! $request->isMethodSafe() && ! $request->is(...self::SUSPENDED_WRITE_ALLOWLIST)) {
            return response()->json(['type' => 'error', 'code' => 'tenant_suspended', 'message' => self::SUSPENDED_STAFF_MESSAGE, 'body' => null], 403);
        }

        return $next($request);
    }

    public static function tenantStatus(int $tenantId): ?string
    {
        return Cache::remember("tenant:status:{$tenantId}", 60, fn () => Tenant::query()->whereKey($tenantId)->value('status'));
    }

    public static function forgetTenantStatus(int $tenantId): void
    {
        Cache::forget("tenant:status:{$tenantId}");
    }
}
