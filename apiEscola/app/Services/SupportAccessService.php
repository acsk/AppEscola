<?php

namespace App\Services;

use App\Models\Student;
use App\Models\SupportAccess;
use App\Models\SupportAccessAction;
use App\Models\SupportAccessReason;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Acesso de suporte: o super admin entra num tenant, ou no app na conta de um aluno, por tempo limitado.
 * O token carrega "support-access:{id}" (e "tenant:{id}" no painel). A sessão é conferida a cada
 * requisição (TrackSupportAccess), então encerrar ou expirar corta o acesso na hora.
 * O acesso ao app emite o token na conta do aluno e entrega um código de uso único, para a senha não sair do painel.
 */
class SupportAccessService
{
    public const TOKEN_NAME = 'support-access';

    /** Durações aceitas, em minutos. */
    public const DURATIONS = [30, 60, 120, 240];

    /** Minutos para o painel abrir o app e trocar o código pelo token. */
    public const HANDOFF_MINUTES = 2;

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
            $this->endOpenAccesses($superAdmin, false);

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

    /**
     * Abre o app na conta do aluno. Não encerra um acesso ao painel que já esteja aberto.
     * O token fica na conta do aluno; o painel recebe só um código de uso único.
     *
     * @return array{access: SupportAccess, launch_url: ?string}
     */
    public function startForStudent(User $superAdmin, Student $student, int $reasonId, ?string $details, int $durationMinutes, ?string $ip, ?string $userAgent): array
    {
        if (rtrim((string) config('mobile.web_url'), '/') === '') {
            throw ValidationException::withMessages([
                'mobile' => ['O endereço do app não está configurado no servidor (MOBILE_WEB_URL).'],
            ]);
        }

        [$reason, $details] = $this->reasonAndDetails($reasonId, $details);

        $student->loadMissing('user');
        $studentUser = $student->user;
        if (! $studentUser || $studentUser->role !== 'aluno') {
            throw ValidationException::withMessages([
                'student' => ['Este aluno ainda não tem acesso ao app.'],
            ]);
        }

        if ($student->tenant_id === null) {
            throw ValidationException::withMessages([
                'student' => ['Aluno sem instituição.'],
            ]);
        }

        return DB::transaction(function () use ($superAdmin, $student, $studentUser, $reason, $details, $durationMinutes, $ip, $userAgent) {
            $this->endOpenAccesses($superAdmin, true);

            $now = now();
            $access = SupportAccess::create([
                'tenant_id' => $student->tenant_id,
                'user_id' => $superAdmin->id,
                'impersonated_user_id' => $studentUser->id,
                'reason_id' => $reason->id,
                'details' => $details !== '' ? $details : null,
                'duration_minutes' => $durationMinutes,
                'started_at' => $now,
                'expires_at' => $now->copy()->addMinutes($durationMinutes),
                'ip' => $ip,
                'user_agent' => $userAgent ? mb_substr($userAgent, 0, 255) : null,
            ]);

            $token = $studentUser->createToken(
                self::TOKEN_NAME,
                [self::ABILITY_PREFIX . $access->id],
                $access->expires_at
            )->plainTextToken;

            $code = $this->parkHandoff($token);

            return ['access' => $access, 'launch_url' => $this->launchUrl($code)];
        });
    }

    /** Troca o código de uso único pelo token do app. Some do cache na primeira leitura. */
    public function redeemHandoff(string $code): ?string
    {
        $code = trim($code);
        if ($code === '' || strlen($code) > 80) {
            return null;
        }

        $token = Cache::pull($this->handoffKey($code));

        return is_string($token) && $token !== '' ? $token : null;
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
     * Acesso ainda válido. No painel o token é do super admin; no app, o token é do aluno e o super admin continua super admin.
     */
    public function activeAccess(int $accessId, User $user): ?SupportAccess
    {
        $access = SupportAccess::query()->where('id', $accessId)->first();
        if (! $access || ! $access->isActive()) {
            return null;
        }

        if ($access->impersonated_user_id) {
            if ((int) $access->impersonated_user_id !== (int) $user->id) {
                return null;
            }

            $stillSuperAdmin = User::query()
                ->whereKey($access->user_id)
                ->where('role', 'super_admin')
                ->exists();

            return $stillSuperAdmin ? $access : null;
        }

        if (! $user->isSuperAdmin() || (int) $access->user_id !== (int) $user->id) {
            return null;
        }

        return $access;
    }

    public function end(SupportAccess $access): void
    {
        if ($access->ended_at === null) {
            $access->forceFill(['ended_at' => now()])->save();
        }

        $this->revokeTokens([$access->id]);
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
            ->with([
                'tenant:id,name',
                'user:id,name',
                'reason:id,name',
                'impersonatedUser:id,name',
                'impersonatedUser.student:id,user_id,name,enrollment_number',
            ])
            ->withCount('actions')
            ->when($tenantId, fn ($q, $id) => $q->where('tenant_id', $id))
            ->orderByDesc('started_at')
            ->limit($limit)
            ->get()
            ->map(fn (SupportAccess $a) => [
                'id' => $a->id,
                'tenant' => ['id' => $a->tenant_id, 'name' => $a->tenant?->name],
                'user' => ['id' => $a->user_id, 'name' => $a->user?->name],
                'student' => $a->impersonated_user_id ? [
                    'id' => $a->impersonatedUser?->student?->id,
                    'name' => $a->impersonatedUser?->student?->name ?? $a->impersonatedUser?->name,
                    'enrollment_number' => $a->impersonatedUser?->student?->enrollment_number,
                ] : null,
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

    /**
     * @return array{0: SupportAccessReason, 1: string}
     */
    private function reasonAndDetails(int $reasonId, ?string $details): array
    {
        $reason = SupportAccessReason::query()->where('id', $reasonId)->where('active', true)->first();
        if (! $reason) {
            throw ValidationException::withMessages(['reason_id' => ['Escolha o motivo do acesso.']]);
        }

        $details = mb_substr(trim((string) $details), 0, 500);
        if ($reason->requires_details && mb_strlen($details) < 10) {
            throw ValidationException::withMessages(['details' => ['Descreva o que será feito (mínimo de 10 caracteres).']]);
        }

        return [$reason, $details];
    }

    /** Encerra acessos abertos do mesmo tipo: painel não derruba o app, e o app não derruba o painel. */
    private function endOpenAccesses(User $superAdmin, bool $impersonation): void
    {
        $open = SupportAccess::query()
            ->where('user_id', $superAdmin->id)
            ->whereNull('ended_at')
            ->when(
                $impersonation,
                fn ($q) => $q->whereNotNull('impersonated_user_id'),
                fn ($q) => $q->whereNull('impersonated_user_id'),
            )
            ->pluck('id')
            ->all();

        if ($open === []) {
            return;
        }

        SupportAccess::query()->whereIn('id', $open)->update(['ended_at' => now()]);
        $this->revokeTokens($open);
    }

    private function parkHandoff(string $plainToken): string
    {
        $code = Str::random(48);
        Cache::put($this->handoffKey($code), $plainToken, now()->addMinutes(self::HANDOFF_MINUTES));

        return $code;
    }

    private function handoffKey(string $code): string
    {
        return 'support-mobile-handoff:' . hash('sha256', $code);
    }

    private function launchUrl(string $code): ?string
    {
        $base = rtrim((string) config('mobile.web_url'), '/');
        if ($base === '') {
            return null;
        }

        return $base . '/?acesso=' . rawurlencode($code);
    }

    /** Apaga os tokens dos acessos informados (o token da sessão do super admin não é tocado). */
    private function revokeTokens(array $accessIds): void
    {
        if ($accessIds === []) {
            return;
        }

        $userIds = SupportAccess::query()
            ->whereIn('id', $accessIds)
            ->get(['user_id', 'impersonated_user_id'])
            ->flatMap(fn (SupportAccess $access) => array_filter([$access->user_id, $access->impersonated_user_id]))
            ->unique()
            ->values()
            ->all();

        if ($userIds === []) {
            return;
        }

        PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $userIds)
            ->where('name', self::TOKEN_NAME)
            ->get()
            ->filter(fn (PersonalAccessToken $token) => in_array($this->accessIdFromToken($token), $accessIds, true))
            ->each->delete();
    }
}
