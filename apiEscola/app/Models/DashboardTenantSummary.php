<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Leitura agregada por tenant (view vw_dashboard_tenant_summary).
 */
class DashboardTenantSummary extends Model
{
    protected $table = 'vw_dashboard_tenant_summary';

    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'tenant_id';

    protected $casts = [
        'students_total' => 'integer',
        'students_active' => 'integer',
        'students_inactive' => 'integer',
        'students_minor' => 'integer',
        'students_adult' => 'integer',
        'teachers_count' => 'integer',
        'classes_active' => 'integer',
        'enrollments_active' => 'integer',
        'exam_passes_30d' => 'integer',
        'invoices_open_count' => 'integer',
        'invoices_open_amount' => 'decimal:2',
        'invoices_overdue_count' => 'integer',
        'invoices_overdue_amount' => 'decimal:2',
        'paid_current_month_amount' => 'decimal:2',
        'paid_current_month_count' => 'integer',
        'paid_previous_month_amount' => 'decimal:2',
    ];
}
