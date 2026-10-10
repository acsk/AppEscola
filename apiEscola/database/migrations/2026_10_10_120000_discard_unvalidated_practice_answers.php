<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Respostas de prática em questão ainda não aprovada saem da soma.
 * O aluno responde de novo depois que a questão for validada.
 * Notas de simulado oficial (exam_answers) não são apagadas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('practice_answers')
            ->whereNotIn('exam_question_id', function ($query) {
                $query->select('qr.question_id')
                    ->from('question_reviews as qr')
                    ->whereIn('qr.status', ['aprovada', 'aprovada_manual'])
                    ->whereRaw('qr.id = (select max(latest.id) from question_reviews as latest where latest.question_id = qr.question_id)');
            })
            ->delete();
    }

    public function down(): void
    {
        // As respostas descartadas não podem ser restauradas.
    }
};
