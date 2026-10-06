<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Banco de questões: questão avulsa = exam_id NULL.
 * Fluxos de simulado continuam acessando questões via $exam->questions().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->unsignedBigInteger('exam_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('exam_questions')->whereNull('exam_id')->exists()) {
            throw new RuntimeException(
                'Existem questões avulsas (exam_id nulo). Vincule-as a um simulado ou remova-as antes de reverter.'
            );
        }

        Schema::table('exam_questions', function (Blueprint $table) {
            $table->unsignedBigInteger('exam_id')->nullable(false)->change();
        });
    }
};
