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

    /** Cadastrar, editar, anexar comprovante e registrar pagamento de despesas (não movimenta dinheiro). */
    public const MANAGE_PAYABLES = 'finance.payables.manage';

    /** Aprovar despesas. */
    public const APPROVE_PAYABLES = 'finance.payables.approve';

    private const STAFF_ROLES = [
        'super_admin',
        'admin',
        'manager',
        'financial',
        'secretaria',
    ];

    private const CONFIGURE_ROLES = ['super_admin', 'admin'];

    /** Secretaria cadastra despesas, mas não aprova. */
    private const APPROVE_PAYABLES_ROLES = ['super_admin', 'admin', 'manager', 'financial'];

    /** Rótulos das permissões, na ordem da tela de Configurações financeiras. */
    public const LABELS = [
        self::VIEW => 'Ver dashboard, cobranças e conciliação',
        self::MANAGE_INVOICES => 'Criar e editar cobranças',
        self::SETTLE => 'Registrar baixa manual e conciliar',
        self::MANAGE_PAYABLES => 'Gerenciar contas a pagar',
        self::APPROVE_PAYABLES => 'Aprovar despesas',
        self::EXPORT => 'Exportar dados',
        self::CONFIGURE => 'Configurar financeiro e integração bancária',
    ];

    /** Papéis exibidos na matriz de permissões (inclui os que não têm acesso, para ficar explícito). */
    public const ROLES = ['super_admin', 'admin', 'manager', 'financial', 'secretaria', 'coordenador', 'professor'];

    /**
     * Matriz papel × permissão gerada a partir deste mapa: a tela nunca diverge do que a API aplica.
     *
     * @return array<int, array{ability: string, label: string, roles: array<string, bool>}>
     */
    public static function matrix(): array
    {
        $byRole = [];
        foreach (self::ROLES as $role) {
            $byRole[$role] = self::forUser(new User(['role' => $role]));
        }

        return array_map(fn (string $ability) => [
            'ability' => $ability,
            'label' => self::LABELS[$ability],
            'roles' => array_map(fn (array $abilities) => in_array($ability, $abilities, true), $byRole),
        ], array_keys(self::LABELS));
    }

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

        $abilities = [self::VIEW, self::MANAGE_INVOICES, self::SETTLE, self::EXPORT, self::MANAGE_PAYABLES];

        if (in_array($role, self::APPROVE_PAYABLES_ROLES, true)) {
            $abilities[] = self::APPROVE_PAYABLES;
        }

        if (in_array($role, self::CONFIGURE_ROLES, true)) {
            $abilities[] = self::CONFIGURE;
        }

        return $abilities;
    }
}
