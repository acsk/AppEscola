<?php

namespace App\Services\Reconciliation;

use App\Models\BankStatementEntry;
use App\Models\BankStatementSync;
use App\Models\Invoice;
use App\Models\TenantCoraCredential;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/** Leitura da conciliação bancária: lista, resumo do período e cobranças candidatas. */
class BankReconciliationQuery
{
    /** Filtro "tipo" da tela → transaction_type da Cora. */
    public const TYPES = [
        'pix' => ['PIX'],
        'transfer' => ['TRANSFER'],
        'payment' => ['PAYMENT', 'BANK_DOMICILE'],
        'fee' => ['FEE'],
        'card' => ['CARD'],
    ];

    /** Janela de data mostrada como critério (não decide nada sozinha). */
    private const DATE_WINDOW_DAYS = 3;

    /** Palavras que não contam como semelhança de nome. */
    private const NAME_STOPWORDS = ['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'ME', 'EIRELI', 'SA', 'PIX', 'TRANSF'];

    /**
     * @param  array<string, mixed>  $filters
     */
    public function entries(int $tenantId, string $environment, array $filters): LengthAwarePaginator
    {
        $query = $this->base($tenantId, $environment, $filters)
            ->with(['invoice:id,tenant_id,student_id,description,amount,due_date,status,paid_at', 'invoice.student:id,name', 'reviewer:id,name'])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        return $query->paginate(min(max((int) ($filters['per_page'] ?? 25), 1), 100));
    }

    /**
     * Cartões e contadores das abas para o período e os filtros (sem o filtro de situação).
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function summary(int $tenantId, string $environment, array $filters): array
    {
        $rows = $this->base($tenantId, $environment, $filters)
            ->selectRaw('direction, status, COUNT(*) as total, COALESCE(SUM(amount), 0) as amount')
            ->groupBy('direction', 'status')
            ->get();

        $sum = fn (callable $filter, string $field) => $rows->filter($filter)->sum(fn ($r) => (float) $r->{$field});

        $considered = fn ($r) => $r->status !== 'ignored';
        $totalAmount = $sum($considered, 'amount');
        $reconciledAmount = $sum(fn ($r) => $r->status === 'reconciled', 'amount');

        $lastSync = BankStatementSync::query()
            ->where('tenant_id', $tenantId)
            ->where('environment', $environment)
            ->latest('id')
            ->first();

        return [
            'environment' => $environment,
            'credentials_active' => TenantCoraCredential::query()
                ->where('tenant_id', $tenantId)
                ->where('environment', $environment)
                ->where('active', true)
                ->exists(),
            'credits' => ['count' => (int) $sum(fn ($r) => $r->direction === 'credit', 'total'), 'amount' => self::decimal($sum(fn ($r) => $r->direction === 'credit', 'amount'))],
            'debits' => ['count' => (int) $sum(fn ($r) => $r->direction === 'debit', 'total'), 'amount' => self::decimal($sum(fn ($r) => $r->direction === 'debit', 'amount'))],
            'reconciled' => [
                'amount' => self::decimal($reconciledAmount),
                'of_amount' => self::decimal($totalAmount),
                'percent' => $totalAmount > 0 ? round($reconciledAmount / $totalAmount * 100, 1) : null,
            ],
            'pending' => ['count' => (int) $sum(fn ($r) => $r->status === 'pending', 'total'), 'amount' => self::decimal($sum(fn ($r) => $r->status === 'pending', 'amount'))],
            'counts' => collect(BankReconciliationService::STATUSES)
                ->mapWithKeys(fn ($status) => [$status => (int) $sum(fn ($r) => $r->status === $status, 'total')])
                ->all(),
            'last_sync' => $lastSync ? [
                'status' => $lastSync->status,
                'period_start' => $lastSync->period_start?->toDateString(),
                'period_end' => $lastSync->period_end?->toDateString(),
                'created' => $lastSync->created,
                'auto_reconciled' => $lastSync->auto_reconciled,
                'error' => $lastSync->error,
                'started_at' => $lastSync->started_at?->toISOString(),
                'finished_at' => $lastSync->finished_at?->toISOString(),
            ] : null,
        ];
    }

    /**
     * Cobranças que podem corresponder a uma entrada, com os critérios avaliados.
     * Sem busca: as citadas pelo ID Cora e as em aberto de mesmo valor. Com busca: por #id, aluno ou descrição.
     *
     * @return array<int, array<string, mixed>>
     */
    public function candidates(BankStatementEntry $entry, ?string $search): array
    {
        $cited = BankReconciliationService::chargeIdsIn($entry);

        $base = fn () => Invoice::query()
            ->where('tenant_id', $entry->tenant_id)
            ->whereIn('status', ['pending', 'overdue', 'paid'])
            ->whereNotExists(fn ($q) => $q->from('bank_statement_entries')
                ->whereColumn('bank_statement_entries.invoice_id', 'invoices.id')
                ->where('bank_statement_entries.id', '!=', $entry->id))
            ->with(['student:id,name', 'guardian:id,name']);

        $results = collect();

        if ($cited !== []) {
            $results = $results->merge($base()->whereIn('cora_charge_id', $cited)->get());
        }

        $search = trim((string) $search);
        if ($search !== '') {
            $results = $results->merge($base()
                ->where(function (Builder $q) use ($search) {
                    if (preg_match('/^#?(\d+)$/', $search, $m)) {
                        $q->orWhere('id', (int) $m[1]);
                    }
                    $q->orWhere('description', 'like', '%' . $search . '%')
                        ->orWhereHas('student', fn ($s) => $s->where('name', 'like', '%' . $search . '%'));
                })
                ->orderByDesc('due_date')
                ->limit(20)
                ->get());
        } else {
            $results = $results->merge($base()
                ->whereIn('status', ['pending', 'overdue'])
                ->where('amount', $entry->amount)
                ->orderBy('due_date')
                ->limit(10)
                ->get());
        }

        return $results->unique('id')->values()
            ->map(fn (Invoice $invoice) => $this->presentCandidate($entry, $invoice, $cited))
            ->all();
    }

    /** @return array<string, mixed> */
    public static function present(BankStatementEntry $entry): array
    {
        $invoice = $entry->invoice;

        return [
            'id' => $entry->id,
            'external_id' => $entry->external_id,
            'transaction_id' => $entry->transaction_id,
            'source' => $entry->source,
            'environment' => $entry->environment,
            'direction' => $entry->direction,
            'transaction_type' => $entry->transaction_type,
            'amount' => (string) $entry->amount,
            'occurred_at' => $entry->occurred_at?->toISOString(),
            'description' => $entry->description,
            'counterparty_name' => $entry->counterparty_name,
            'status' => $entry->status,
            'match_type' => $entry->match_type,
            'divergence' => $entry->divergence,
            'justification' => $entry->justification,
            'cited_charge_ids' => BankReconciliationService::chargeIdsIn($entry),
            'reviewed_at' => $entry->reviewed_at?->toISOString(),
            'reviewed_by' => $entry->reviewer ? ['id' => $entry->reviewer->id, 'name' => $entry->reviewer->name] : null,
            'invoice' => $invoice ? [
                'id' => $invoice->id,
                'description' => $invoice->description,
                'amount' => (string) $invoice->amount,
                'due_date' => $invoice->due_date?->toDateString(),
                'status' => $invoice->status,
                'paid_at' => $invoice->paid_at?->toISOString(),
                'student' => $invoice->student ? ['id' => $invoice->student->id, 'name' => $invoice->student->name] : null,
            ] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function base(int $tenantId, string $environment, array $filters): Builder
    {
        $query = BankStatementEntry::query()
            ->where('tenant_id', $tenantId)
            ->where('environment', $environment);

        // As datas do filtro são dias no fuso da operação; occurred_at está no fuso da aplicação.
        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        if (! empty($filters['date_from'])) {
            $query->where('occurred_at', '>=', Carbon::parse($filters['date_from'], $tz)->startOfDay()->setTimezone(config('app.timezone')));
        }
        if (! empty($filters['date_to'])) {
            $query->where('occurred_at', '<=', Carbon::parse($filters['date_to'], $tz)->endOfDay()->setTimezone(config('app.timezone')));
        }

        if (! empty($filters['direction'])) {
            $query->where('direction', $filters['direction']);
        }
        if (! empty($filters['type'])) {
            $query->whereIn('transaction_type', self::TYPES[$filters['type']] ?? []);
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $q) use ($search) {
                $amount = self::parseAmount($search);
                if ($amount !== null) {
                    $q->orWhere('amount', $amount);
                }
                $q->orWhere('description', 'like', '%' . $search . '%')
                    ->orWhere('counterparty_name', 'like', '%' . $search . '%')
                    ->orWhere('external_id', $search)
                    ->orWhere('transaction_id', $search);
            });
        }

        return $query;
    }

    /**
     * @param  array<int, string>  $cited
     * @return array<string, mixed>
     */
    private function presentCandidate(BankStatementEntry $entry, Invoice $invoice, array $cited): array
    {
        $dueDate = $invoice->due_date;
        // Dia da movimentação no fuso da operação, comparado como data com o vencimento.
        $occurred = $entry->occurred_at
            ? Carbon::parse($entry->occurred_at->copy()->setTimezone(config('app.business_timezone', 'America/Sao_Paulo'))->toDateString())
            : null;

        return [
            'id' => $invoice->id,
            'description' => $invoice->description,
            'amount' => (string) $invoice->amount,
            'due_date' => $dueDate?->toDateString(),
            'status' => $invoice->status,
            'paid_at' => $invoice->paid_at?->toISOString(),
            'has_cora_charge' => trim((string) $invoice->cora_charge_id) !== '',
            'student' => $invoice->student ? ['id' => $invoice->student->id, 'name' => $invoice->student->name] : null,
            'guardian' => $invoice->guardian ? ['id' => $invoice->guardian->id, 'name' => $invoice->guardian->name] : null,
            'criteria' => [
                'charge_id_cited' => in_array((string) $invoice->cora_charge_id, $cited, true),
                'amount_equal' => BankReconciliationService::cents($entry->amount) === BankReconciliationService::cents($invoice->amount),
                'date_window' => $dueDate && $occurred
                    ? abs($occurred->diffInDays(Carbon::parse($dueDate->toDateString()), false)) <= self::DATE_WINDOW_DAYS
                    : false,
                'name_hint' => $this->nameHint($entry->counterparty_name, [$invoice->student?->name, $invoice->guardian?->name]),
            ],
        ];
    }

    /**
     * Sobrenome em comum entre a contraparte e aluno/responsável. Só uma pista para quem decide:
     * nunca usada para conciliar automaticamente.
     *
     * @param  array<int, string|null>  $names
     */
    private function nameHint(?string $counterparty, array $names): bool
    {
        $tokens = fn (?string $name) => collect(preg_split('/\s+/', strtoupper(Str::ascii((string) $name))))
            ->filter(fn ($t) => strlen($t) >= 3 && ! in_array($t, self::NAME_STOPWORDS, true));

        $mine = $tokens($counterparty);
        if ($mine->isEmpty()) {
            return false;
        }

        foreach ($names as $name) {
            if ($tokens($name)->intersect($mine)->isNotEmpty()) {
                return true;
            }
        }

        return false;
    }

    /** "175,00", "1.280,00", "175.00", "R$ 175" → "175.00". */
    private static function parseAmount(string $value): ?string
    {
        $clean = preg_replace('/[^\d,.]/', '', $value);
        if ($clean === '' || ! preg_match('/\d/', $clean)) {
            return null;
        }
        if (str_contains($clean, ',')) {
            $clean = str_replace(['.', ','], ['', '.'], $clean);
        }

        return is_numeric($clean) ? number_format((float) $clean, 2, '.', '') : null;
    }

    private static function decimal(float $value): string
    {
        return number_format($value, 2, '.', '');
    }
}
