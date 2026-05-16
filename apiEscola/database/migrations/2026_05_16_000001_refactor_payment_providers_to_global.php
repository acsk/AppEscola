<?php

use App\Models\Tenant;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Remover tenant_id de payment_providers e tornar a tabela global
        Schema::table('payment_providers', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropColumn('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::table('payment_providers', function (Blueprint $table) {
            $table->dropUnique(['slug']);
            $table->foreignId('tenant_id')->after('id')->constrained('tenants')->cascadeOnDelete();
        });
    }
};
