<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class TenantContext
{
    /**
     * Extrai tenant_id das abilities do token Sanctum (ex.: "tenant:12").
     */
    public static function tenantIdFromAbilities(array $abilities): ?int
    {
        foreach ($abilities as $ability) {
            if (! is_string($ability) || ! str_starts_with($ability, 'tenant:')) {
                continue;
            }

            $value = substr($ability, strlen('tenant:'));

            if (is_numeric($value)) {
                return (int) $value;
            }
        }

        return null;
    }

    public static function tenantIdFromAccessToken(?PersonalAccessToken $token): ?int
    {
        if (! $token) {
            return null;
        }

        return self::tenantIdFromAbilities((array) ($token->abilities ?? []));
    }

    /**
     * Tenant em contexto para super_admin: query, body, merge do middleware ou token.
     */
    public static function selectedTenantIdForSuperAdmin(Request $request, User $user): ?int
    {
        if ($request->filled('_tenant_id')) {
            return (int) $request->input('_tenant_id');
        }

        if ($request->query('tenant_id')) {
            return (int) $request->query('tenant_id');
        }

        if ($request->filled('tenant_id')) {
            return (int) $request->input('tenant_id');
        }

        return self::tenantIdFromAccessToken($user->currentAccessToken());
    }
}
