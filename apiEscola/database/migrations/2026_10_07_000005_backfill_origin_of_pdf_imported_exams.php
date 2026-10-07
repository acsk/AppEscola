<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Simulados criados pela importação de PDF antes da coluna `origin` existir: o painel os cria sempre com
 * esta descrição. Sem a marca, não aparecem em "Simulados importados de PDF".
 */
return new class extends Migration
{
    private const DESCRIPTION = 'Importado de PDF pelo banco de questões.';

    public function up(): void
    {
        DB::table('exams')->whereNull('origin')->where('description', self::DESCRIPTION)->update(['origin' => 'pdf_import']);
    }

    public function down(): void
    {
        DB::table('exams')->where('origin', 'pdf_import')->where('description', self::DESCRIPTION)->update(['origin' => null]);
    }
};
