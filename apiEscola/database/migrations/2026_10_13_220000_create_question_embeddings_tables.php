<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Embeddings das questões (equivalente conceitual a questoes_embeddings).
 * O JSON não tem índice vetorial: a busca filtra no SQL e calcula o cosseno no PHP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_embeddings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->foreignId('subject_id')->nullable()->constrained('subjects')->nullOnDelete();
            $table->string('model_name', 120);
            $table->unsignedSmallInteger('dimensions');
            $table->json('embedding');
            $table->char('text_hash', 64);
            $table->string('strategy_version', 16);
            $table->boolean('multimodal_required')->default(false);
            $table->timestamps();

            $table->unique(['exam_question_id', 'model_name', 'strategy_version'], 'question_embeddings_identity');
            $table->index(['tenant_id', 'subject_id', 'model_name', 'strategy_version'], 'question_embeddings_candidates');
            $table->index(['tenant_id', 'text_hash', 'strategy_version'], 'question_embeddings_hash');
        });

        Schema::create('embedding_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('exam_question_id')->nullable()->constrained('exam_questions')->nullOnDelete();
            $table->string('action', 32);
            $table->string('model_name', 120)->nullable();
            $table->unsignedInteger('tokens')->default(0);
            $table->decimal('cost_usd', 12, 6)->default(0);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('embedding_usages');
        Schema::dropIfExists('question_embeddings');
    }
};
