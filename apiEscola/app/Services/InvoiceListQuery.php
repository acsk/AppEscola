<?php

namespace App\Services;

use App\Support\BusinessDate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Filtros da listagem de Contas a receber, compartilhados por GET /invoices e GET /invoices/situations.
 *
 * "Vencida" é calculada pela data (em aberto com vencimento anterior a hoje): o status `overdue`
 * não é gravado por nenhum processo.
 */
class InvoiceListQuery
{
    public const SITUATIONS = ['open', 'overdue', 'due_soon', 'paid', 'cancelled'];

    public const DUE_SOON_DAYS = 7;

    private const OPEN_STATUSES = ['pending', 'overdue'];

    /**
     * Aplica todos os filtros da tela, exceto a situação.
     */
    public function applyFilters(Builder $query, Request $request): Builder
    {
        return $query
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('invoices.student_id', $v))
            ->when($request->query('enrollment_id'), fn ($q, $v) => $q->where('invoices.enrollment_id', $v))
            ->when($request->query('payment_method'), fn ($q, $v) => $q->where('invoices.payment_method', $v))
            ->when($request->query('due_date_from'), fn ($q, $v) => $q->whereDate('invoices.due_date', '>=', $v))
            ->when($request->query('due_date_to'), fn ($q, $v) => $q->whereDate('invoices.due_date', '<=', $v))
            ->when($request->query('paid_at_from'), fn ($q, $v) => $q->whereDate('invoices.paid_at', '>=', $v))
            ->when($request->query('paid_at_to'), fn ($q, $v) => $q->whereDate('invoices.paid_at', '<=', $v))
            ->when($request->query('school_class_id'), fn ($q, $v) => $q->whereHas(
                'enrollment',
                fn ($e) => $e->where('school_class_id', (int) $v)
            ))
            ->when($request->query('course_id'), fn ($q, $v) => $q->whereHas('enrollment', function ($e) use ($v) {
                $e->where(function ($inner) use ($v) {
                    $inner->whereHas('schoolClass', fn ($c) => $c->where('course_id', (int) $v))
                        ->orWhere(function ($noClass) use ($v) {
                            $noClass->whereNull('school_class_id')
                                ->whereHas('coursePlan', fn ($p) => $p->where('course_id', (int) $v));
                        });
                });
            }))
            ->when($request->query('search'), fn ($q, $v) => $this->applySearch($q, trim((string) $v)));
    }

    public function applySituation(Builder $query, string $situation, ?Carbon $today = null): Builder
    {
        $today = ($today ?? BusinessDate::today())->toDateString();

        return match ($situation) {
            'open' => $query->whereIn('invoices.status', self::OPEN_STATUSES),
            'overdue' => $query->whereIn('invoices.status', self::OPEN_STATUSES)
                ->whereDate('invoices.due_date', '<', $today),
            'due_soon' => $query->whereIn('invoices.status', self::OPEN_STATUSES)
                ->whereDate('invoices.due_date', '>=', $today)
                ->whereDate('invoices.due_date', '<=', Carbon::parse($today)->addDays(self::DUE_SOON_DAYS)->toDateString()),
            'paid' => $query->where('invoices.status', 'paid'),
            'cancelled' => $query->where('invoices.status', 'cancelled'),
            default => $query,
        };
    }

    /**
     * Contagem e soma por situação, sobre uma consulta já filtrada (tenant + filtros da tela).
     *
     * @return array<string, array{count: int, amount: string}>
     */
    public function situationTotals(Builder $filtered, ?Carbon $today = null): array
    {
        $totals = [];

        foreach (self::SITUATIONS as $situation) {
            $row = $this->applySituation(clone $filtered, $situation, $today)
                ->toBase()
                ->selectRaw('COUNT(*) as aggregate_count, COALESCE(SUM(invoices.amount), 0) as total_amount')
                ->first();

            $totals[$situation] = [
                'count' => (int) ($row->aggregate_count ?? 0),
                'amount' => number_format((float) ($row->total_amount ?? 0), 2, '.', ''),
            ];
        }

        return $totals;
    }

    /**
     * Aluno, responsável, matrícula, nº da cobrança ("581" ou "#581") ou descrição.
     */
    private function applySearch(Builder $query, string $term): Builder
    {
        if ($term === '') {
            return $query;
        }

        $like = '%' . $term . '%';
        $invoiceId = preg_match('/^#?(\d+)$/', $term, $m) ? (int) $m[1] : null;

        return $query->where(function ($inner) use ($like, $term, $invoiceId) {
            $inner->where('invoices.description', 'like', $like)
                ->orWhereHas('student', fn ($s) => $s->where('name', 'like', $like)
                    ->orWhere('enrollment_number', 'like', $term . '%'))
                ->orWhereHas('guardian', fn ($g) => $g->where('name', 'like', $like));

            if ($invoiceId !== null) {
                $inner->orWhere('invoices.id', $invoiceId);
            }
        });
    }
}
