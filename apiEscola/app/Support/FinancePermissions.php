<?php

namespace App\Support;

use App\Models\User;

/**
 * Mapa central papel → permissões do módulo financeiro.
 *
 * Por padrão só administração, financeiro e secretaria acessam; professor, coordenação,
 * aluno e responsável não. Para liberar ou restringir um papel, altere apenas este mapa.
 */
final class FinancePermissions
{
    public const VIEW = 'finance.view';

    public const MANAGE_INVOICES = 'finance.invoices.manage';

    public const SETTLE = 'finance.invoices.settle';

    public const EXPORT = 'finance.export';

    public const CONFIGURE = 'finance.configure';

    private const STAFF_ROLES = [
        'super_admin',
        'admin',
        'manager',
        'financial',
        'secretaria',
    ];

    private const CONFIGURE_ROLES = ['super_admin', 'admin'];

    public static function allows(?User $user, string $ability): bool
    {
        return in_array($ability, self::forUser($user), true);
    }

    /**
     * @return array<int, string>
     */
    public static function forUser(?User $user): array
    {
        $role = $user?->role;

        if (! in_array($role, self::STAFF_ROLES, true)) {
            return [];
        }

        $abilities = [self::VIEW, self::MANAGE_INVOICES, self::SETTLE, self::EXPORT];

        if (in_array($role, self::CONFIGURE_ROLES, true)) {
            $abilities[] = self::CONFIGURE;
        }

        return $abilities;
    }
}
