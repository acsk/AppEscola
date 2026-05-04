<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->boolean('allow_text_answer')
                  ->default(false)
                  ->after('explanation')
                  ->comment('Permite resposta textual além da opção objetiva selecionada');
        });
    }

    public function down(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->dropColumn('allow_text_answer');
        });
    }
};
