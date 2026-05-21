<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_asaas_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('environment', 20)->default('stage');
            $table->text('api_key');
            $table->text('webhook_token')->nullable();
            $table->string('webhook_token_hash', 64)->nullable()->index();
            $table->string('base_url', 255)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamp('configured_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'environment']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_asaas_credentials');
    }
};
