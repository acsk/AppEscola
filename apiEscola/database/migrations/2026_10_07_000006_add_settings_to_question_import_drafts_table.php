<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Configurações da importação guardadas com o rascunho: criar simulado, modalidade, disciplinas da prova
 * e o simulado já criado (inclusões parciais continuam no mesmo simulado).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_import_drafts', function (Blueprint $table) {
            $table->json('settings')->nullable()->after('active_question_key');
        });
    }

    public function down(): void
    {
        Schema::table('question_import_drafts', function (Blueprint $table) {
            $table->dropColumn('settings');
        });
    }
};
