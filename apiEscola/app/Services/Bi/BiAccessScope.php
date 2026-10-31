<?php

namespace App\Services\Bi;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Até onde o usuário enxerga no BI: tenant inteiro (admin/coordenação) ou só as turmas que leciona (professor).
 * Toda consulta do BI deve passar por aqui — a restrição é do backend, não do painel.
 */
class BiAccessScope
{
    /** @param  list<int>|null  $classIds  null = sem restrição de turma */
    private function __construct(
        public readonly int $tenantId,
        public readonly string $role,
        public readonly ?array $classIds,
    ) {
    }

    public static function canAccess(User $user): bool
    {
        return in_array($user->role, config('bi.roles', []), true);
    }

    public static function for(User $user, int $tenantId): self
    {
        if (in_array($user->role, config('bi.tenant_wide_roles', []), true)) {
            return new self($tenantId, $user->role, null);
        }

        return new self($tenantId, $user->role, self::teacherClassIds($user->id, $tenantId));
    }

    public function isTenantWide(): bool
    {
        return $this->classIds === null;
    }

    public function allowsClass(int $schoolClassId): bool
    {
        return $this->classIds === null || in_array($schoolClassId, $this->classIds, true);
    }

    /**
     * Turmas com horário ativo lecionado pelo professor (pivô class_schedule_user ou teacher_id legado).
     *
     * @return list<int>
     */
    public static function teacherClassIds(int $userId, int $tenantId): array
    {
        return DB::table('class_schedules as cs')
            ->where('cs.tenant_id', $tenantId)
            ->whereNull('cs.deleted_at')
            ->where(fn ($q) => $q
                ->where('cs.teacher_id', $userId)
                ->orWhereExists(fn ($e) => $e->select(DB::raw(1))
                    ->from('class_schedule_user as csu')
                    ->whereColumn('csu.class_schedule_id', 'cs.id')
                    ->where('csu.user_id', $userId)))
            ->distinct()
            ->orderBy('cs.school_class_id')
            ->pluck('cs.school_class_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
