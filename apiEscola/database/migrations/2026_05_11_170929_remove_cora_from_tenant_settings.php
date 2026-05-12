<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('tenants')->orderBy('id')->chunkById(100, function ($tenants) {
            foreach ($tenants as $tenant) {
                $settings = json_decode($tenant->settings ?? '{}', true);

                if (! is_array($settings) || ! array_key_exists('cora', $settings)) {
                    continue;
                }

                unset($settings['cora']);

                DB::table('tenants')
                    ->where('id', $tenant->id)
                    ->update([
                        'settings' => json_encode($settings),
                    ]);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Sem rollback automático: os dados da Cora já passam a viver em tenant_cora_credentials.
    }
};
