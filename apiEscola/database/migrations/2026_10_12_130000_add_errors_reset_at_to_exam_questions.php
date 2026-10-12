<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A partir desta data, a coluna Erros do banco ignora respostas anteriores (a nota do simulado permanece). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->timestamp('errors_reset_at')->nullable()->after('practice_reset_at');
        });
    }

    public function down(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->dropColumn('errors_reset_at');
        });
    }
};
