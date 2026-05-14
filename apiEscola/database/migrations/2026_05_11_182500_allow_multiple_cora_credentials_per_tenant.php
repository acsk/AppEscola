<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tenant_cora_credentials')) {
            return;
        }

        $indexNames = $this->getIndexNames('tenant_cora_credentials');
        $hasTenantIndex = in_array('tenant_cora_credentials_tenant_id_index', $indexNames, true);
        $hasTenantUnique = in_array('tenant_cora_credentials_tenant_id_unique', $indexNames, true);
        $hasTenantEnvironmentUnique = in_array('tenant_cora_credentials_tenant_id_environment_unique', $indexNames, true);

        Schema::table('tenant_cora_credentials', function (Blueprint $table) use ($hasTenantIndex, $hasTenantUnique, $hasTenantEnvironmentUnique) {
            if (! $hasTenantIndex) {
                $table->index('tenant_id');
            }

            if ($hasTenantUnique) {
                $table->dropUnique('tenant_cora_credentials_tenant_id_unique');
            }

            if (! $hasTenantEnvironmentUnique) {
                $table->unique(['tenant_id', 'environment']);
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tenant_cora_credentials')) {
            return;
        }

        $indexNames = $this->getIndexNames('tenant_cora_credentials');
        $hasTenantIndex = in_array('tenant_cora_credentials_tenant_id_index', $indexNames, true);
        $hasTenantUnique = in_array('tenant_cora_credentials_tenant_id_unique', $indexNames, true);
        $hasTenantEnvironmentUnique = in_array('tenant_cora_credentials_tenant_id_environment_unique', $indexNames, true);

        Schema::table('tenant_cora_credentials', function (Blueprint $table) use ($hasTenantIndex, $hasTenantUnique, $hasTenantEnvironmentUnique) {
            if ($hasTenantEnvironmentUnique) {
                $table->dropUnique('tenant_cora_credentials_tenant_id_environment_unique');
            }

            if (! $hasTenantUnique) {
                $table->unique('tenant_id');
            }

            if ($hasTenantIndex) {
                $table->dropIndex('tenant_cora_credentials_tenant_id_index');
            }
        });
    }

    private function getIndexNames(string $table): array
    {
        $rows = DB::select("SHOW INDEX FROM {$table}");
        $names = [];

        foreach ($rows as $row) {
            $keyName = $row->Key_name ?? $row->key_name ?? null;

            if (is_string($keyName) && $keyName !== '') {
                $names[$keyName] = true;
            }
        }

        return array_keys($names);
    }
};