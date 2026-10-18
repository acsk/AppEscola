<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Última edição do conteúdo pelo administrador. Editada depois da revisão do aviso, o aluno pode avisar de novo. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->timestamp('content_edited_at')->nullable()->after('errors_reset_at');
        });
    }

    public function down(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->dropColumn('content_edited_at');
        });
    }
};
