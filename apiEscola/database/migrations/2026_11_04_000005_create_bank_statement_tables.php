<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Conciliação bancária: movimentações do extrato (Cora por API; OFX/CSV depois), execuções de
 * sincronização e histórico de cada decisão. Movimentação importada nunca é alterada nos campos
 * vindos do banco; só a situação de conciliação muda. Regras em App\Services\Reconciliation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_statement_syncs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('environment', 10)->comment('stage | prod');
            $table->string('source', 10)->default('cora');
            $table->date('period_start');
            $table->date('period_end');
            $table->string('status', 10)->default('running')->comment('running, success, failed');
            $table->unsignedInteger('fetched')->default(0);
            $table->unsignedInteger('created')->default(0);
            $table->unsignedInteger('auto_reconciled')->default(0);
            $table->unsignedInteger('divergent')->default(0);
            $table->string('error', 500)->nullable();
            $table->unsignedBigInteger('triggered_by')->nullable()->comment('NULL = comando/agendamento');
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'environment', 'id']);
        });

        Schema::create('bank_statement_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('environment', 10);
            $table->string('source', 10)->comment('cora, ofx, csv');
            $table->string('external_id', 100)->comment('ID da movimentação no banco (Cora ent_..., FITID)');
            $table->string('transaction_id', 100)->nullable();
            $table->string('direction', 6)->comment('credit | debit');
            $table->string('transaction_type', 30)->nullable()->comment('PIX, TRANSFER, PAYMENT, FEE...');
            $table->decimal('amount', 12, 2)->comment('Sempre positivo; o sinal vem de direction');
            $table->timestamp('occurred_at');
            $table->string('description', 255)->nullable();
            $table->string('counterparty_name', 150)->nullable()->comment('CPF/CNPJ da contraparte não é guardado');
            $table->string('status', 12)->default('pending')->comment('pending, reconciled, divergent, ignored');
            $table->string('match_type', 10)->nullable()->comment('auto | manual');
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->string('divergence', 255)->nullable()->comment('Motivo apontado pelo sistema');
            $table->string('justification', 500)->nullable()->comment('Última justificativa informada');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('sync_id')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'environment', 'source', 'external_id'], 'bank_entries_external_unique');
            // Uma cobrança só pode estar conciliada com uma movimentação.
            $table->unique('invoice_id');
            $table->index(['tenant_id', 'status', 'occurred_at']);
            $table->index(['tenant_id', 'occurred_at']);
        });

        Schema::create('bank_statement_entry_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('entry_id');
            $table->unsignedBigInteger('user_id')->nullable()->comment('NULL = conciliação automática');
            $table->string('action', 20)->comment('auto_reconciled, auto_divergent, reconciled, ignored, divergent, undone');
            $table->string('from_status', 12)->nullable();
            $table->string('to_status', 12);
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->string('justification', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['entry_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_statement_entry_logs');
        Schema::dropIfExists('bank_statement_entries');
        Schema::dropIfExists('bank_statement_syncs');
    }
};
