<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Notas presenciais por turma: uma linha por aluno/avaliação (subject_id opcional).
 */
return new class extends Migration
{
    private const GRADES_UNIQUE = 'official_assessment_grades_unique';

    public function up(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        $this->dedupeGradesPerStudent();

        if ($this->uniqueIndexIncludesSubjectId('official_assessment_grades', self::GRADES_UNIQUE)) {
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

    private function dedupeGradesPerStudent(): void
    {
        $duplicates = DB::table('official_assessment_grades')
            ->select('official_assessment_id', 'student_id', DB::raw('COUNT(*) as total'))
            ->groupBy('official_assessment_id', 'student_id')
            ->having('total', '>', 1)
            ->get();

        foreach ($duplicates as $row) {
            // MySQL: NULLs vêm primeiro em ORDER BY ... DESC — priorizar linhas com graded_at preenchido.
            $ids = DB::table('official_assessment_grades')
                ->where('official_assessment_id', $row->official_assessment_id)
                ->where('student_id', $row->student_id)
                ->orderByRaw('graded_at IS NULL ASC')
                ->orderByDesc('graded_at')
                ->orderByDesc('id')
                ->pluck('id');

            $ids->slice(1)->each(function ($id) {
                DB::table('official_assessment_grades')->where('id', $id)->delete();
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

    private function uniqueIndexIncludesSubjectId(string $table, string $index): bool
    {
        $connection = Schema::getConnection();
        $database = $connection->getDatabaseName();

        $columns = DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', $table)
            ->where('index_name', $index)
            ->where('seq_in_index', 3)
            ->value('column_name');

        return $columns === 'subject_id';
    }
};