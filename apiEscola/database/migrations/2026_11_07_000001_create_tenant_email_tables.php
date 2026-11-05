<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** E-mail por tenant: credenciais do provedor (Resend) e histórico de envios. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_email_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained('tenants')->cascadeOnDelete();
            $table->string('provider', 20)->default('resend');
            $table->text('api_key')->comment('Criptografada (cast encrypted)');
            $table->string('key_hint', 8)->nullable();
            $table->string('from_email', 255);
            $table->string('from_name', 120)->nullable();
            $table->string('reply_to', 255)->nullable();
            $table->boolean('active')->default(true);
            $table->string('domain_status', 20)->nullable()->comment('verified, pending, not_found, unknown');
            $table->timestamp('verified_at')->nullable();
            $table->string('last_error', 255)->nullable();
            $table->timestamp('configured_at')->nullable();
            $table->timestamps();
        });

        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('provider', 20);
            $table->string('category', 40)->comment('test, notification, ...');
            $table->string('to', 500)->comment('Destinatários separados por vírgula');
            $table->string('subject', 255);
            $table->string('status', 10)->comment('sent, failed');
            $table->string('provider_message_id', 120)->nullable();
            $table->string('error_code', 40)->nullable();
            $table->string('error', 255)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('tenant_email_settings');
    }
};
