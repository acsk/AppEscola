<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tabelas de domínio (lookups) — devem rodar antes de todas as outras migrations.
 * Todas usam slug como PK para que as FK nas demais tabelas armazenem o valor
 * legível (slug) sem precisar de join para exibição na API.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Status genérico: tenants, users, students, courses, subjects, school_classes, tenant_api_tokens
        Schema::create('domain_statuses', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');               // Label em PT-BR
        });

        // Papéis de usuário
        Schema::create('domain_user_roles', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });

        // Período de aulas das turmas
        Schema::create('domain_periods', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
            $table->unsignedTinyInteger('order')->default(0);
        });

        // Dias da semana para horários de aula
        Schema::create('domain_weekdays', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
            $table->unsignedTinyInteger('order')->default(0);
        });

        // Tipo de parentesco / relacionamento do responsável com o aluno
        Schema::create('domain_guardian_relationships', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });

        // Métodos de pagamento
        Schema::create('domain_payment_methods', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });

        // Status específico de matrículas (ciclo de vida diferente do status genérico)
        Schema::create('domain_enrollment_statuses', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });

        // Status específico de cobranças
        Schema::create('domain_invoice_statuses', function (Blueprint $table) {
            $table->string('slug')->primary();
            $table->string('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_invoice_statuses');
        Schema::dropIfExists('domain_enrollment_statuses');
        Schema::dropIfExists('domain_payment_methods');
        Schema::dropIfExists('domain_guardian_relationships');
        Schema::dropIfExists('domain_weekdays');
        Schema::dropIfExists('domain_periods');
        Schema::dropIfExists('domain_user_roles');
        Schema::dropIfExists('domain_statuses');
    }
};
