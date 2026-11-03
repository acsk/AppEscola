<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * "Acessar tenant" do super admin: emite um token próprio, preso ao tenant (ability "tenant:{id}")
 * e com validade curta, sem mexer no token da sessão do super admin. Cada acesso fica no log.
 */
class TenantAccessController extends Controller
{
    private const TOKEN_NAME = 'support-access';

    private const VALID_HOURS = 8;

    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        if ($tenant->status !== 'active') {
            return $this->validationError(
                ['tenant' => ['Tenant inativo.']],
                'Não é possível acessar um tenant inativo.'
            );
        }

        $expiresAt = now()->addHours(self::VALID_HOURS);
        $token = $user->createToken(self::TOKEN_NAME, ["tenant:{$tenant->id}"], $expiresAt)->plainTextToken;

        Log::info('Super admin acessou tenant.', [
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'ip' => $request->ip(),
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        return $this->success([
            'token' => $token,
            'expires_at' => $expiresAt->toIso8601String(),
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
            ],
        ], "Acessando {$tenant->name}.");
    }
}
