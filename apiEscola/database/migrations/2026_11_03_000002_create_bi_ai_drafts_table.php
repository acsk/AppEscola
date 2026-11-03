<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rascunhos de IA do BI (Fase 5): o texto gerado, as evidências citadas e a validação humana.
 * Rascunho só vai para documento depois de validado por uma pessoa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bi_ai_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // diagnosis | report_summary | school_insights
            $table->string('target_key', 60); // student:12 | report:results | school
            $table->date('period_from');
            $table->date('period_to');
            $table->json('filters')->nullable();
            $table->json('content'); // parágrafos ou insights, cada um com evidências
            $table->json('facts'); // dados enviados à IA (sem identificação de aluno)
            $table->json('unverified')->nullable(); // números do texto que não batem com os dados
            $table->text('edited_text')->nullable();
            $table->string('model', 120)->nullable();
            $table->string('status', 12)->default('draft'); // draft | validated | discarded
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'kind', 'target_key'], 'bi_ai_drafts_target_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bi_ai_drafts');
    }
};
