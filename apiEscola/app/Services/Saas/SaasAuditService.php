<?php

namespace App\Services\Saas;

use App\Models\SaasAuditLog;
use App\Models\User;

/** Registro das ações administrativas do super admin (planos, assinaturas, flags, quotas, status). */
class SaasAuditService
{
    /** @param  array<string, mixed>|null  $changes */
    public function log(?User $user, ?int $tenantId, string $action, string $description, ?array $changes = null): void
    {
        SaasAuditLog::query()->create([
            'user_id' => $user?->id,
            'tenant_id' => $tenantId,
            'action' => $action,
            'description' => mb_substr($description, 0, 255),
            'changes' => $changes,
            'ip' => request()?->ip(),
        ]);
    }
}
