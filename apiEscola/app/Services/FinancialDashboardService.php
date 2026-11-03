<?php

namespace App\Services;

use App\Models\Invoice;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Indicadores da Visão geral financeira.
 *
 * Mesmo escopo do relatório financeiro: tenant, sem excluídas e sem cobranças
 * importadas pelo sync Cora. "Vencida" é calculada por data (pending/overdue com
 * vencimento anterior a hoje), pois o status overdue não é gravado pelo sistema.
 */
class FinancialDashboardService
{
    /** Atraso mínimo (dias) para uma cobrança entrar na taxa de inadimplência. */
    public const DELINQUENCY_GRACE_DAYS = 5;

    private const OPEN_STATUSES = ['pending', 'overdue'];

    private const MONTHLY_SERIES_LENGTH = 6;

    private const MONTHS = [1 => 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    private const AGING_BUCKETS = [
        ['key' => '1_15', 'label' => '1–15 dias', 'min' => 1, 'max' => 15],
        ['key' => '16_30', 'label' => '16–30 dias', 'min' => 16, 'max' => 30],
        ['key' => '31_60', 'label' => '31–60 dias', 'min' => 31, 'max' => 60],
        ['key' => '60_plus', 'label' => 'Mais de 60 dias', 'min' => 61, 'max' => null],
    ];

    /**
     * @return array<string, mixed>
     */
    public function build(int $tenantId, Carbon $from, Carbon $to, ?Carbon $today = null): array
    {
        $today = ($today ?? Carbon::today())->copy()->startOfDay();
        $from = $from->copy()->startOfDay();
        $to = $to->copy()->startOfDay();

        [$previousFrom, $previousTo] = $this->previousPeriod($from, $to);

        $received = $this->received($tenantId, $from, $to);
        $previousReceived = $this->received($tenantId, $previousFrom, $previousTo);
        $delinquency = $this->delinquency($tenantId, $from, $to, $today);
        $previousDelinquency = $this->delinquency($tenantId, $previousFrom, $previousTo, $today);

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'previous_from' => $previousFrom->toDateString(),
                'previous_to' => $previousTo->toDateString(),
                'today' => $today->toDateString(),
            ],
            'kpis' => [
                'receivable' => $this->totals($this->open($tenantId)),
                'received' => $received + [
                    'previous_amount' => $previousReceived['amount'],
                    'delta_pct' => $this->deltaPct($received['amount'], $previousReceived['amount']),
                ],
                'overdue' => $this->totals($this->open($tenantId)->whereDate('due_date', '<', $today)),
                'forecast_30d' => $this->totals(
                    $this->open($tenantId)
                        ->whereDate('due_date', '>=', $today)
                        ->whereDate('due_date', '<=', $today->copy()->addDays(30))
                ),
                'average_ticket' => $this->averageTicket($tenantId, $from, $to, $received['amount'])
                    + ['previous_amount' => $this->averageTicket($tenantId, $previousFrom, $previousTo, $previousReceived['amount'])['amount']],
                'delinquency' => $delinquency + ['previous_rate' => $previousDelinquency['rate']],
                'pending' => [
                    'count' => $this->open($tenantId)->count(),
                    'due_next_7_days' => $this->open($tenantId)
                        ->whereDate('due_date', '>=', $today)
                        ->whereDate('due_date', '<=', $today->copy()->addDays(7))
                        ->count(),
                ],
                // Conciliação bancária chega na Fase 2; não exibir número inventado.
                'reconciled' => ['available' => false, 'count' => null, 'total' => null],
            ],
            'charts' => [
                'monthly' => $this->monthly($tenantId, $to),
                'by_payment_method' => $this->byPaymentMethod($tenantId, $from, $to),
                'aging' => $this->aging($tenantId, $today),
                'by_course' => $this->byCourse($tenantId, $from, $to),
            ],
            'definitions' => [
                'delinquency_grace_days' => self::DELINQUENCY_GRACE_DAYS,
                'scope' => 'Cobranças do tenant, sem excluídas e sem as importadas pelo sync Cora.',
            ],
        ];
    }

    /**
     * Meses completos comparam com os mesmos meses anteriores (out → set);
     * demais períodos, com o mesmo número de dias imediatamente antes.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function previousPeriod(Carbon $from, Carbon $to): array
    {
        $previousTo = $from->copy()->subDay();

        if ($from->isSameDay($from->copy()->startOfMonth()) && $to->isSameDay($to->copy()->endOfMonth())) {
            $months = (int) $from->diffInMonths($to->copy()->addDay());

            return [$from->copy()->subMonthsNoOverflow($months), $previousTo];
        }

        $days = (int) $from->diffInDays($to) + 1;

        return [$previousTo->copy()->subDays($days - 1), $previousTo];
    }

    private function base(int $tenantId): Builder
    {
        return Invoice::query()
            ->where('invoices.tenant_id', $tenantId)
            ->whereNull('invoices.deleted_at')
            ->excludingImportedFromCoraSync();
    }

    private function open(int $tenantId): Builder
    {
        return $this->base($tenantId)->whereIn('invoices.status', self::OPEN_STATUSES);
    }

    private function paidBetween(int $tenantId, Carbon $from, Carbon $to): Builder
    {
        return $this->base($tenantId)
            ->where('invoices.status', 'paid')
            ->whereDate('invoices.paid_at', '>=', $from)
            ->whereDate('invoices.paid_at', '<=', $to);
    }

    /**
     * @return array{count: int, amount: string}
     */
    private function totals(Builder $query): array
    {
        $row = $query->selectRaw('COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount')->first();

        return [
            'count' => (int) ($row->aggregate_count ?? 0),
            'amount' => $this->money($row->total_amount ?? 0),
        ];
    }

    /**
     * @return array{count: int, amount: string}
     */
    private function received(int $tenantId, Carbon $from, Carbon $to): array
    {
        return $this->totals($this->paidBetween($tenantId, $from, $to));
    }

    /**
     * Recebido no período ÷ alunos distintos com ao menos um pagamento.
     *
     * @return array{amount: string|null, payers: int}
     */
    private function averageTicket(int $tenantId, Carbon $from, Carbon $to, string $receivedAmount): array
    {
        $payers = (int) $this->paidBetween($tenantId, $from, $to)
            ->whereNotNull('invoices.student_id')
            ->distinct()
            ->count('invoices.student_id');

        return [
            'amount' => $payers > 0 ? $this->money((float) $receivedAmount / $payers) : null,
            'payers' => $payers,
        ];
    }

    /**
     * Em aberto ÷ total com vencimento no período, apenas para o que venceu
     * há mais de DELINQUENCY_GRACE_DAYS dias. Canceladas ficam fora da base.
     *
     * @return array{rate: string|null, overdue_amount: string, due_amount: string, grace_days: int}
     */
    private function delinquency(int $tenantId, Carbon $from, Carbon $to, Carbon $today): array
    {
        $cutoff = $today->copy()->subDays(self::DELINQUENCY_GRACE_DAYS + 1);
        $end = $to->lt($cutoff) ? $to : $cutoff;

        $due = $this->base($tenantId)
            ->where('invoices.status', '!=', 'cancelled')
            ->whereDate('invoices.due_date', '>=', $from)
            ->whereDate('invoices.due_date', '<=', $end);

        $dueAmount = $end->lt($from) ? 0.0 : (float) (clone $due)->sum('invoices.amount');
        $overdueAmount = $end->lt($from) ? 0.0 : (float) (clone $due)->whereIn('invoices.status', self::OPEN_STATUSES)->sum('invoices.amount');

        return [
            'rate' => $dueAmount > 0 ? number_format($overdueAmount / $dueAmount * 100, 1, '.', '') : null,
            'overdue_amount' => $this->money($overdueAmount),
            'due_amount' => $this->money($dueAmount),
            'grace_days' => self::DELINQUENCY_GRACE_DAYS,
        ];
    }

    /**
     * Previsto (por vencimento, sem canceladas) × realizado (por data de pagamento).
     *
     * @return array<int, array{period: string, label: string, expected_amount: string, received_amount: string}>
     */
    private function monthly(int $tenantId, Carbon $to): array
    {
        $end = $to->copy()->endOfMonth();
        $start = $to->copy()->startOfMonth()->subMonths(self::MONTHLY_SERIES_LENGTH - 1);

        $expected = $this->base($tenantId)
            ->where('invoices.status', '!=', 'cancelled')
            ->whereDate('invoices.due_date', '>=', $start)
            ->whereDate('invoices.due_date', '<=', $end)
            ->selectRaw($this->yearMonthExpression('invoices.due_date').' as period, COALESCE(SUM(invoices.amount), 0) as total_amount')
            ->groupBy('period')
            ->pluck('total_amount', 'period');

        $received = $this->paidBetween($tenantId, $start, $end)
            ->selectRaw($this->yearMonthExpression('invoices.paid_at').' as period, COALESCE(SUM(invoices.amount), 0) as total_amount')
            ->groupBy('period')
            ->pluck('total_amount', 'period');

        $series = [];
        for ($cursor = $start->copy(); $cursor->lte($end); $cursor->addMonth()) {
            $key = $cursor->format('Y-m');
            $series[] = [
                'period' => $key,
                'label' => self::MONTHS[(int) $cursor->month].'/'.$cursor->format('y'),
                'expected_amount' => $this->money($expected[$key] ?? 0),
                'received_amount' => $this->money($received[$key] ?? 0),
            ];
        }

        return $series;
    }

    /**
     * @return array<int, array{key: string, count: int, amount: string}>
     */
    private function byPaymentMethod(int $tenantId, Carbon $from, Carbon $to): array
    {
        return $this->paidBetween($tenantId, $from, $to)
            ->selectRaw("COALESCE(invoices.payment_method, 'unknown') as method_key, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount")
            ->groupBy('method_key')
            ->orderByDesc('total_amount')
            ->get()
            ->map(fn ($row) => [
                'key' => (string) $row->method_key,
                'count' => (int) $row->aggregate_count,
                'amount' => $this->money($row->total_amount),
            ])
            ->values()
            ->all();
    }

    /**
     * Saldo em aberto já vencido, por faixa de atraso na data de hoje.
     *
     * @return array<int, array{key: string, label: string, count: int, amount: string}>
     */
    private function aging(int $tenantId, Carbon $today): array
    {
        return array_map(function (array $bucket) use ($tenantId, $today) {
            $query = $this->open($tenantId)
                ->whereDate('invoices.due_date', '<=', $today->copy()->subDays($bucket['min']));

            if ($bucket['max'] !== null) {
                $query->whereDate('invoices.due_date', '>=', $today->copy()->subDays($bucket['max']));
            }

            return ['key' => $bucket['key'], 'label' => $bucket['label']] + $this->totals($query);
        }, self::AGING_BUCKETS);
    }

    /**
     * Recebido no período por curso (turma da matrícula ou, na falta, plano).
     *
     * @return array<int, array{course_id: int|null, name: string, count: int, amount: string}>
     */
    private function byCourse(int $tenantId, Carbon $from, Carbon $to): array
    {
        return $this->paidBetween($tenantId, $from, $to)
            ->leftJoin('enrollments', 'enrollments.id', '=', 'invoices.enrollment_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'enrollments.school_class_id')
            ->leftJoin('course_plans', 'course_plans.id', '=', 'enrollments.course_plan_id')
            ->leftJoin('courses', 'courses.id', '=', DB::raw('COALESCE(school_classes.course_id, course_plans.course_id)'))
            ->selectRaw('courses.id as course_id, courses.name as course_name, COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount')
            ->groupBy('courses.id', 'courses.name')
            ->orderByDesc('total_amount')
            ->get()
            ->map(function ($row) {
                $id = $row->course_id !== null ? (int) $row->course_id : null;
                $name = trim((string) ($row->course_name ?? ''));

                return [
                    'course_id' => $id,
                    'name' => $name !== '' ? $name : 'Sem curso',
                    'count' => (int) $row->aggregate_count,
                    'amount' => $this->money($row->total_amount),
                ];
            })
            ->values()
            ->all();
    }

    private function deltaPct(string $current, string $previous): ?string
    {
        $previous = (float) $previous;

        if ($previous <= 0) {
            return null;
        }

        return number_format(((float) $current - $previous) / $previous * 100, 1, '.', '');
    }

    private function yearMonthExpression(string $column): string
    {
        return match (DB::connection()->getDriverName()) {
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
