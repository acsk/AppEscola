<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Origem do simulado: null = criado manualmente; 'pdf_import' = prova importada de PDF
 * pelo banco de questões (lista "Simulados importados").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->string('origin', 30)->nullable()->after('description');
            $table->index(['tenant_id', 'origin']);
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'origin']);
            $table->dropColumn('origin');
        });
    }
};
