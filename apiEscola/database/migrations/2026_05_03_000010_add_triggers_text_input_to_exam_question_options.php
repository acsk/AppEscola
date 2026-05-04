<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_question_options', function (Blueprint $table) {
            $table->boolean('triggers_text_input')
                  ->default(false)
                  ->after('is_correct')
                  ->comment('Quando selecionada, exibe campo de texto livre (ex.: opção "Outro")');
        });
    }

    public function down(): void
    {
        Schema::table('exam_question_options', function (Blueprint $table) {
            $table->dropColumn('triggers_text_input');
        });
    }
};
