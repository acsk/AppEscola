<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            Schema::table('official_assessment_grades', function (Blueprint $table) {
                $table->foreignId('subject_id')
                    ->nullable()
                    ->after('student_id')
                    ->constrained()
                    ->cascadeOnDelete();
            });
        }

        $this->backfillSubjectIds();
        $this->removeDuplicateGradeRows();
        $this->deleteGradesWithoutSubject();

        $this->ensureOfficialAssessmentIdIndexForFk();

        $this->dropIndexIfExists('official_assessment_grades', 'official_assessment_grades_unique');

        DB::statement(
            'ALTER TABLE official_assessment_grades MODIFY COLUMN subject_id BIGINT UNSIGNED NOT NULL'
        );

        Schema::table('official_assessment_grades', function (Blueprint $table) {
            $table->unique(
                ['official_assessment_id', 'student_id', 'subject_id'],
                'official_assessment_grades_unique'
            );
            $table->index(['tenant_id', 'student_id', 'subject_id'], 'official_assessment_grades_tenant_student_subject');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('official_assessment_grades', 'subject_id')) {
            return;
        }

        $this->dropIndexIfExists('official_assessment_grades', 'official_assessment_grades_unique');
        $this->dropIndexIfExists('official_assessment_grades', 'official_assessment_grades_tenant_student_subject');

        Schema::table('official_assessment_grades', function (Blueprint $table) {
            $table->unique(
                ['official_assessment_id', 'student_id'],
                'official_assessment_grades_unique'
            );
        });

        Schema::table('official_assessment_grades', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
            $table->dropColumn('subject_id');
        });
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

    /**
     * MySQL trata NULL como distinto em UNIQUE — remove duplicatas antes de NOT NULL + novo índice.
     */
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

    /**
     * MySQL usa o UNIQUE (official_assessment_id, student_id) para a FK em official_assessment_id.
     */
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

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]))->isNotEmpty();
    }

    private function dropIndexIfExists(string $table, string $indexName): void
    {
        $exists = collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]))->isNotEmpty();

        if (! $exists) {
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
