<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Foto horária do ranking do banco de questões.
 * A view recalcula a posição atual; o comando ranking:snapshot grava a foto para a seta de subida/descida.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_ranking_snapshots', function (Blueprint $table) {
            $table->id();
            $table->timestamp('captured_at');
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('period', 20);
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->unsignedInteger('questions');
            $table->unsignedInteger('correct');
            $table->index(['tenant_id', 'period', 'captured_at']);
        });

        // A view usa RANK() e CONVERT_TZ; o SQLite dos testes não cria a view (o comando calcula em PHP).
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE VIEW vw_practice_ranking AS
            SELECT
                ranked.tenant_id,
                ranked.period,
                ranked.student_id,
                ranked.questions,
                ranked.correct_answers AS correct,
                RANK() OVER (
                    PARTITION BY ranked.tenant_id, ranked.period
                    ORDER BY ranked.questions DESC, ranked.correct_answers DESC
                ) AS position
            FROM (
                SELECT
                    pa.tenant_id,
                    periods.period,
                    pa.student_id,
                    COUNT(DISTINCT pa.exam_question_id) AS questions,
                    SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers
                FROM practice_answers pa
                INNER JOIN students s
                    ON s.id = pa.student_id
                    AND s.status = 'active'
                    AND s.deleted_at IS NULL
                INNER JOIN (
                    SELECT 'week' AS period, week_bounds.week_start AS since_at, CAST(NULL AS DATETIME) AS until_at
                    FROM (
                        SELECT CONVERT_TZ(
                            TIMESTAMP(DATE_SUB(
                                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-03:00')),
                                INTERVAL WEEKDAY(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-03:00')) DAY
                            )),
                            '-03:00', '+00:00'
                        ) AS week_start
                    ) week_bounds
                    UNION ALL
                    SELECT 'last_week', DATE_SUB(week_bounds.week_start, INTERVAL 7 DAY), week_bounds.week_start
                    FROM (
                        SELECT CONVERT_TZ(
                            TIMESTAMP(DATE_SUB(
                                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-03:00')),
                                INTERVAL WEEKDAY(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-03:00')) DAY
                            )),
                            '-03:00', '+00:00'
                        ) AS week_start
                    ) week_bounds
                    UNION ALL
                    SELECT 'month', UTC_TIMESTAMP() - INTERVAL 30 DAY, CAST(NULL AS DATETIME)
                    UNION ALL
                    SELECT 'all', CAST(NULL AS DATETIME), CAST(NULL AS DATETIME)
                ) periods
                    ON (periods.since_at IS NULL OR pa.answered_at >= periods.since_at)
                    AND (periods.until_at IS NULL OR pa.answered_at < periods.until_at)
                WHERE pa.practice_attempt_id IS NULL
                    OR EXISTS (
                        SELECT 1 FROM practice_attempts pat
                        WHERE pat.id = pa.practice_attempt_id
                            AND (pat.finished_at IS NOT NULL OR pat.correction_mode = 'each')
                    )
                GROUP BY pa.tenant_id, periods.period, pa.student_id
            ) ranked
        SQL);
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('DROP VIEW IF EXISTS vw_practice_ranking');
        }

        Schema::dropIfExists('practice_ranking_snapshots');
    }
};
