<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_import_drafts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('source_exam_name');
            $table->json('questions');
            $table->json('no_text_pages');
            $table->string('active_question_key', 100)->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->index(['tenant_id', 'user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_import_drafts');
    }
};
