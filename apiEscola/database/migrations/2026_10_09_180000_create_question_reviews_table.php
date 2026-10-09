<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->nullable()->constrained('exam_questions')->nullOnDelete();
            $table->foreignId('source_question_id')->nullable()->constrained('exam_questions')->nullOnDelete();
            $table->char('content_hash', 64);
            $table->string('generation_model')->nullable();
            $table->string('review_model')->nullable();
            $table->string('gabarito_original', 5)->nullable();
            $table->string('gabarito_revisor', 5)->nullable();
            $table->string('result', 30);
            $table->string('status', 30);
            $table->json('problems')->nullable();
            $table->string('recommendation', 30)->nullable();
            $table->text('explanation')->nullable();
            $table->unsignedTinyInteger('attempts')->default(1);
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->decimal('estimated_cost', 12, 6)->nullable();
            $table->json('content')->nullable();
            $table->timestamp('validated_at');
            $table->timestamps();

            $table->index(['tenant_id', 'question_id']);
            $table->index(['tenant_id', 'content_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_reviews');
    }
};
