<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Classificação de questões: dificuldade (global), bancas e tags (por tenant),
 * assuntos por disciplina e novos campos em exam_questions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_difficulties', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('question_difficulties')->insert([
            ['name' => 'Muito fácil',   'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Fácil',         'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Média',         'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Difícil',       'sort_order' => 4, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Muito difícil', 'sort_order' => 5, 'created_at' => $now, 'updated_at' => $now],
        ]);

        Schema::create('question_boards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('question_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name', 50);
            $table->text('description')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('subject_topics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained('subjects')->cascadeOnDelete();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->timestamps();
            $table->unique(['subject_id', 'name']);
        });

        Schema::table('exam_questions', function (Blueprint $table) {
            $table->foreignId('difficulty_id')->nullable()->after('exam_type_id')
                ->constrained('question_difficulties')->nullOnDelete();
            $table->foreignId('board_id')->nullable()->after('difficulty_id')
                ->constrained('question_boards')->nullOnDelete();
            $table->unsignedSmallInteger('year')->nullable()->after('board_id');
            $table->boolean('is_annulled')->default(false)->after('year');
            $table->boolean('is_outdated')->default(false)->after('is_annulled');
            $table->index(['tenant_id', 'year']);
        });

        Schema::create('exam_question_topic', function (Blueprint $table) {
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->foreignId('subject_topic_id')->constrained('subject_topics')->cascadeOnDelete();
            $table->primary(['exam_question_id', 'subject_topic_id']);
            $table->index('subject_topic_id');
        });

        Schema::create('exam_question_tag', function (Blueprint $table) {
            $table->foreignId('exam_question_id')->constrained('exam_questions')->cascadeOnDelete();
            $table->foreignId('question_tag_id')->constrained('question_tags')->cascadeOnDelete();
            $table->primary(['exam_question_id', 'question_tag_id']);
            $table->index('question_tag_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_question_tag');
        Schema::dropIfExists('exam_question_topic');

        Schema::table('exam_questions', function (Blueprint $table) {
            // O MySQL pode ter adotado o índice composto para a FK de tenant_id.
            $table->index('tenant_id');
            $table->dropIndex(['tenant_id', 'year']);
            $table->dropConstrainedForeignId('board_id');
            $table->dropConstrainedForeignId('difficulty_id');
            $table->dropColumn(['year', 'is_annulled', 'is_outdated']);
        });

        Schema::dropIfExists('subject_topics');
        Schema::dropIfExists('question_tags');
        Schema::dropIfExists('question_boards');
        Schema::dropIfExists('question_difficulties');
    }
};
