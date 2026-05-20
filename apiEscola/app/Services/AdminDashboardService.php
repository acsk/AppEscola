<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\DashboardTenantSummary;
use App\Models\Enrollment;
use App\Models\ExamAttempt;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class AdminDashboardService
{
    /**
     * @return array<string, mixed>
     */
    public function build(int $tenantId, ?int $schoolClassId = null): array
    {
        $row = $this->loadSummaryRow($tenantId);

        $classes = SchoolClass::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name']);

        if ($schoolClassId === null && $classes->isNotEmpty()) {
            $schoolClassId = (int) $classes->first()->id;
        }

        $attendanceClass = $classes->firstWhere('id', $schoolClassId);

        return [
            'generated_at' => now()->toISOString(),
            'stats' => $this->buildStats($row),
            'students_breakdown' => $this->buildStudentsBreakdown($row),
            'finance' => $this->buildFinance($row),
            'attendance' => $this->buildAttendanceWeekly($tenantId, $schoolClassId),
            'attendance_class' => $attendanceClass
                ? ['id' => $attendanceClass->id, 'name' => $attendanceClass->name]
                : null,
            'school_classes' => $classes->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])->values()->all(),
            'calendar' => $this->buildCalendarMeta($tenantId),
            'upcoming_events' => $this->buildUpcomingEvents($tenantId),
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<int, array<string, mixed>>
     */
    private function buildStats(array $row): array
    {
        $studentsTrend = $this->monthOverMonthTrend(
            Student::query()
                ->where('tenant_id', $row['tenant_id'])
                ->whereNull('deleted_at'),
            'created_at'
        );

        return [
            [
                'key' => 'students',
                'label' => 'Alunos',
                'value' => (int) ($row['students_active'] ?? 0),
                'trend_percent' => $studentsTrend,
                'variant' => 'purple',
            ],
            [
                'key' => 'teachers',
                'label' => 'Professores',
                'value' => (int) ($row['teachers_count'] ?? 0),
                'trend_percent' => null,
                'variant' => 'amber',
            ],
            [
                'key' => 'classes',
                'label' => 'Turmas',
                'value' => (int) ($row['classes_active'] ?? 0),
                'trend_percent' => null,
                'variant' => 'sky',
            ],
            [
                'key' => 'finance_open',
                'label' => 'Em aberto',
                'value' => (int) ($row['invoices_open_count'] ?? 0),
                'trend_percent' => null,
                'variant' => 'teal',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function buildStudentsBreakdown(array $row): array
    {
        $active = (int) ($row['students_active'] ?? 0);
        $inactive = (int) ($row['students_inactive'] ?? 0);
        $total = max(0, $active + $inactive);

        return [
            'total' => $total,
            'segments' => [
                [
                    'key' => 'active',
                    'label' => 'Ativos',
                    'count' => $active,
                    'percent' => $total > 0 ? (int) round($active / $total * 100) : 0,
                    'color' => '#8B5CF6',
                ],
                [
                    'key' => 'inactive',
                    'label' => 'Inativos',
                    'count' => $inactive,
                    'percent' => $total > 0 ? (int) round($inactive / $total * 100) : 0,
                    'color' => '#FBBF24',
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function buildFinance(array $row): array
    {
        return [
            'open_count' => (int) ($row['invoices_open_count'] ?? 0),
            'open_amount' => number_format((float) ($row['invoices_open_amount'] ?? 0), 2, '.', ''),
            'overdue_count' => (int) ($row['invoices_overdue_count'] ?? 0),
            'overdue_amount' => number_format((float) ($row['invoices_overdue_amount'] ?? 0), 2, '.', ''),
            'paid_month_count' => (int) ($row['paid_current_month_count'] ?? 0),
            'paid_month_amount' => number_format((float) ($row['paid_current_month_amount'] ?? 0), 2, '.', ''),
            'exam_passes_30d' => (int) ($row['exam_passes_30d'] ?? 0),
            'enrollments_active' => (int) ($row['enrollments_active'] ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildAttendanceWeekly(int $tenantId, ?int $schoolClassId): array
    {
        $labels = [
            1 => 'Seg',
            2 => 'Ter',
            3 => 'Qua',
            4 => 'Qui',
            5 => 'Sex',
        ];

        $start = Carbon::now()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $end = $start->copy()->addDays(4)->endOfDay();

        $query = StudentAttendance::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereBetween('attendance_date', [$start->toDateString(), $end->toDateString()]);

        if ($schoolClassId) {
            $query->where('school_class_id', $schoolClassId);
        }

        $presentStatuses = ['present', 'late', 'excused'];
        $byWeekday = [];

        foreach ($query->get(['attendance_date', 'status']) as $record) {
            $weekday = Carbon::parse($record->attendance_date)->isoWeekday();
            if ($weekday > 5) {
                continue;
            }
            if (! isset($byWeekday[$weekday])) {
                $byWeekday[$weekday] = ['present' => 0, 'total' => 0];
            }
            $byWeekday[$weekday]['total']++;
            if (in_array($record->status, $presentStatuses, true)) {
                $byWeekday[$weekday]['present']++;
            }
        }

        $days = [];
        $overallPresent = 0;
        $overallTotal = 0;

        foreach ($labels as $num => $label) {
            $bucket = $byWeekday[$num] ?? ['present' => 0, 'total' => 0];
            $total = $bucket['total'];
            $present = $bucket['present'];
            $presentPct = $total > 0 ? (int) round($present / $total * 100) : 0;
            $absentPct = $total > 0 ? 100 - $presentPct : 0;

            $days[] = [
                'day' => $label,
                'present' => $presentPct,
                'absent' => $absentPct,
                'records' => $total,
            ];

            $overallPresent += $present;
            $overallTotal += $total;
        }

        $highlightDay = Carbon::now()->isWeekend()
            ? null
            : ($labels[(int) Carbon::now()->isoWeekday()] ?? null);

        return [
            'period' => 'weekly',
            'from' => $start->toDateString(),
            'to' => $end->toDateString(),
            'present_percent' => $overallTotal > 0
                ? (int) round($overallPresent / $overallTotal * 100)
                : null,
            'highlight_day' => $highlightDay,
            'days' => $days,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCalendarMeta(int $tenantId): array
    {
        $start = Carbon::now()->startOfMonth();
        $end = Carbon::now()->endOfMonth();

        $days = CalendarEvent::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($q) use ($start, $end) {
                $q->whereBetween('starts_at', [$start, $end])
                    ->orWhereBetween('ends_at', [$start, $end]);
            })
            ->get(['starts_at'])
            ->map(fn ($e) => (int) Carbon::parse($e->starts_at)->day)
            ->unique()
            ->values()
            ->all();

        return [
            'year' => (int) $start->year,
            'month' => (int) $start->month,
            'event_days' => $days,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildUpcomingEvents(int $tenantId): array
    {
        $now = Carbon::now();

        return CalendarEvent::query()
            ->where('tenant_id', $tenantId)
            ->where('starts_at', '>=', $now->copy()->startOfDay())
            ->with(['schoolClass:id,name', 'course:id,name'])
            ->orderBy('starts_at')
            ->limit(6)
            ->get()
            ->map(function (CalendarEvent $event) {
                $starts = Carbon::parse($event->starts_at);
                $subtitle = $event->schoolClass?->name
                    ?? $event->course?->name
                    ?? 'Geral';

                return [
                    'id' => $event->id,
                    'time' => $starts->format('H:i'),
                    'title' => $event->title,
                    'subtitle' => $subtitle,
                    'starts_at' => $starts->toISOString(),
                ];
            })
            ->values()
            ->all();
    }

    private function monthOverMonthTrend($query, string $dateColumn): ?int
    {
        $currentStart = Carbon::now()->startOfMonth();
        $previousStart = $currentStart->copy()->subMonth();

        $current = (clone $query)
            ->where($dateColumn, '>=', $currentStart)
            ->count();

        $previous = (clone $query)
            ->where($dateColumn, '>=', $previousStart)
            ->where($dateColumn, '<', $currentStart)
            ->count();

        return $this->percentChange((float) $current, (float) $previous);
    }

    private function percentChange(float $current, float $previous): ?int
    {
        if ($previous <= 0) {
            return $current > 0 ? 100 : ($current === 0.0 ? 0 : null);
        }

        return (int) round((($current - $previous) / $previous) * 100);
    }

    /**
     * @return array<string, mixed>
     */
    private function loadSummaryRow(int $tenantId): array
    {
        if ($this->usesSummaryView()) {
            $summary = DashboardTenantSummary::query()
                ->where('tenant_id', $tenantId)
                ->first();

            if ($summary) {
                return $summary->toArray();
            }
        }

        return $this->computeSummaryRow($tenantId);
    }

    private function usesSummaryView(): bool
    {
        return Schema::getConnection()->getDriverName() !== 'sqlite';
    }

    /**
     * Fallback quando a view SQL não existe (ex.: testes em SQLite).
     *
     * @return array<string, mixed>
     */
    private function computeSummaryRow(int $tenantId): array
    {
        $monthStart = Carbon::now()->startOfMonth();
        $prevMonthStart = $monthStart->copy()->subMonth();
        $thirtyDaysAgo = Carbon::now()->subDays(30)->startOfDay();

        $studentsBase = Student::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at');

        $studentsActive = (clone $studentsBase)->where('status', 'active')->count();
        $studentsTotal = (clone $studentsBase)->count();

        $invoicesBase = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at');

        $openInvoices = (clone $invoicesBase)->whereIn('status', ['pending', 'overdue']);
        $overdueInvoices = (clone $invoicesBase)->where('status', 'overdue');

        $paidCurrent = (clone $invoicesBase)
            ->where('status', 'paid')
            ->where('paid_at', '>=', $monthStart);

        $paidPrevious = (clone $invoicesBase)
            ->where('status', 'paid')
            ->where('paid_at', '>=', $prevMonthStart)
            ->where('paid_at', '<', $monthStart);

        return [
            'tenant_id' => $tenantId,
            'students_total' => $studentsTotal,
            'students_active' => $studentsActive,
            'students_inactive' => $studentsTotal - $studentsActive,
            'students_minor' => (clone $studentsBase)->where('is_minor', true)->count(),
            'students_adult' => (clone $studentsBase)->where('is_minor', false)->count(),
            'teachers_count' => User::query()
                ->where('tenant_id', $tenantId)
                ->whereNull('deleted_at')
                ->where('status', 'active')
                ->where('role', 'professor')
                ->count(),
            'classes_active' => SchoolClass::query()
                ->where('tenant_id', $tenantId)
                ->whereNull('deleted_at')
                ->where('status', 'active')
                ->count(),
            'enrollments_active' => Enrollment::query()
                ->where('tenant_id', $tenantId)
                ->whereNull('deleted_at')
                ->where('status', 'active')
                ->count(),
            'exam_passes_30d' => ExamAttempt::query()
                ->where('tenant_id', $tenantId)
                ->whereNull('deleted_at')
                ->whereNotNull('finished_at')
                ->where('percentage', '>=', 70)
                ->where('finished_at', '>=', $thirtyDaysAgo)
                ->count(),
            'invoices_open_count' => (clone $openInvoices)->count(),
            'invoices_open_amount' => (float) ((clone $openInvoices)->sum('amount') ?? 0),
            'invoices_overdue_count' => (clone $overdueInvoices)->count(),
            'invoices_overdue_amount' => (float) ((clone $overdueInvoices)->sum('amount') ?? 0),
            'paid_current_month_amount' => (float) ((clone $paidCurrent)->sum('amount') ?? 0),
            'paid_current_month_count' => (clone $paidCurrent)->count(),
            'paid_previous_month_amount' => (float) ((clone $paidPrevious)->sum('amount') ?? 0),
        ];
    }
}
