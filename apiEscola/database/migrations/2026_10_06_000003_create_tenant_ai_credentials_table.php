<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chaves de IA por tenant (OpenRouter / OpenAI). A chave é gravada criptografada (cast "encrypted",
 * APP_KEY); o painel só recebe os 4 últimos caracteres (key_hint). Super admin usa as chaves do .env.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_ai_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('provider', 20);
            $table->text('api_key');
            $table->string('key_hint', 8);
            $table->string('model', 120)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamp('configured_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_ai_credentials');
    }
};
