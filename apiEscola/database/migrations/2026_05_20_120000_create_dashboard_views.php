<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // View usa funções MySQL (DATE_SUB, CURDATE…); em SQLite os testes usam fallback no service.
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE VIEW vw_dashboard_tenant_summary AS
            SELECT
                t.id AS tenant_id,
                COALESCE(st.students_total, 0) AS students_total,
                COALESCE(st.students_active, 0) AS students_active,
                COALESCE(st.students_inactive, 0) AS students_inactive,
                COALESCE(st.students_minor, 0) AS students_minor,
                COALESCE(st.students_adult, 0) AS students_adult,
                COALESCE(tc.teachers_count, 0) AS teachers_count,
                COALESCE(sc.classes_active, 0) AS classes_active,
                COALESCE(en.enrollments_active, 0) AS enrollments_active,
                COALESCE(ex.exam_passes_30d, 0) AS exam_passes_30d,
                COALESCE(inv.invoices_open_count, 0) AS invoices_open_count,
                COALESCE(inv.invoices_open_amount, 0) AS invoices_open_amount,
                COALESCE(inv.invoices_overdue_count, 0) AS invoices_overdue_count,
                COALESCE(inv.invoices_overdue_amount, 0) AS invoices_overdue_amount,
                COALESCE(inv.paid_current_month_amount, 0) AS paid_current_month_amount,
                COALESCE(inv.paid_current_month_count, 0) AS paid_current_month_count,
                COALESCE(inv.paid_previous_month_amount, 0) AS paid_previous_month_amount
            FROM tenants t
            LEFT JOIN (
                SELECT
                    tenant_id,
                    COUNT(*) AS students_total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS students_active,
                    SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) AS students_inactive,
                    SUM(CASE WHEN is_minor = 1 THEN 1 ELSE 0 END) AS students_minor,
                    SUM(CASE WHEN is_minor = 0 THEN 1 ELSE 0 END) AS students_adult
                FROM students
                WHERE deleted_at IS NULL
                GROUP BY tenant_id
            ) st ON st.tenant_id = t.id
            LEFT JOIN (
                SELECT tenant_id, COUNT(*) AS teachers_count
                FROM users
                WHERE deleted_at IS NULL
                  AND status = 'active'
                  AND role = 'professor'
                GROUP BY tenant_id
            ) tc ON tc.tenant_id = t.id
            LEFT JOIN (
                SELECT tenant_id, COUNT(*) AS classes_active
                FROM school_classes
                WHERE deleted_at IS NULL
                  AND status = 'active'
                GROUP BY tenant_id
            ) sc ON sc.tenant_id = t.id
            LEFT JOIN (
                SELECT tenant_id, COUNT(*) AS enrollments_active
                FROM enrollments
                WHERE deleted_at IS NULL
                  AND status = 'active'
                GROUP BY tenant_id
            ) en ON en.tenant_id = t.id
            LEFT JOIN (
                SELECT tenant_id, COUNT(*) AS exam_passes_30d
                FROM exam_attempts
                WHERE deleted_at IS NULL
                  AND finished_at IS NOT NULL
                  AND percentage >= 70
                  AND finished_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY tenant_id
            ) ex ON ex.tenant_id = t.id
            LEFT JOIN (
                SELECT
                    tenant_id,
                    SUM(CASE WHEN status IN ('pending', 'overdue') THEN 1 ELSE 0 END) AS invoices_open_count,
                    SUM(CASE WHEN status IN ('pending', 'overdue') THEN amount ELSE 0 END) AS invoices_open_amount,
                    SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS invoices_overdue_count,
                    SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END) AS invoices_overdue_amount,
                    SUM(
                        CASE
                            WHEN status = 'paid'
                                 AND paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                            THEN amount ELSE 0
                        END
                    ) AS paid_current_month_amount,
                    SUM(
                        CASE
                            WHEN status = 'paid'
                                 AND paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                            THEN 1 ELSE 0
                        END
                    ) AS paid_current_month_count,
                    SUM(
                        CASE
                            WHEN status = 'paid'
                                 AND paid_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
                                 AND paid_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                            THEN amount ELSE 0
                        END
                    ) AS paid_previous_month_amount
                FROM invoices
                WHERE deleted_at IS NULL
                GROUP BY tenant_id
            ) inv ON inv.tenant_id = t.id
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP VIEW IF EXISTS vw_dashboard_tenant_summary');
    }
};
