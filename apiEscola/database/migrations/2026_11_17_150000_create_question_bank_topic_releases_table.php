<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Assuntos do banco liberados para um curso.
 * origin_key separa a marcação manual da que veio de cada simulado oficial.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_bank_topic_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->foreignId('subject_topic_id')->constrained('subject_topics')->cascadeOnDelete();
            $table->foreignId('exam_id')->nullable()->constrained('exams')->cascadeOnDelete();
            $table->string('origin', 16);
            $table->string('origin_key', 32);
            $table->timestamps();

            $table->unique(['course_id', 'subject_topic_id', 'origin_key'], 'qb_topic_release_unique');
            $table->index(['tenant_id', 'course_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_bank_topic_releases');
    }
};
