<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Webhook Cora: assinatura por tenant/ambiente e caixa de entrada durável dos avisos.
 * O aviso só dispara a consulta da cobrança na Cora; a baixa vem da consulta, nunca do cabeçalho.
 * Regras em App\Services\Cora\CoraWebhookInbox e CoraWebhookProcessor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cora_webhook_endpoints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('environment', 10)->comment('stage | prod');
            $table->char('callback_key_hash', 64)->unique()->comment('SHA-256 da chave opaca da URL; a chave em si não é guardada');
            $table->string('cora_endpoint_id', 100)->nullable()->comment('ID devolvido por POST /endpoints/ (usado para excluir)');
            $table->string('resource', 30)->default('invoice');
            $table->string('trigger', 30)->default('*');
            $table->boolean('active')->default(true);
            $table->timestamp('registered_at')->nullable();
            $table->timestamp('last_event_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'environment', 'active']);
        });

        Schema::create('cora_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('endpoint_id')->constrained('cora_webhook_endpoints')->cascadeOnDelete();
            $table->unsignedBigInteger('tenant_id');
            $table->string('environment', 10);
            $table->string('event_id', 100);
            $table->string('event_type', 60);
            $table->string('resource_id', 100);
            $table->string('status', 20)->default('pending')
                ->comment('pending, processing, processed, ignored, needs_review, failed');
            $table->string('result', 40)->nullable()->comment('paid, cancelled, unchanged, unknown_invoice, ...');
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('available_at')->useCurrent()->comment('Próxima tentativa');
            $table->timestamp('locked_until')->nullable()->comment('Reivindicado por um processador até este instante');
            $table->timestamp('processed_at')->nullable();
            $table->text('last_error')->nullable();
            $table->unsignedSmallInteger('duplicates')->default(0)->comment('Reentregas do mesmo event_id');
            $table->text('anomaly')->nullable()->comment('Mesmo event_id recebido com tipo ou recurso diferente');
            $table->timestamp('received_at')->useCurrent();
            $table->timestamps();

            $table->unique(['endpoint_id', 'event_id']);
            $table->index(['status', 'available_at']);
            $table->index(['tenant_id', 'received_at']);
            $table->index(['tenant_id', 'resource_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cora_webhook_events');
        Schema::dropIfExists('cora_webhook_endpoints');
    }
};
