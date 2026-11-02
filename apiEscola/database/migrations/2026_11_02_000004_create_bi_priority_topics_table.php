<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Assuntos prioritários por concurso (peso no edital) e o concurso alvo de cada curso.
 * Base do índice de Preparação do BI; sem cadastro, o BI usa todos os assuntos (provisório).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bi_priority_topics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exam_type_id')->constrained('exam_types')->cascadeOnDelete();
            $table->foreignId('subject_topic_id')->constrained('subject_topics')->cascadeOnDelete();
            $table->unsignedTinyInteger('weight')->default(1);
            $table->timestamps();

            $table->unique(['tenant_id', 'exam_type_id', 'subject_topic_id'], 'bi_priority_topics_unique');
        });

        Schema::table('courses', function (Blueprint $table) {
            $table->foreignId('target_exam_type_id')->nullable()->after('status')->constrained('exam_types')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('target_exam_type_id');
        });
        Schema::dropIfExists('bi_priority_topics');
    }
};
