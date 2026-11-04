<?php

namespace App\Services;

use App\Models\SupportAccess;
use App\Models\SupportAccessAction;
use App\Models\SupportAccessReason;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Acesso de suporte: o super admin entra num tenant por tempo limitado, com motivo e o que vai fazer.
 * O token do acesso carrega "tenant:{id}" e "support-access:{id}"; a sessão é conferida a cada
 * requisição (TrackSupportAccess), então encerrar ou expirar corta o acesso na hora.
 */
class SupportAccessService
{
    public const TOKEN_NAME = 'support-access';

    /** Durações aceitas, em minutos. */
    public const DURATIONS = [30, 60, 120, 240];

    private const ABILITY_PREFIX = 'support-access:';

    /**
     * @return array<int, array{id: int, name: string, requires_details: bool}>
     */
    public function reasons(): array
    {
        return SupportAccessReason::query()
            ->where('active', true)
            ->orderBy('order')
            ->orderBy('name')
            ->get(['id', 'name', 'requires_details'])
            ->map(fn (SupportAccessReason $r) => ['id' => $r->id, 'name' => $r->name, 'requires_details' => $r->requires_details])
            ->all();
    }

    /**
     * Abre o acesso e devolve o token. Um acesso aberto por super admin: o anterior é encerrado.
     *
     * @return array{access: SupportAccess, token: string}
     */
    public function start(User $superAdmin, Tenant $tenant, int $reasonId, ?string $details, int $durationMinutes, ?string $ip, ?string $userAgent): array
    {
        $reason = SupportAccessReason::query()->where('id', $reasonId)->where('active', true)->first();
        if (! $reason) {
            throw ValidationException::withMessages(['reason_id' => ['Escolha o motivo do acesso.']]);
        }

        $details = mb_substr(trim((string) $details), 0, 500);
        if ($reason->requires_details && mb_strlen($details) < 10) {
            throw ValidationException::withMessages(['details' => ['Descreva o que será feito (mínimo de 10 caracteres).']]);
        }

        return DB::transaction(function () use ($superAdmin, $tenant, $reason, $details, $durationMinutes, $ip, $userAgent) {
            $this->endOpenAccesses($superAdmin);

            $now = now();
            $access = SupportAccess::create([
                'tenant_id' => $tenant->id,
                'user_id' => $superAdmin->id,
                'reason_id' => $reason->id,
                'details' => $details !== '' ? $details : null,
                'duration_minutes' => $durationMinutes,
                'started_at' => $now,
                'expires_at' => $now->copy()->addMinutes($durationMinutes),
                'ip' => $ip,
                'user_agent' => $userAgent ? mb_substr($userAgent, 0, 255) : null,
            ]);

            $token = $superAdmin->createToken(
                self::TOKEN_NAME,
                ["tenant:{$tenant->id}", self::ABILITY_PREFIX . $access->id],
                $access->expires_at
            )->plainTextToken;

            return ['access' => $access, 'token' => $token];
        });
    }

    /** Id do acesso de suporte gravado nas abilities do token, ou null (token comum). */
    public function accessIdFromToken(mixed $token): ?int
    {
        if (! $token instanceof PersonalAccessToken) {
            return null;
        }

        foreach ((array) $token->abilities as $ability) {
            if (is_string($ability) && str_starts_with($ability, self::ABILITY_PREFIX)) {
                $id = substr($ability, strlen(self::ABILITY_PREFIX));

                return ctype_digit($id) ? (int) $id : null;
            }
        }

        return null;
    }

    /**
     * Acesso ainda válido para este usuário (não encerrado, não expirado e ele continua super admin).
     */
    public function activeAccess(int $accessId, User $user): ?SupportAccess
    {
        if (! $user->isSuperAdmin()) {
            return null;
        }

        $access = SupportAccess::query()->where('id', $accessId)->where('user_id', $user->id)->first();

        return $access && $access->isActive() ? $access : null;
    }

    public function end(SupportAccess $access): void
    {
        if ($access->ended_at === null) {
            $access->forceFill(['ended_at' => now()])->save();
        }

        $this->revokeTokens($access->user_id, [$access->id]);
    }

    public function recordAction(SupportAccess $access, string $method, string $path, int $status): void
    {
        SupportAccessAction::create([
            'support_access_id' => $access->id,
            'method' => $method,
            'path' => mb_substr($path, 0, 255),
            'status' => $status,
        ]);
    }

    /**
     * Histórico de acessos (mais recentes primeiro), opcionalmente de um tenant.
     *
     * @return array<int, array<string, mixed>>
     */
    public function history(?int $tenantId, int $limit = 50): array
    {
        return SupportAccess::query()
            ->with(['tenant:id,name', 'user:id,name', 'reason:id,name'])
            ->withCount('actions')
            ->when($tenantId, fn ($q, $id) => $q->where('tenant_id', $id))
            ->orderByDesc('started_at')
            ->limit($limit)
            ->get()
            ->map(fn (SupportAccess $a) => [
                'id' => $a->id,
                'tenant' => ['id' => $a->tenant_id, 'name' => $a->tenant?->name],
                'user' => ['id' => $a->user_id, 'name' => $a->user?->name],
                'reason' => $a->reason?->name,
                'details' => $a->details,
                'duration_minutes' => $a->duration_minutes,
                'started_at' => $a->started_at->toIso8601String(),
                'expires_at' => $a->expires_at->toIso8601String(),
                'ended_at' => ($a->ended_at ?? ($a->expires_at->isPast() ? $a->expires_at : null))?->toIso8601String(),
                'active' => $a->isActive(),
                'actions_count' => (int) $a->actions_count,
            ])
            ->all();
    }

    private function endOpenAccesses(User $superAdmin): void
    {
        $open = SupportAccess::query()
            ->where('user_id', $superAdmin->id)
            ->whereNull('ended_at')
            ->pluck('id')
            ->all();

        if ($open === []) {
            return;
        }

        SupportAccess::query()->whereIn('id', $open)->update(['ended_at' => now()]);
        $this->revokeTokens($superAdmin->id, $open);
    }

    /** Apaga os tokens dos acessos informados (o token da sessão do super admin não é tocado). */
    private function revokeTokens(int $userId, array $accessIds): void
    {
        PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $userId)
            ->where('name', self::TOKEN_NAME)
            ->get()
            ->filter(fn (PersonalAccessToken $t) => in_array($this->accessIdFromToken($t), $accessIds, true))
            ->each->delete();
    }
}
