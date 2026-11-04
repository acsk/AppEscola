<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Super Admin SaaS — fase 4: medição de IA (cada chamada ao provedor) e de armazenamento (foto diária por tenant).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_usage_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('tenants')->cascadeOnDelete()->comment('NULL = super admin fora de tenant');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('feature', 80)->comment('Rota ou tarefa que chamou a IA (ex.: question-bank/ai/classify)');
            $table->string('provider', 20);
            $table->string('model', 120)->nullable();
            $table->string('endpoint', 40);
            $table->string('credential_source', 10)->nullable()->comment('env (chave da plataforma) ou tenant (chave da escola)');
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->decimal('estimated_cost_usd', 12, 6)->nullable()->comment('Pela tabela de preços configurada');
            $table->decimal('provider_cost_usd', 12, 6)->nullable()->comment('Custo informado pelo provedor, quando houver');
            $table->string('status', 10)->comment('success, error');
            $table->string('error_code', 40)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['created_at', 'status']);
        });

        Schema::create('tenant_storage_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained('tenants')->cascadeOnDelete();
            $table->unsignedBigInteger('bytes')->default(0);
            $table->unsignedInteger('files')->default(0);
            $table->json('by_category')->nullable()->comment('{categoria: {bytes, files}}');
            $table->timestamp('measured_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_storage_usages');
        Schema::dropIfExists('ai_usage_logs');
    }
};
