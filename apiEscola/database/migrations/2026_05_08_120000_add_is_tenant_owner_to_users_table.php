<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_tenant_owner')->default(false)->after('tenant_id');
        });

        // Backfill: marca o primeiro admin de cada tenant como admin inicial.
        $ownerIds = DB::table('users')
            ->whereNotNull('tenant_id')
            ->where('role', 'admin')
            ->groupBy('tenant_id')
            ->selectRaw('MIN(id) as id')
            ->pluck('id');

        if ($ownerIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $ownerIds->all())->update(['is_tenant_owner' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_tenant_owner');
        });
    }
};
