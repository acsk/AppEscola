<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Histórico imutável das cobranças: cada criação, alteração, baixa, cancelamento e exclusão, com o
 * antes/depois dos campos, quem fez e por qual origem. Gravado por App\Observers\InvoiceAuditObserver.
 *
 * Sem FK para invoices: o histórico precisa sobreviver mesmo a uma exclusão definitiva da cobrança.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('invoice_id');
            $table->unsignedBigInteger('user_id')->nullable()->comment('NULL = sistema (sync, comandos, webhook)');
            $table->unsignedBigInteger('support_access_id')->nullable()->comment('Feito durante acesso de suporte');
            $table->string('action', 30)->comment('created, updated, paid, cancelled, charge_generated, deleted, restored');
            $table->string('source', 20)->comment('user, system, webhook');
            $table->json('changes')->nullable()->comment('{campo: {from, to}}');
            $table->string('reason', 500)->nullable()->comment('Motivo informado na edição (edit_reason)');
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['invoice_id', 'id']);
            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_audit_logs');
    }
};
