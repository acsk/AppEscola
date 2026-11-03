<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Relatórios do BI (Fase 4): auditoria de exportações (LGPD), modelos salvos e aprovações comprovadas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bi_export_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('report', 20); // individual | class | subject | institutional | results
            $table->string('format', 8); // pdf | xlsx
            $table->string('subject_label', 190)->nullable(); // "Individual · Lívia M."
            $table->json('filters')->nullable();
            $table->unsignedInteger('rows')->default(0);
            $table->string('ip', 45)->nullable();
            $table->timestamp('exported_at');

            $table->index(['tenant_id', 'exported_at'], 'bi_export_logs_period_idx');
        });

        Schema::create('bi_report_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('report', 20);
            $table->json('config'); // filtros, indicadores, apresentação, resumo executivo
            $table->boolean('shared')->default(false);
            $table->timestamps();

            $table->index(['tenant_id', 'report'], 'bi_report_templates_report_idx');
        });

        Schema::create('student_exam_outcomes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exam_type_id')->nullable()->constrained('exam_types')->nullOnDelete();
            $table->string('exam_name', 150);
            $table->unsignedSmallInteger('year');
            $table->string('result', 20); // approved | classified | not_approved
            $table->unsignedInteger('position')->nullable();
            $table->string('evidence_url', 500)->nullable();
            $table->string('evidence_note', 500)->nullable();
            // Uso em material de divulgação só com consentimento registrado.
            $table->boolean('consent_publish')->default(false);
            $table->timestamp('consent_at')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'year'], 'student_exam_outcomes_year_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_exam_outcomes');
        Schema::dropIfExists('bi_report_templates');
        Schema::dropIfExists('bi_export_logs');
    }
};
