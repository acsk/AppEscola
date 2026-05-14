<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_cora_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('client_id');
            $table->string('certificate_path');
            $table->string('private_key_path');
            $table->string('test_account_main_cpf')->nullable();
            $table->string('test_account_main_password')->nullable();
            $table->string('test_account_secondary_cpf')->nullable();
            $table->string('test_account_secondary_password')->nullable();
            $table->string('environment', 20)->default('stage');
            $table->boolean('active')->default(true);
            $table->timestamp('configured_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'environment']);
        });

        $tenants = DB::table('tenants')->select('id', 'settings')->orderBy('id')->get();

        foreach ($tenants as $tenant) {
            $settings = json_decode($tenant->settings ?? '{}', true);
            $cora = is_array($settings['cora'] ?? null) ? $settings['cora'] : null;

            if (! is_array($cora) || empty($cora['client_id']) || empty($cora['cert_path']) || empty($cora['key_path'])) {
                continue;
            }

            DB::table('tenant_cora_credentials')->insert([
                'tenant_id' => $tenant->id,
                'client_id' => (string) $cora['client_id'],
                'certificate_path' => (string) $cora['cert_path'],
                'private_key_path' => (string) $cora['key_path'],
                'environment' => (string) ($cora['environment'] ?? 'stage'),
                'active' => true,
                'configured_at' => ! empty($cora['configured_at'])
                    ? Carbon::parse((string) $cora['configured_at'])->toDateTimeString()
                    : now()->toDateTimeString(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_cora_credentials');
    }
};
