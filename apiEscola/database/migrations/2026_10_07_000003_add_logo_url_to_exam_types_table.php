<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Logo da modalidade (IFAL, CPM, ENEM…), exibido no painel e no app do aluno. Enviado pelo super admin. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_types', function (Blueprint $table) {
            $table->string('logo_url', 500)->nullable()->after('label');
        });
    }

    public function down(): void
    {
        Schema::table('exam_types', function (Blueprint $table) {
            $table->dropColumn('logo_url');
        });
    }
};
