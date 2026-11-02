<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Índices das consultas da Inteligência Educacional: 1ª tentativa por aluno × simulado,
 * tentativas concluídas no período e 1ª tentativa por aluno × questão no banco.
 */
return new class extends Migration
{
    private const INDEXES = [
        'exam_attempts' => [
            'exam_attempts_bi_student_exam_idx' => ['tenant_id', 'student_id', 'exam_id'],
            'exam_attempts_bi_status_finished_idx' => ['tenant_id', 'attempt_status_id', 'finished_at'],
        ],
        'practice_answers' => [
            'practice_answers_bi_first_attempt_idx' => ['tenant_id', 'student_id', 'exam_question_id', 'answered_at'],
        ],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            foreach ($indexes as $name => $columns) {
                if (! Schema::hasIndex($table, $name)) {
                    Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
                }
            }
        }
    }

    /**
     * O MySQL descarta o índice implícito da FK (tenant_id/student_id) quando um composto passa a cobri-la;
     * antes de remover o composto, recria o índice simples se nenhum outro começar pela mesma coluna.
     */
    public function down(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            foreach ($indexes as $name => $columns) {
                if (! Schema::hasIndex($table, $name)) {
                    continue;
                }

                $first = $columns[0];
                $covered = collect(Schema::getIndexes($table))
                    ->contains(fn (array $index) => $index['name'] !== $name && ($index['columns'][0] ?? null) === $first);
                if (! $covered) {
                    Schema::table($table, fn (Blueprint $t) => $t->index($first));
                }

                Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
            }
        }
    }
};
