<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_image_generations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('source_question_id')->nullable()->constrained('exam_questions')->nullOnDelete();
            $table->foreignId('question_id')->nullable()->constrained('exam_questions')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('PENDING');
            $table->string('origin', 30)->default('AI_GENERATED');
            $table->string('provider', 30)->default('openrouter');
            $table->string('model')->nullable();
            $table->string('prompt_version', 30)->default('question-image-v1');
            $table->text('prompt')->nullable();
            $table->json('content')->nullable();
            $table->json('analysis')->nullable();
            $table->json('image_spec')->nullable();
            $table->json('validation')->nullable();
            $table->json('metadata')->nullable();
            $table->string('disk')->nullable();
            $table->string('path', 500)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('mime_type', 50)->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->unsignedInteger('duration_ms')->default(0);
            $table->text('error')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_image_generations');
    }
};
