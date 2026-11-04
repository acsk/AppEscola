<?php

namespace App\Services\Saas;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Administradores globais (role super_admin, sem tenant). Proteções: ninguém bloqueia a si mesmo e
 * a plataforma nunca fica sem administrador ativo. Toda ação vai para a auditoria global.
 */
class GlobalAdminService
{
    public function __construct(private readonly SaasAuditService $audit)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $admins = User::query()->where('role', 'super_admin')->orderBy('name')->get(['id', 'name', 'email', 'status', 'password_change_required', 'created_at']);
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $admins->pluck('id'))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->selectRaw('tokenable_id, count(*) as sessions, max(last_used_at) as last_used_at')
            ->groupBy('tokenable_id')
            ->get()
            ->keyBy('tokenable_id');

        return $admins->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'status' => $u->status,
            'password_change_required' => (bool) $u->password_change_required,
            'created_at' => $u->created_at?->toISOString(),
            'sessions' => (int) ($tokens[$u->id]->sessions ?? 0),
            'last_used_at' => isset($tokens[$u->id]) && $tokens[$u->id]->last_used_at ? \Illuminate\Support\Carbon::parse($tokens[$u->id]->last_used_at)->toISOString() : null,
        ])->all();
    }

    /** @param  array{name: string, email: string, password: string}  $data */
    public function create(array $data, User $actor): User
    {
        $admin = User::query()->create([
            'tenant_id' => null,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => 'super_admin',
            'status' => 'active',
            'password_change_required' => true,
        ]);
        $this->audit->log($actor, null, 'admin.created', "Administrador global criado: {$admin->name} ({$admin->email})");

        return $admin;
    }

    public function setStatus(User $admin, string $status, User $actor): User
    {
        $this->ensureGlobalAdmin($admin);
        if ($status !== 'active') {
            if ($admin->is($actor)) {
                throw ValidationException::withMessages(['status' => ['Você não pode bloquear o próprio acesso.']]);
            }
            $others = User::query()->where('role', 'super_admin')->where('status', 'active')->whereKeyNot($admin->id)->count();
            if ($others === 0) {
                throw ValidationException::withMessages(['status' => ['A plataforma precisa de ao menos um administrador global ativo.']]);
            }
        }

        DB::transaction(function () use ($admin, $status) {
            $admin->update(['status' => $status]);
            if ($status !== 'active') {
                $admin->tokens()->delete();
            }
        });
        $this->audit->log($actor, null, $status === 'active' ? 'admin.unblocked' : 'admin.blocked', ($status === 'active' ? 'Desbloqueou ' : 'Bloqueou ')."o administrador {$admin->name}");

        return $admin->fresh();
    }

    public function resetPassword(User $admin, string $password, User $actor): void
    {
        $this->ensureGlobalAdmin($admin);
        DB::transaction(function () use ($admin, $password) {
            $admin->update(['password' => $password, 'password_change_required' => true]);
            $admin->tokens()->delete();
        });
        $this->audit->log($actor, null, 'admin.password_reset', "Senha provisória definida para {$admin->name} (sessões encerradas)");
    }

    /** @return list<array<string, mixed>> */
    public function sessions(User $admin): array
    {
        $this->ensureGlobalAdmin($admin);

        return $admin->tokens()
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->latest('id')
            ->get(['id', 'name', 'abilities', 'last_used_at', 'created_at', 'expires_at'])
            ->map(fn (PersonalAccessToken $t) => [
                'id' => $t->id,
                'kind' => collect($t->abilities)->first(fn ($a) => str_starts_with((string) $a, 'tenant:')) ? 'Acesso assistido' : 'Painel',
                'created_at' => $t->created_at?->toISOString(),
                'last_used_at' => $t->last_used_at?->toISOString(),
                'expires_at' => $t->expires_at?->toISOString(),
            ])->all();
    }

    /** Encerra uma sessão ou todas (exceto a atual de quem está agindo, para não se desconectar sem querer). */
    public function revokeSessions(User $admin, ?int $tokenId, User $actor): int
    {
        $this->ensureGlobalAdmin($admin);
        $current = $actor->currentAccessToken();
        $query = $admin->tokens()
            ->when($tokenId, fn ($q) => $q->whereKey($tokenId))
            ->when($current instanceof PersonalAccessToken, fn ($q) => $q->whereKeyNot($current->id));
        $count = $query->delete();
        $this->audit->log($actor, null, 'admin.sessions_revoked', "Encerrou {$count} sessão(ões) de {$admin->name}");

        return $count;
    }

    private function ensureGlobalAdmin(User $user): void
    {
        abort_unless($user->role === 'super_admin', 404, 'Administrador global não encontrado.');
    }
}
