<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('module', 50);          // ex: billing, payment, enrollment
            $table->string('key', 100);            // ex: charges_enrollment_fee
            $table->json('value')->nullable();     // bool/int/string/array serializado
            $table->string('description', 255)->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'module', 'key'], 'tenant_settings_unique');
            $table->index(['tenant_id', 'module']);
        });

        // Backfill: importa o que já estava no JSON tenants.settings (billing/payment/enrollment)
        // e remove esses escopos do JSON, preservando outros (ex: uploads).
        if (Schema::hasColumn('tenants', 'settings')) {
            DB::table('tenants')->orderBy('id')->each(function ($tenant) {
                $raw = $tenant->settings;
                if (! is_string($raw) || $raw === '') {
                    return;
                }

                $decoded = json_decode($raw, true);
                if (! is_array($decoded)) {
                    return;
                }

                $modules = ['billing', 'payment', 'enrollment'];
                $changed = false;

                foreach ($modules as $module) {
                    if (! isset($decoded[$module]) || ! is_array($decoded[$module])) {
                        continue;
                    }

                    foreach ($decoded[$module] as $key => $value) {
                        DB::table('tenant_settings')->updateOrInsert(
                            [
                                'tenant_id' => $tenant->id,
                                'module'    => $module,
                                'key'       => $key,
                            ],
                            [
                                // Envelope {"v": ...} preserva o tipo original (bool/int/array/string).
                                'value'      => json_encode(['v' => $value], JSON_UNESCAPED_UNICODE),
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]
                        );
                    }

                    unset($decoded[$module]);
                    $changed = true;
                }

                if ($changed) {
                    DB::table('tenants')
                        ->where('id', $tenant->id)
                        ->update(['settings' => json_encode($decoded, JSON_UNESCAPED_UNICODE)]);
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_settings');
    }
};
