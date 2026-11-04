<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contas a pagar: categorias, centros de custo, fornecedores, despesas, comprovantes e auditoria, e o
 * vínculo das saídas do extrato com as despesas. Registrar pagamento só atualiza o controle; nada aqui
 * movimenta a conta bancária. Regras em App\Services\Payables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name', 80);
            $table->string('system_key', 30)->nullable()->comment('Categoria usada pelo sistema (ex.: bank_fees)');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
            $table->unique(['tenant_id', 'system_key']);
        });

        Schema::create('cost_centers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name', 80);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name', 150);
            $table->string('document', 20)->nullable()->comment('CNPJ/CPF, só dígitos');
            $table->string('email', 150)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('notes', 500)->nullable();
            $table->string('system_key', 30)->nullable()->comment('Fornecedor usado pelo sistema (ex.: cora)');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['tenant_id', 'name']);
            $table->unique(['tenant_id', 'system_key']);
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('description', 160);
            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->unsignedBigInteger('category_id')->nullable();
            $table->unsignedBigInteger('cost_center_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->date('due_date');
            $table->string('status', 20)->default('draft')->comment('draft, pending_approval, approved, paid, cancelled');
            $table->string('recurrence', 10)->default('none')->comment('none | monthly');
            $table->unsignedBigInteger('series_id')->nullable()->comment('Primeira despesa da série recorrente');
            $table->boolean('auto_debit')->default(false)->comment('Débito automático: o banco debita sozinho');
            $table->string('system_key', 40)->nullable()->comment('Despesa mantida pelo sistema (ex.: bank_fees:2026-11)');
            $table->timestamp('paid_at')->nullable();
            $table->string('payment_method', 20)->nullable();
            $table->string('notes', 1000)->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('paid_by')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'due_date']);
            $table->index(['tenant_id', 'status']);
            // Recorrência nunca duplica a mesma competência.
            $table->unique(['series_id', 'due_date']);
            $table->unique(['tenant_id', 'system_key']);
        });

        Schema::create('expense_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('expense_id');
            $table->string('path', 255)->comment('Disco local (privado)');
            $table->string('original_name', 200);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->timestamps();

            $table->index('expense_id');
        });

        Schema::create('expense_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('expense_id');
            $table->unsignedBigInteger('user_id')->nullable()->comment('NULL = sistema');
            $table->string('action', 30)->comment('created, updated, submitted, approved, paid, cancelled, attachment_added, attachment_removed');
            $table->json('changes')->nullable();
            $table->string('reason', 500)->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['expense_id', 'id']);
        });

        Schema::table('bank_statement_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('expense_id')->nullable()->after('invoice_id')
                ->comment('Despesa ligada a uma saída (tarifas do mês podem agrupar várias saídas)');
            $table->index('expense_id');
        });
    }

    public function down(): void
    {
        Schema::table('bank_statement_entries', function (Blueprint $table) {
            $table->dropIndex(['expense_id']);
            $table->dropColumn('expense_id');
        });
        Schema::dropIfExists('expense_audit_logs');
        Schema::dropIfExists('expense_attachments');
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('cost_centers');
        Schema::dropIfExists('finance_categories');
    }
};
