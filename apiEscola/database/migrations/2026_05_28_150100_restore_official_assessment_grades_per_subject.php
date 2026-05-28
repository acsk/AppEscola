<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Restaura uma nota por (avaliação, aluno, disciplina) — alinhado ao painel multidisciplinar.
 * Reverte o índice único de 140000 (apenas avaliação + aluno).
 *
 * down(): NÃO remove notas por disciplina. Se existir mais de uma linha por (avaliação, aluno)
 * com disciplinas distintas, o rollback falha com exceção — evita perda silenciosa de dados.
 */
return new class extends Migration
{
    private const GRADES_UNIQUE = 'official_assessment_grades_unique';

    private const OFFICIAL_ASSESSMENT_ID_INDEX = 'official_assessment_grades_official_assessment_id_index';

    public function up(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        $this->dedupeGradesPerStudentAndSubject();

        if (
            $this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)
            && ! $this->uniqueIndexIncludesSubjectId('official_assessment_grades', self::GRADES_UNIQUE)
        ) {
            $this->ensureOfficialAssessmentIdIndexForFk();
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->dropUnique(self::GRADES_UNIQUE);
            });
        }

        $this->backfillSubjectIds();
        $this->deleteGradesWithoutSubject();

        DB::statement(
            'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NOT NULL'
        );

        if (! $this->uniqueIndexIncludesSubjectId('official_assessment_grades', self::GRADES_UNIQUE)) {
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

        $this->dedupeGradesPerStudentAndSubject();
        $this->assertRollbackWontDropPerSubjectGrades();

        if ($this->uniqueIndexIncludesSubjectId('official_assessment_grades', self::GRADES_UNIQUE)) {
            $this->ensureOfficialAssessmentIdIndexForFk();
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

    private function dedupeGradesPerStudentAndSubject(): void
    {
        $duplicates = DB::table('official_assessment_grades')
            ->select(
                'official_assessment_id',
                'student_id',
                'subject_id',
                DB::raw('COUNT(*) as total')
            )
            ->groupBy('official_assessment_id', 'student_id', 'subject_id')
            ->having('total', '>', 1)
            ->get();

        foreach ($duplicates as $row) {
            $query = DB::table('official_assessment_grades')
                ->where('official_assessment_id', $row->official_assessment_id)
                ->where('student_id', $row->student_id);

            if ($row->subject_id === null) {
                $query->whereNull('subject_id');
            } else {
                $query->where('subject_id', $row->subject_id);
            }

            $ids = $query
                ->orderByRaw('graded_at IS NULL ASC')
                ->orderByDesc('graded_at')
                ->orderByDesc('id')
                ->pluck('id');

            $ids->slice(1)->each(function ($id) {
                DB::table('official_assessment_grades')->where('id', $id)->delete();
            });
        }
    }

    /**
     * Impede rollback que recriaria UNIQUE (avaliação, aluno) enquanto há notas multidisciplinares.
     */
    private function assertRollbackWontDropPerSubjectGrades(): void
    {
        $hasMultipleGradesPerStudent = DB::table('official_assessment_grades')
            ->select('official_assessment_id', 'student_id')
            ->groupBy('official_assessment_id', 'student_id')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if (! $hasMultipleGradesPerStudent) {
            return;
        }

        throw new \RuntimeException(
            'Rollback da migration 2026_05_28_150100_restore_official_assessment_grades_per_subject abortado: '.
            'existem notas em mais de uma disciplina (ou linhas duplicadas) para o mesmo aluno na mesma avaliação. '.
            'Reverter para o índice (avaliação, aluno) exigiria apagar dados legítimos. '.
            'Faça backup ou consolide/remova notas manualmente antes de migrate:rollback.'
        );
    }

    private function backfillSubjectIds(): void
    {
        DB::statement('
            UPDATE official_assessment_grades g
            INNER JOIN official_assessments a ON a.id = g.official_assessment_id
            SET g.subject_id = a.subject_id
            WHERE g.subject_id IS NULL AND a.subject_id IS NOT NULL
        ');

        if (Schema::hasTable('official_assessment_subject')) {
            DB::statement('
                UPDATE official_assessment_grades g
                INNER JOIN (
                    SELECT official_assessment_id, MIN(subject_id) AS subject_id
                    FROM official_assessment_subject
                    GROUP BY official_assessment_id
                ) pivot ON pivot.official_assessment_id = g.official_assessment_id
                SET g.subject_id = pivot.subject_id
                WHERE g.subject_id IS NULL
            ');
        }
    }

    private function deleteGradesWithoutSubject(): void
    {
        DB::table('official_assessment_grades')->whereNull('subject_id')->delete();
    }

    private function ensureOfficialAssessmentIdIndexForFk(): void
    {
        if ($this->indexExists('official_assessment_grades', self::OFFICIAL_ASSESSMENT_ID_INDEX)) {
            return;
        }

        Schema::table('official_assessment_grades', function (Blueprint $table) {
            $table->index('official_assessment_id', self::OFFICIAL_ASSESSMENT_ID_INDEX);
        });
    }

    private function indexExists(string $table, string $index): bool
    {
        return $this->indexStatisticsQuery($table, $index)->exists();
    }

    private function uniqueIndexIncludesSubjectId(string $table, string $index): bool
    {
        return $this->indexStatisticsQuery($table, $index)
            ->where('seq_in_index', 3)
            ->value('column_name') === 'subject_id';
    }

    /**
     * Consulta information_schema com table/index parametrizados (sem interpolar identificadores no SQL).
     */
    private function indexStatisticsQuery(string $table, string $index): \Illuminate\Database\Query\Builder
    {
        $this->assertSafeSqlIdentifier($table);
        $this->assertSafeSqlIdentifier($index);

        return DB::table('information_schema.statistics')
            ->where('table_schema', Schema::getConnection()->getDatabaseName())
            ->where('table_name', $table)
            ->where('index_name', $index);
    }

    private function assertSafeSqlIdentifier(string $name): void
    {
        if (! preg_match('/^[A-Za-z0-9_]+$/', $name)) {
            throw new \InvalidArgumentException("Identificador SQL inválido: {$name}");
        }
    }
};
