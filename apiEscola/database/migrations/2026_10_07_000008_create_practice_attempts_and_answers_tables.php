<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Prática do aluno no banco de questões, separada dos simulados oficiais (sem nota nem ranking).
 * Resposta sem tentativa = questão avulsa; com tentativa = simulado do banco.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_set_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('question_count');
            $table->unsignedInteger('answered_count')->default(0);
            $table->unsignedInteger('correct_count')->default(0);
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['student_id', 'question_set_id']);
        });

        Schema::create('practice_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('practice_attempt_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->foreignId('option_id')->nullable()->constrained('exam_question_options')->nullOnDelete();
            $table->boolean('is_correct');
            $table->timestamp('answered_at');
            $table->timestamps();
            $table->unique(['practice_attempt_id', 'exam_question_id']);
            $table->index(['student_id', 'answered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_answers');
        Schema::dropIfExists('practice_attempts');
    }
};
