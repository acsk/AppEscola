<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('DROP VIEW IF EXISTS vw_report_class_students');

        DB::statement(<<<'SQL'
            CREATE VIEW vw_report_class_students AS
            SELECT
                e.tenant_id AS tenant_id,
                esc.school_class_id AS school_class_id,
                sc.name AS school_class_name,
                c.id AS course_id,
                c.name AS course_name,
                e.id AS enrollment_id,
                e.status AS enrollment_status,
                s.id AS student_id,
                s.name AS student_name,
                s.enrollment_number AS enrollment_number
            FROM (
                SELECT enrollment_id, school_class_id
                FROM enrollment_school_classes
                UNION
                SELECT id AS enrollment_id, school_class_id
                FROM enrollments
                WHERE school_class_id IS NOT NULL
            ) esc
            INNER JOIN enrollments e ON e.id = esc.enrollment_id
            INNER JOIN school_classes sc ON sc.id = esc.school_class_id
            LEFT JOIN courses c ON c.id = sc.course_id
            INNER JOIN students s ON s.id = e.student_id
            WHERE e.deleted_at IS NULL
              AND sc.deleted_at IS NULL
              AND s.deleted_at IS NULL
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP VIEW IF EXISTS vw_report_class_students');
    }
};
