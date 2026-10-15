<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_issue_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reviewer_name', 160);
            $table->boolean('had_error')->default(false);
            $table->timestamp('reviewed_at');
            $table->timestamps();

            $table->index(['exam_question_id', 'reviewed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_issue_reviews');
    }
};
