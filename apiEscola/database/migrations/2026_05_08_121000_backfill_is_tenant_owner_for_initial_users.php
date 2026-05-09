<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $tenantIds = DB::table('users')
            ->whereNotNull('tenant_id')
            ->distinct()
            ->pluck('tenant_id');

        foreach ($tenantIds as $tenantId) {
            $hasOwner = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->where('is_tenant_owner', true)
                ->exists();

            if ($hasOwner) {
                continue;
            }

            $initialUserId = DB::table('users')
                ->where('tenant_id', $tenantId)
                ->orderBy('id')
                ->value('id');

            if ($initialUserId) {
                DB::table('users')
                    ->where('id', $initialUserId)
                    ->update(['is_tenant_owner' => true]);
            }
        }
    }

    public function down(): void
    {
        // Sem rollback destrutivo para preservar marcações já aplicadas em produção.
    }
};
