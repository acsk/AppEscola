<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_review_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('students')->cascadeOnDelete();
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->unsignedTinyInteger('box')->default(0);
            $table->date('next_review_on');
            $table->unsignedInteger('reviews_count')->default(0);
            $table->boolean('last_correct')->nullable();
            $table->json('history')->nullable();
            $table->timestamps();
            $table->unique(['student_id', 'exam_question_id'], 'student_review_question_unique');
            $table->index(['student_id', 'next_review_on'], 'student_review_due_idx');
        });

        Schema::create('question_generation_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained('subjects')->cascadeOnDelete();
            $table->foreignId('subject_topic_id')->constrained('subject_topics')->cascadeOnDelete();
            $table->string('status', 20)->default('pending');
            $table->unsignedTinyInteger('batch_size');
            $table->unsignedSmallInteger('created_count')->default(0);
            $table->unsignedSmallInteger('rejected_count')->default(0);
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->json('rejected')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'id'], 'question_generation_status_idx');
            $table->index(['tenant_id', 'subject_topic_id', 'status'], 'question_generation_topic_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_generation_jobs');
        Schema::dropIfExists('student_review_items');
    }
};
