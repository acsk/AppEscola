<?php

namespace App\Services;

use App\Models\Invoice;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class FinanceReportService
{
    private const STATUSES = ['paid', 'pending', 'overdue', 'cancelled'];

    private const MONTHS = [
        1 => 'jan',
        2 => 'fev',
        3 => 'mar',
        4 => 'abr',
        5 => 'mai',
        6 => 'jun',
        7 => 'jul',
        8 => 'ago',
        9 => 'set',
        10 => 'out',
        11 => 'nov',
        12 => 'dez',
    ];

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function build(int $tenantId, array $filters): array
    {
        $basis = $this->dateBasis($filters['date_basis'] ?? null);
        $from = $this->dateOrNull($filters['date_from'] ?? null);
        $to = $this->dateOrNull($filters['date_to'] ?? null);
        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        $filtered = $this->filteredQuery($tenantId, $filters, $basis, $from, $to);

        $byStatus = $this->byStatus($filtered);
        $count = 0;
        $amount = 0.0;
        foreach ($byStatus as $row) {
            $count += $row['count'];
            $amount += (float) $row['amount'];
        }

        $paginator = (clone $filtered)
            ->with([
                'student:id,name',
                'enrollment:id,school_class_id',
                'enrollment.schoolClass:id,name',
            ])
            ->orderByDesc('invoices.'.$basis)
            ->orderByDesc('invoices.id')
            ->paginate($perPage);

        $items = collect($paginator->items())->map(function (Invoice $invoice) {
            return [
                'id' => $invoice->id,
                'description' => $invoice->description,
                'amount' => $this->money($invoice->amount),
                'status' => $invoice->status,
                'type' => $invoice->type,
                'payment_method' => $invoice->payment_method,
                'due_date' => $invoice->due_date?->toDateString(),
                'paid_at' => $invoice->paid_at?->toIso8601String(),
                'student_name' => $invoice->student?->name,
                'school_class_name' => $invoice->enrollment?->schoolClass?->name,
            ];
        })->values()->all();

        return [
            'filters' => [
                'date_basis' => $basis,
                'date_from' => $from,
                'date_to' => $to,
                'status' => $filters['status'] ?? null,
                'payment_method' => $filters['payment_method'] ?? null,
                'type' => $filters['type'] ?? null,
                'school_class_id' => isset($filters['school_class_id']) ? (int) $filters['school_class_id'] : null,
                'course_id' => isset($filters['course_id']) ? (int) $filters['course_id'] : null,
                'search' => isset($filters['search']) ? trim((string) $filters['search']) : null,
            ],
            'totals' => [
                'count' => $count,
                'amount' => $this->money($amount),
            ],
            'by_status' => $byStatus,
            'by_month' => $this->byMonth($filtered, $basis, $from, $to),
            'by_payment_method' => $this->groupedAmounts($filtered, 'invoices.payment_method'),
            'by_type' => $this->groupedAmounts($filtered, 'invoices.type'),
            'by_class' => $this->byClass($filtered),
            'items' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function filteredQuery(int $tenantId, array $filters, string $basis, ?string $from, ?string $to): Builder
    {
        $query = Invoice::query()
            ->where('invoices.tenant_id', $tenantId)
            ->whereNull('invoices.deleted_at')
            ->excludingImportedFromCoraSync();

        if ($from) {
            $query->whereDate('invoices.'.$basis, '>=', $from);
        }
        if ($to) {
            $query->whereDate('invoices.'.$basis, '<=', $to);
        }

        $query
            ->when($filters['status'] ?? null, fn (Builder $q, $status) => $q->where('invoices.status', $status))
            ->when($filters['payment_method'] ?? null, fn (Builder $q, $method) => $q->where('invoices.payment_method', $method))
            ->when($filters['type'] ?? null, fn (Builder $q, $type) => $q->where('invoices.type', $type))
            ->when($filters['school_class_id'] ?? null, function (Builder $q, $classId) {
                $q->whereHas('enrollment', fn (Builder $enrollment) => $enrollment->forSchoolClass((int) $classId));
            })
            ->when($filters['course_id'] ?? null, function (Builder $q, $courseId) {
                $courseId = (int) $courseId;
                $q->whereHas('enrollment', function (Builder $enrollment) use ($courseId) {
                    $enrollment->where(function (Builder $inner) use ($courseId) {
                        $inner->whereHas('schoolClass', fn (Builder $sc) => $sc->where('course_id', $courseId))
                            ->orWhereHas('schoolClasses', fn (Builder $sc) => $sc->where('school_classes.course_id', $courseId))
                            ->orWhereHas('coursePlan', fn (Builder $plan) => $plan->where('course_id', $courseId));
                    });
                });
            })
            ->when($filters['search'] ?? null, function (Builder $q, $search) {
                $term = '%'.trim((string) $search).'%';
                $q->where(function (Builder $inner) use ($term) {
                    $inner->where('invoices.description', 'like', $term)
                        ->orWhereHas('student', fn (Builder $student) => $student->where('name', 'like', $term));
                });
            });

        return $query;
    }

    /**
     * @return array<int, array{key: string, count: int, amount: string}>
     */
    private function byStatus(Builder $filtered): array
    {
        $rows = $this->aggregate($filtered)
            ->selectRaw('invoices.status as status, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount')
            ->groupBy('invoices.status')
            ->get()
            ->keyBy('status');

        return array_map(function (string $status) use ($rows) {
            $row = $rows->get($status);

            return [
                'key' => $status,
                'count' => (int) ($row->aggregate_count ?? 0),
                'amount' => $this->money($row->total_amount ?? 0),
            ];
        }, self::STATUSES);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function byMonth(Builder $filtered, string $basis, ?string $from, ?string $to): array
    {
        $expr = $this->yearMonthExpression('invoices.'.$basis);

        $grouped = $this->aggregate($filtered)
            ->selectRaw("{$expr} as period, invoices.status as status, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount")
            ->groupBy(DB::raw($expr), 'invoices.status')
            ->get();

        $buckets = [];
        foreach ($grouped as $row) {
            $period = (string) $row->period;
            if ($period === '') {
                continue;
            }
            if (! isset($buckets[$period])) {
                $buckets[$period] = [
                    'count' => 0,
                    'amount' => 0.0,
                    'paid' => 0.0,
                    'open' => 0.0,
                    'overdue' => 0.0,
                ];
            }
            $value = (float) $row->total_amount;
            $buckets[$period]['count'] += (int) $row->aggregate_count;
            $buckets[$period]['amount'] += $value;
            if ($row->status === 'paid') {
                $buckets[$period]['paid'] += $value;
            } elseif ($row->status === 'pending') {
                $buckets[$period]['open'] += $value;
            } elseif ($row->status === 'overdue') {
                $buckets[$period]['overdue'] += $value;
            }
        }

        $periods = $this->monthKeys($from, $to, array_keys($buckets));
        $points = [];
        foreach ($periods as $period) {
            $bucket = $buckets[$period] ?? [
                'count' => 0,
                'amount' => 0.0,
                'paid' => 0.0,
                'open' => 0.0,
                'overdue' => 0.0,
            ];
            $points[] = [
                'period' => $period,
                'label' => $this->labelForPeriod($period),
                'count' => $bucket['count'],
                'amount' => $this->money($bucket['amount']),
                'paid_amount' => $this->money($bucket['paid']),
                'open_amount' => $this->money($bucket['open']),
                'overdue_amount' => $this->money($bucket['overdue']),
            ];
        }

        return $points;
    }

    /**
     * @return array<int, array{key: string|null, count: int, amount: string}>
     */
    private function groupedAmounts(Builder $filtered, string $column): array
    {
        return $this->aggregate($filtered)
            ->selectRaw("{$column} as bucket_key, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount")
            ->groupBy($column)
            ->orderByDesc('total_amount')
            ->get()
            ->map(fn ($row) => [
                'key' => $row->bucket_key !== null && $row->bucket_key !== '' ? (string) $row->bucket_key : null,
                'count' => (int) $row->aggregate_count,
                'amount' => $this->money($row->total_amount),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{school_class_id: int|null, name: string, count: int, amount: string}>
     */
    private function byClass(Builder $filtered): array
    {
        return $this->aggregate($filtered)
            ->leftJoin('enrollments', 'enrollments.id', '=', 'invoices.enrollment_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'enrollments.school_class_id')
            ->selectRaw('enrollments.school_class_id as school_class_id, school_classes.name as class_name, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount')
            ->groupBy('enrollments.school_class_id', 'school_classes.name')
            ->orderByDesc('total_amount')
            ->get()
            ->map(function ($row) {
                $id = $row->school_class_id !== null ? (int) $row->school_class_id : null;
                $name = trim((string) ($row->class_name ?? ''));

                return [
                    'school_class_id' => $id,
                    'name' => $name !== '' ? $name : ($id ? 'Turma #'.$id : 'Sem turma'),
                    'count' => (int) $row->aggregate_count,
                    'amount' => $this->money($row->total_amount),
                ];
            })
            ->values()
            ->all();
    }

    private function aggregate(Builder $filtered): Builder
    {
        $clone = clone $filtered;
        $clone->getQuery()->columns = null;
        $clone->getQuery()->orders = null;

        return $clone;
    }

    private function dateBasis(mixed $value): string
    {
        return in_array($value, ['due_date', 'paid_at', 'created_at'], true) ? $value : 'due_date';
    }

    private function dateOrNull(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return Carbon::parse($value)->toDateString();
    }

    /**
     * @param  array<int, string>  $existing
     * @return array<int, string>
     */
    private function monthKeys(?string $from, ?string $to, array $existing): array
    {
        if ($from && $to) {
            $cursor = Carbon::parse($from)->startOfMonth();
            $end = Carbon::parse($to)->startOfMonth();
            $keys = [];
            while ($cursor->lte($end)) {
                $keys[] = $cursor->format('Y-m');
                $cursor->addMonth();
            }

            return $keys;
        }

        $keys = array_values(array_filter($existing, fn ($key) => $key !== ''));
        sort($keys);

        return $keys;
    }

    private function labelForPeriod(string $period): string
    {
        $date = Carbon::createFromFormat('Y-m', $period);
        if (! $date) {
            return $period;
        }

        $month = self::MONTHS[(int) $date->month] ?? $date->format('m');

        return $month.'/'.$date->format('y');
    }

    private function yearMonthExpression(string $column): string
    {
        $driver = DB::connection()->getDriverName();

        return match ($driver) {
            'sqlite' => "strftime('%Y-%m', {$column})",
            'pgsql' => "to_char({$column}, 'YYYY-MM')",
            default => "DATE_FORMAT({$column}, '%Y-%m')",
        };
    }

    private function money(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }
}
