<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Corrige registros de past_exams que ficaram com exam_type_id NULL após a migração
 * 2026_05_24_000002 (versão sem fallback para slug "custom").
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('past_exams', 'exam_type_id')) {
            return;
        }

        $customTypeId = DB::table('exam_types')->where('slug', 'custom')->value('id');
        if (! $customTypeId) {
            return;
        }

        DB::table('past_exams')
            ->whereNull('exam_type_id')
            ->update([
                'exam_type_id' => $customTypeId,
                'exam_type'    => 'custom',
            ]);
    }

    public function down(): void
    {
        // Não reverte: não é possível distinguir registros ajustados pelo fallback.
    }
};
