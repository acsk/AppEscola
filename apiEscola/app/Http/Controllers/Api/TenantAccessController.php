<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\SupportAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Acesso de suporte do super admin a um tenant: motivo, o que será feito e duração.
 * Emite um token próprio, preso ao tenant, sem mexer no token da sessão do super admin.
 */
class TenantAccessController extends Controller
{
    public function __construct(private readonly SupportAccessService $supportAccess)
    {
    }

    public function reasons(Request $request): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        return $this->success([
            'reasons' => $this->supportAccess->reasons(),
            'durations' => SupportAccessService::DURATIONS,
        ], 'Motivos carregados com sucesso.');
    }

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

        $validated = $request->validate([
            'reason_id' => ['required', 'integer'],
            'details' => ['nullable', 'string', 'max:500'],
            'duration_minutes' => ['required', 'integer', 'in:' . implode(',', SupportAccessService::DURATIONS)],
        ], [
            'reason_id.required' => 'Escolha o motivo do acesso.',
            'duration_minutes.required' => 'Escolha por quanto tempo o acesso fica aberto.',
            'duration_minutes.in' => 'Duração inválida.',
        ]);

        ['access' => $access, 'token' => $token] = $this->supportAccess->start(
            $user,
            $tenant,
            (int) $validated['reason_id'],
            $validated['details'] ?? null,
            (int) $validated['duration_minutes'],
            $request->ip(),
            $request->userAgent(),
        );

        Log::info('Super admin iniciou acesso de suporte.', [
            'support_access_id' => $access->id,
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'ip' => $request->ip(),
        ]);

        return $this->success([
            'token' => $token,
            'expires_at' => $access->expires_at->toIso8601String(),
            'access' => [
                'id' => $access->id,
                'expires_at' => $access->expires_at->toIso8601String(),
                'duration_minutes' => $access->duration_minutes,
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
            ],
        ], "Acessando {$tenant->name}.");
    }

    /** Chamado com o token do próprio acesso. */
    public function end(Request $request): JsonResponse
    {
        $access = $request->attributes->get('support_access');

        if (! $access) {
            return $this->validationError(
                ['support_access' => ['Nenhum acesso de suporte em andamento.']],
                'Nenhum acesso de suporte em andamento.'
            );
        }

        $this->supportAccess->end($access);

        return $this->success(null, 'Acesso de suporte encerrado.');
    }

    public function history(Request $request): JsonResponse
    {
        if (! $request->user()?->isSuperAdmin()) {
            return $this->forbidden('Acesso permitido apenas para super admin.');
        }

        $tenant = $request->query('tenant');

        return $this->success([
            'items' => $this->supportAccess->history(is_numeric($tenant) ? (int) $tenant : null),
        ], 'Histórico de acessos carregado com sucesso.');
    }
}
