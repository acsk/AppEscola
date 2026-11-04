<?php

namespace App\Services\Finance;

use App\Models\BankStatementSync;
use App\Models\Expense;
use App\Models\Invoice;
use App\Support\BusinessDate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Fluxo de caixa calculado pelo sistema (nunca apresentado como saldo do banco):
 * - Realizado: cobranças pagas (paid_at) e despesas pagas (paid_at), por dia no fuso da operação.
 * - Previsto: cobranças e despesas pelo vencimento (sem canceladas e sem rascunhos de despesa).
 * - Projeção: passado = realizado; futuro = só o que ainda está em aberto e vence a partir de hoje.
 *   Itens já vencidos e não pagos ficam fora da projeção e aparecem à parte.
 * - "Resultado acumulado" começa em zero no início do período (não há saldo inicial inventado).
 * - Saldo bancário só aparece quando a própria Cora o informou no extrato.
 * Cobranças: mesma base da Visão geral (sem as importadas pela sincronização Cora).
 */
class CashFlowService
{
    public const GRANULARITIES = ['daily', 'weekly', 'monthly'];

    private const MAX_BUCKETS = 120;

    private const OPEN_INVOICE = ['pending', 'overdue'];

    private const OPEN_EXPENSE = ['pending_approval', 'approved'];

    /**
     * @param  array{category_id?: int|null, cost_center_id?: int|null}  $filters  Só filtram as saídas
     * @return array<string, mixed>
     */
    public function build(int $tenantId, string $granularity, ?Carbon $from, ?Carbon $to, array $filters, string $environment): array
    {
        if (! in_array($granularity, self::GRANULARITIES, true)) {
            throw new InvalidArgumentException('Visão inválida.');
        }

        $today = BusinessDate::today();
        [$from, $to] = $this->period($granularity, $today, $from, $to);
        $buckets = $this->buckets($granularity, $from, $to);
        if (count($buckets) > self::MAX_BUCKETS) {
            throw new InvalidArgumentException('Período longo demais para esta visão. Use a visão semanal ou mensal.');
        }

        $realizedUntil = $to->lt($today) ? $to : $today;
        $add = function (array &$series, string $day, float $amount) {
            $series[$day] = ($series[$day] ?? 0) + $amount;
        };

        // Entradas.
        $realizedIn = [];
        $this->invoices($tenantId)
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$this->startUtc($from), $this->endUtc($realizedUntil)])
            ->get(['paid_at', 'amount'])
            ->each(function ($i) use ($add, &$realizedIn) {
                $add($realizedIn, $this->localDay($i->paid_at), (float) $i->amount);
            });

        $plannedIn = [];
        $openIn = [];
        $this->invoices($tenantId)
            ->where('status', '!=', 'cancelled')
            ->whereBetween('due_date', [$from->toDateString(), $to->toDateString()])
            ->get(['due_date', 'amount', 'status'])
            ->each(function ($i) use ($add, &$plannedIn, &$openIn, $today) {
                $day = $i->due_date->toDateString();
                $add($plannedIn, $day, (float) $i->amount);
                if (in_array($i->status, self::OPEN_INVOICE, true) && $i->due_date->gte($today)) {
                    $add($openIn, $day, (float) $i->amount);
                }
            });

        // Saídas.
        $realizedOut = [];
        $this->expenses($tenantId, $filters)
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$this->startUtc($from), $this->endUtc($realizedUntil)])
            ->get(['paid_at', 'amount'])
            ->each(function ($e) use ($add, &$realizedOut) {
                $add($realizedOut, $this->localDay($e->paid_at), (float) $e->amount);
            });

        $plannedOut = [];
        $openOut = [];
        $this->expenses($tenantId, $filters)
            ->whereNotIn('status', ['draft', 'cancelled'])
            ->whereBetween('due_date', [$from->toDateString(), $to->toDateString()])
            ->get(['due_date', 'amount', 'status'])
            ->each(function ($e) use ($add, &$plannedOut, &$openOut, $today) {
                $day = $e->due_date->toDateString();
                $add($plannedOut, $day, (float) $e->amount);
                if (in_array($e->status, self::OPEN_EXPENSE, true) && $e->due_date->gte($today)) {
                    $add($openOut, $day, (float) $e->amount);
                }
            });

        $sum = fn (array $series, Carbon $start, Carbon $end) => array_sum(array_filter(
            $series,
            fn ($day) => $day >= $start->toDateString() && $day <= $end->toDateString(),
            ARRAY_FILTER_USE_KEY,
        ));

        $cumulative = 0.0;
        $rows = [];
        $totals = ['planned_in' => 0.0, 'realized_in' => 0.0, 'planned_out' => 0.0, 'realized_out' => 0.0];

        foreach ($buckets as [$start, $end, $label]) {
            $state = $end->lt($today) ? 'past' : ($start->gt($today) ? 'future' : 'current');

            $pIn = $sum($plannedIn, $start, $end);
            $pOut = $sum($plannedOut, $start, $end);
            $rIn = $state === 'future' ? null : $sum($realizedIn, $start, $end);
            $rOut = $state === 'future' ? null : $sum($realizedOut, $start, $end);

            $flow = match ($state) {
                'past' => $rIn - $rOut,
                'future' => $sum($openIn, $start, $end) - $sum($openOut, $start, $end),
                // Semana/mês corrente: o que já aconteceu + o que ainda vence até o fim do intervalo.
                'current' => ($rIn - $rOut) + $sum($openIn, $today, $end) - $sum($openOut, $today, $end),
            };
            $cumulative += $flow;

            $totals['planned_in'] += $pIn;
            $totals['planned_out'] += $pOut;
            $totals['realized_in'] += $rIn ?? 0;
            $totals['realized_out'] += $rOut ?? 0;

            $rows[] = [
                'key' => $start->toDateString(),
                'label' => $label,
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
                'state' => $state,
                'planned_in' => self::money($pIn),
                'realized_in' => $rIn === null ? null : self::money($rIn),
                'planned_out' => self::money($pOut),
                'realized_out' => $rOut === null ? null : self::money($rOut),
                'flow' => self::money($flow),
                'cumulative' => self::money($cumulative),
            ];
        }

        return [
            'granularity' => $granularity,
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'today' => $today->toDateString(),
            'realized' => [
                'from' => $from->toDateString(),
                'to' => $realizedUntil->toDateString(),
                'inflow' => self::money($totals['realized_in']),
                'outflow' => self::money($totals['realized_out']),
                'net' => self::money($totals['realized_in'] - $totals['realized_out']),
            ],
            'projected_result' => self::money($cumulative),
            'totals' => array_map(fn ($v) => self::money($v), $totals),
            'outside_projection' => [
                'overdue_receivables' => $this->totals($this->invoices($tenantId)->whereIn('status', self::OPEN_INVOICE)->where('due_date', '<', $today->toDateString())),
                'overdue_payables' => $this->totals($this->expenses($tenantId, $filters)->whereIn('status', self::OPEN_EXPENSE)->where('due_date', '<', $today->toDateString())),
            ],
            'bank_balance' => $this->bankBalance($tenantId, $environment),
            'buckets' => $rows,
        ];
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function period(string $granularity, Carbon $today, ?Carbon $from, ?Carbon $to): array
    {
        if ($from === null || $to === null) {
            [$defaultFrom, $defaultTo] = match ($granularity) {
                'daily' => [$today->copy()->subDays(13), $today->copy()->addDays(14)],
                'weekly' => [$today->copy()->startOfWeek(Carbon::MONDAY)->subWeeks(3), $today->copy()->endOfMonth()->max($today->copy()->endOfWeek(Carbon::SUNDAY)->addWeeks(3))],
                'monthly' => [$today->copy()->startOfMonth()->subMonthsNoOverflow(5), $today->copy()->startOfMonth()->addMonthsNoOverflow(3)->endOfMonth()],
            };
            $from ??= $defaultFrom;
            $to ??= $defaultTo;
        }

        if ($from->gt($to)) {
            throw new InvalidArgumentException('A data inicial deve ser anterior à final.');
        }

        // Alinha às semanas (segunda a domingo) e aos meses inteiros.
        return match ($granularity) {
            'weekly' => [$from->copy()->startOfWeek(Carbon::MONDAY)->startOfDay(), $to->copy()->endOfWeek(Carbon::SUNDAY)->startOfDay()],
            'monthly' => [$from->copy()->startOfMonth(), $to->copy()->endOfMonth()->startOfDay()],
            default => [$from->copy()->startOfDay(), $to->copy()->startOfDay()],
        };
    }

    /** @return array<int, array{0: Carbon, 1: Carbon, 2: string}> */
    private function buckets(string $granularity, Carbon $from, Carbon $to): array
    {
        $buckets = [];
        $cursor = $from->copy();

        while ($cursor->lte($to) && count($buckets) <= self::MAX_BUCKETS) {
            $end = match ($granularity) {
                'daily' => $cursor->copy(),
                'weekly' => $cursor->copy()->addDays(6),
                'monthly' => $cursor->copy()->endOfMonth()->startOfDay(),
            };
            if ($end->gt($to)) {
                $end = $to->copy();
            }

            $label = match ($granularity) {
                'daily' => $cursor->format('d/m'),
                'weekly' => $cursor->month === $end->month
                    ? $cursor->format('d') . '–' . $end->format('d/m')
                    : $cursor->format('d/m') . '–' . $end->format('d/m'),
                'monthly' => $cursor->locale('pt_BR')->isoFormat('MMM/YY'),
            };

            $buckets[] = [$cursor->copy(), $end, $label];
            $cursor = $end->copy()->addDay();
        }

        return $buckets;
    }

    private function invoices(int $tenantId): Builder
    {
        return Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->excludingImportedFromCoraSync();
    }

    /** @param  array{category_id?: int|null, cost_center_id?: int|null}  $filters */
    private function expenses(int $tenantId, array $filters): Builder
    {
        return Expense::query()
            ->where('tenant_id', $tenantId)
            ->when(! empty($filters['category_id']), fn ($q) => $q->where('category_id', (int) $filters['category_id']))
            ->when(! empty($filters['cost_center_id']), fn ($q) => $q->where('cost_center_id', (int) $filters['cost_center_id']));
    }

    /** @return array{amount: string, as_of: string|null, synced_at: string|null}|null */
    private function bankBalance(int $tenantId, string $environment): ?array
    {
        $run = BankStatementSync::query()
            ->where('tenant_id', $tenantId)
            ->where('environment', $environment)
            ->where('status', 'success')
            ->whereNotNull('balance_end')
            ->orderByDesc('finished_at')
            ->orderByDesc('id')
            ->first();

        return $run ? [
            'amount' => self::money((float) $run->balance_end),
            'as_of' => $run->balance_end_at?->toISOString(),
            'synced_at' => $run->finished_at?->toISOString(),
        ] : null;
    }

    /** @return array{count: int, amount: string} */
    private function totals(Builder $query): array
    {
        return ['count' => (clone $query)->count(), 'amount' => self::money((float) (clone $query)->sum('amount'))];
    }

    private function localDay(Carbon $moment): string
    {
        return $moment->copy()->setTimezone(config('app.business_timezone', 'America/Sao_Paulo'))->toDateString();
    }

    private function startUtc(Carbon $day): Carbon
    {
        return Carbon::parse($day->toDateString(), config('app.business_timezone', 'America/Sao_Paulo'))->startOfDay()->setTimezone(config('app.timezone'));
    }

    private function endUtc(Carbon $day): Carbon
    {
        return Carbon::parse($day->toDateString(), config('app.business_timezone', 'America/Sao_Paulo'))->endOfDay()->setTimezone(config('app.timezone'));
    }

    private static function money(float $value): string
    {
        return number_format(round($value, 2), 2, '.', '');
    }
}
