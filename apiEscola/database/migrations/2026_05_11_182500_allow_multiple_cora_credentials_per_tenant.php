<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            $table->index('tenant_id');
            $table->dropUnique('tenant_cora_credentials_tenant_id_unique');
            $table->unique(['tenant_id', 'environment']);
        });
    }

    public function down(): void
    {
        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            $table->dropUnique('tenant_cora_credentials_tenant_id_environment_unique');
            $table->unique('tenant_id');
            $table->dropIndex('tenant_cora_credentials_tenant_id_index');
        });
    }
};