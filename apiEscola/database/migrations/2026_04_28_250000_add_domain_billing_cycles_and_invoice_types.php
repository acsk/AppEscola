<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Ciclos de cobrança como tabela de domínio (para combos no frontend)
        Schema::create('domain_billing_cycles', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
            $table->unsignedTinyInteger('months');
            $table->unsignedTinyInteger('order')->default(0);
        });

        // Tipos de cobrança (taxa de matrícula, mensalidade, outro)
        Schema::create('domain_invoice_types', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });

        // Adiciona coluna type na tabela invoices
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('type')->default('monthly')->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn('type');
        });

        Schema::dropIfExists('domain_invoice_types');
        Schema::dropIfExists('domain_billing_cycles');
    }
};
