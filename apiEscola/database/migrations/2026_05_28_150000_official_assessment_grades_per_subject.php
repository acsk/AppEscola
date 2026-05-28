<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Notas por disciplina: uma linha por (avaliação, aluno, disciplina).
 */
return new class extends Migration
{
    private const GRADES_UNIQUE = 'official_assessment_grades_unique';

    public function up(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        if ($this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->dropUnique(self::GRADES_UNIQUE);
            });
        }

        DB::statement(
            'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NOT NULL'
        );

        if (! $this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->unique(
                    ['official_assessment_id', 'student_id', 'subject_id'],
                    self::GRADES_UNIQUE
                );
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        if ($this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->dropUnique(self::GRADES_UNIQUE);
            });
        }

        DB::statement(
            'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NULL'
        );

        if (! $this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->unique(['official_assessment_id', 'student_id'], self::GRADES_UNIQUE);
            });
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        $connection = Schema::getConnection();
        $database = $connection->getDatabaseName();

        return (bool) DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', $table)
            ->where('index_name', $index)
            ->count();
    }
};
