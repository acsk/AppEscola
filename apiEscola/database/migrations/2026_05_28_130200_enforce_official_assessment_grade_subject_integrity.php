<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Corrige ambientes onde 130100 rodou vazia ou subject_id ficou nullable com UNIQUE permissivo a NULL.
 */
return new class extends Migration
{
    private const TENANT_SUBJECT_INDEX = 'official_assessment_grades_tenant_student_subject';

    private const GRADES_UNIQUE = 'official_assessment_grades_unique';

    public function up(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        $this->backfillSubjectIds();
        $this->removeDuplicateGradeRows();
        $this->deleteGradesWithoutSubject();

        if ($this->subjectIdIsNullable()) {
            $this->ensureOfficialAssessmentIdIndexForFk();
            $this->dropIndexIfExists('official_assessment_grades', self::GRADES_UNIQUE);

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

        if (
            ! $this->migrationApplied('2026_05_28_130100_add_subject_id_to_official_assessment_grades')
            && ! $this->indexExists('official_assessment_grades', self::TENANT_SUBJECT_INDEX)
        ) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->index(
                    ['tenant_id', 'student_id', 'subject_id'],
                    self::TENANT_SUBJECT_INDEX
                );
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        if (! $this->migrationApplied('2026_05_28_130100_add_subject_id_to_official_assessment_grades')) {
            $this->dropIndexIfExists('official_assessment_grades', self::TENANT_SUBJECT_INDEX);

            if ($this->uniqueIndexIncludesSubjectId('official_assessment_grades', self::GRADES_UNIQUE)) {
                $this->dropIndexIfExists('official_assessment_grades', self::GRADES_UNIQUE);
            }

            if ($this->subjectIdIsNotNull()) {
                DB::statement(
                    'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NULL'
                );
            }

            if (! $this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
                Schema::table('official_assessment_grades', function (Blueprint $table) {
                    $table->unique(
                        ['official_assessment_id', 'student_id'],
                        self::GRADES_UNIQUE
                    );
                });
            }

            return;
        }

        // 130100 aplicada: esta migration não cria índice tenant; apenas garante o schema da 130100 após reparo de dados.
        $this->restore130100Schema();
    }

    /**
     * Recria coluna/índices definidos pela migration 130100 (idempotente se já existirem).
     */
    private function restore130100Schema(): void
    {
        if ($this->subjectIdIsNullable()) {
            DB::statement(
                'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NOT NULL'
            );
        }

        if (! $this->indexExists('official_assessment_grades', self::GRADES_UNIQUE)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->unique(
                    ['official_assessment_id', 'student_id', 'subject_id'],
                    self::GRADES_UNIQUE
                );
            });
        }

        if (! $this->indexExists('official_assessment_grades', self::TENANT_SUBJECT_INDEX)) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->index(
                    ['tenant_id', 'student_id', 'subject_id'],
                    self::TENANT_SUBJECT_INDEX
                );
            });
        }
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

    private function removeDuplicateGradeRows(): void
    {
        DB::statement('
            DELETE g1 FROM official_assessment_grades g1
            INNER JOIN official_assessment_grades g2
                ON g1.official_assessment_id = g2.official_assessment_id
                AND g1.student_id = g2.student_id
                AND g1.subject_id <=> g2.subject_id
                AND g1.id < g2.id
        ');
    }

    private function deleteGradesWithoutSubject(): void
    {
        DB::table('official_assessment_grades')->whereNull('subject_id')->delete();
    }

    private function migrationApplied(string $migration): bool
    {
        return DB::table('migrations')->where('migration', $migration)->exists();
    }

    private function subjectIdIsNullable(): bool
    {
        $column = collect(DB::select("SHOW COLUMNS FROM official_assessment_grades WHERE Field = 'subject_id'"))->first();

        return $column !== null && strtoupper((string) $column->Null) === 'YES';
    }

    private function subjectIdIsNotNull(): bool
    {
        return ! $this->subjectIdIsNullable();
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]))->isNotEmpty();
    }

    private function uniqueIndexIncludesSubjectId(string $table, string $indexName): bool
    {
        return collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]))
            ->contains(fn ($row) => ($row->Column_name ?? '') === 'subject_id');
    }

    private function ensureOfficialAssessmentIdIndexForFk(): void
    {
        $indexName = 'official_assessment_grades_official_assessment_id_index';

        if ($this->indexExists('official_assessment_grades', $indexName)) {
            return;
        }

        Schema::table('official_assessment_grades', function (Blueprint $table) use ($indexName) {
            $table->index('official_assessment_id', $indexName);
        });
    }

    private function dropIndexIfExists(string $table, string $indexName): void
    {
        if (! $this->indexExists($table, $indexName)) {
            return;
        }

        $isUnique = (int) (collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]))->first()?->Non_unique ?? 1) === 0;

        Schema::table($table, function (Blueprint $blueprint) use ($indexName, $isUnique) {
            if ($isUnique) {
                $blueprint->dropUnique($indexName);
            } else {
                $blueprint->dropIndex($indexName);
            }
        });
    }
};
