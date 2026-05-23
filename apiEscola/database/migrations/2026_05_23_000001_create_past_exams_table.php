<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('past_exams', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('subject_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('exam_year')->nullable();
            $table->string('exam_type', 50)->nullable();
            $table->enum('type', ['link', 'file'])->default('link');
            $table->text('content');
            $table->string('file_type')->nullable();
            $table->unsignedInteger('file_size')->nullable();
            $table->boolean('is_published')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_published', 'sort_order']);
            $table->index(['tenant_id', 'course_id']);
            $table->index(['tenant_id', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('past_exams');
    }
};
