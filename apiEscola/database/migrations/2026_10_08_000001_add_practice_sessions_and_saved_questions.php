<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Banco de questões do aluno (protótipo do app): sessões montadas por filtro (quantidade, modo de
 * correção, cronômetro) e questões salvas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_attempts', function (Blueprint $table) {
            // 'set' = simulado do banco; 'session' = sessão montada pelo aluno a partir de filtros.
            $table->string('kind', 20)->default('set')->after('question_set_id');
            $table->string('title')->nullable()->after('kind');
            $table->json('question_ids')->nullable()->after('title');
            $table->json('filters')->nullable()->after('question_ids');
            // 'each' = correção a cada questão; 'end' = no final, como simulado.
            $table->string('correction_mode', 10)->default('end')->after('filters');
            $table->unsignedSmallInteger('seconds_per_question')->nullable()->after('correction_mode');
            $table->index(['student_id', 'kind', 'finished_at']);
        });

        Schema::create('practice_saved_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['student_id', 'exam_question_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_saved_questions');
        Schema::table('practice_attempts', function (Blueprint $table) {
            $table->dropIndex(['student_id', 'kind', 'finished_at']);
            $table->dropColumn(['kind', 'title', 'question_ids', 'filters', 'correction_mode', 'seconds_per_question']);
        });
    }
};
