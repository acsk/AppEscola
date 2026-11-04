<?php

namespace App\Services\Cora;

use App\Models\BankStatementEntry;
use App\Models\BankStatementSync;
use App\Models\Tenant;
use App\Services\Gateways\CoraPaymentGateway;
use App\Services\Reconciliation\BankReconciliationService;
use App\Support\BusinessDate;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use RuntimeException;
use Throwable;

/**
 * Traz o extrato da conta Cora para bank_statement_entries e tenta a conciliação automática das
 * movimentações novas. Somente leitura na Cora; movimentação já importada nunca é sobrescrita.
 */
class CoraBankStatementSyncService
{
    public const MAX_PERIOD_DAYS = 92;

    private const PER_PAGE = 200;

    private const MAX_PAGES = 50;

    /** Blocos de 92 dias por clique (~1 ano); o que faltar vem no próximo. */
    private const MAX_CHUNKS = 4;

    public function __construct(
        private readonly CoraPaymentGateway $gateway,
        private readonly BankReconciliationService $reconciliation,
    ) {
    }

    /**
     * Busca tudo o que ainda não foi importado: do primeiro dia sem sincronização bem-sucedida (a partir da
     * primeira cobrança gerada pelo sistema) até hoje, em blocos de até 92 dias. O filtro de datas da tela
     * não interfere: ele só muda o que é exibido.
     *
     * @return array{created: int, auto_reconciled: int, divergent: int, period_start: string, period_end: string, complete: bool}
     */
    public function syncPending(Tenant $tenant, string $environment, ?int $userId = null): array
    {
        $since = BankReconciliationService::operatingSince((int) $tenant->id);
        if ($since === null) {
            throw new RuntimeException('Nenhuma cobrança foi gerada na Cora por este sistema ainda; não há o que conciliar.');
        }

        $today = BusinessDate::today();
        $start = $this->firstUncoveredDay((int) $tenant->id, $environment, $since);
        if ($start->gt($today)) {
            $start = $today->copy();
        }

        $summary = ['created' => 0, 'auto_reconciled' => 0, 'divergent' => 0, 'period_start' => $start->toDateString(), 'period_end' => $start->toDateString()];
        $chunkStart = $start->copy();

        for ($chunk = 0; $chunk < self::MAX_CHUNKS && $chunkStart->lte($today); $chunk++) {
            $chunkEnd = $chunkStart->copy()->addDays(self::MAX_PERIOD_DAYS - 1);
            if ($chunkEnd->gt($today)) {
                $chunkEnd = $today->copy();
            }

            $run = $this->sync($tenant, $environment, $chunkStart, $chunkEnd, $userId);
            $summary['created'] += $run->created;
            $summary['auto_reconciled'] += $run->auto_reconciled;
            $summary['divergent'] += $run->divergent;
            $summary['period_end'] = $chunkEnd->toDateString();

            $chunkStart = $chunkEnd->copy()->addDay();
        }

        return $summary + ['complete' => $chunkStart->gt($today)];
    }

    /**
     * Primeiro dia ainda não coberto por sincronizações bem-sucedidas. O dia em que a busca rodou só conta
     * até a véspera, porque podem entrar movimentações depois do horário da busca.
     */
    private function firstUncoveredDay(int $tenantId, string $environment, Carbon $since): Carbon
    {
        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        $cursor = $since->copy();

        $runs = BankStatementSync::query()
            ->where('tenant_id', $tenantId)
            ->where('environment', $environment)
            ->where('status', 'success')
            ->whereDate('period_end', '>=', $since->toDateString())
            ->orderBy('period_start')
            ->get(['period_start', 'period_end', 'finished_at']);

        foreach ($runs as $run) {
            if ($run->period_start->gt($cursor)) {
                break;
            }

            $coveredUntil = $run->period_end->copy();
            if ($run->finished_at) {
                $dayBeforeRun = Carbon::parse($run->finished_at->copy()->setTimezone($tz)->toDateString())->subDay();
                if ($dayBeforeRun->lt($coveredUntil)) {
                    $coveredUntil = $dayBeforeRun;
                }
            }

            if ($coveredUntil->gte($cursor)) {
                $cursor = $coveredUntil->copy()->addDay();
            }
        }

        return $cursor;
    }

    public function sync(Tenant $tenant, string $environment, Carbon $start, Carbon $end, ?int $userId = null): BankStatementSync
    {
        if ($start->gt($end) || (int) $start->diffInDays($end) + 1 > self::MAX_PERIOD_DAYS) {
            throw new RuntimeException('Período do extrato inválido (máximo de ' . self::MAX_PERIOD_DAYS . ' dias).');
        }

        // Antes da primeira cobrança Cora gerada pelo sistema não há o que conciliar (ex.: escola que
        // passou a usar a Cora pelo app em junho não traz o extrato de maio).
        $since = BankReconciliationService::operatingSince((int) $tenant->id);
        if ($since === null) {
            throw new RuntimeException('Nenhuma cobrança foi gerada na Cora por este sistema ainda; não há o que conciliar.');
        }
        if ($end->lt($since)) {
            throw new RuntimeException('O período escolhido é anterior à primeira cobrança Cora gerada pelo sistema (' . $since->format('d/m/Y') . ').');
        }
        if ($start->lt($since)) {
            $start = $since->copy();
        }

        $lock = Cache::lock("bank-statement-sync:{$tenant->id}:{$environment}", 900);
        if (! $lock->get()) {
            throw new RuntimeException('Já existe uma sincronização do extrato em andamento.');
        }

        $run = BankStatementSync::create([
            'tenant_id' => $tenant->id,
            'environment' => $environment,
            'source' => 'cora',
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'status' => 'running',
            'fetched' => 0,
            'created' => 0,
            'auto_reconciled' => 0,
            'divergent' => 0,
            'triggered_by' => $userId,
            'started_at' => now(),
        ]);

        $this->reconciliation->forgetPaymentIndex();

        try {
            for ($page = 1; $page <= self::MAX_PAGES; $page++) {
                $body = $this->gateway->getBankStatement($tenant, $environment, $start->toDateString(), $end->toDateString(), $page, self::PER_PAGE);
                $entries = $body['entries'];

                foreach ($entries as $raw) {
                    $run->fetched++;
                    $attributes = is_array($raw) ? $this->normalize($raw) : null;
                    if ($attributes === null) {
                        continue;
                    }

                    $entry = BankStatementEntry::firstOrCreate([
                        'tenant_id' => $tenant->id,
                        'environment' => $environment,
                        'source' => 'cora',
                        'external_id' => $attributes['external_id'],
                    ], $attributes + ['status' => 'pending', 'sync_id' => $run->id]);

                    if (! $entry->wasRecentlyCreated) {
                        continue;
                    }

                    $run->created++;
                    $status = $this->reconciliation->autoMatch($entry);
                    if ($status === 'reconciled') {
                        $run->auto_reconciled++;
                    } elseif ($status === 'divergent') {
                        $run->divergent++;
                    }
                }

                if (count($entries) < self::PER_PAGE) {
                    break;
                }
            }

            // Entradas (e tarifas) que ficaram pendentes antes (ex.: a baixa da cobrança chegou depois pelo
            // webhook) são conferidas de novo. Movimentações já decididas não são tocadas.
            BankStatementEntry::query()
                ->where('tenant_id', $tenant->id)
                ->where('environment', $environment)
                ->where(fn ($q) => $q->where('direction', 'credit')->orWhere('transaction_type', 'FEE'))
                ->where('status', 'pending')
                ->where(fn ($q) => $q->whereNull('sync_id')->orWhere('sync_id', '!=', $run->id))
                ->lazyById(200)
                ->each(function (BankStatementEntry $entry) use ($run) {
                    $status = $this->reconciliation->autoMatch($entry);
                    if ($status === 'reconciled') {
                        $run->auto_reconciled++;
                    } elseif ($status === 'divergent') {
                        $run->divergent++;
                    }
                });

            $run->fill(['status' => 'success', 'finished_at' => now()])->save();
        } catch (Throwable $e) {
            $run->fill([
                'status' => 'failed',
                'finished_at' => now(),
                'error' => mb_substr($this->describe($e), 0, 500),
            ])->save();

            throw $e;
        } finally {
            $lock->release();
        }

        return $run;
    }

    /**
     * Só crédito e débito entram; bloqueio/desbloqueio não é movimentação. O CPF/CNPJ da contraparte
     * não é guardado.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>|null
     */
    private function normalize(array $raw): ?array
    {
        $type = strtoupper(trim((string) ($raw['type'] ?? '')));
        $id = trim((string) ($raw['id'] ?? ''));
        $cents = $raw['amount'] ?? null;

        if (! in_array($type, ['CREDIT', 'DEBIT'], true) || $id === '' || ! is_numeric($cents)) {
            return null;
        }

        try {
            $occurredAt = Carbon::parse((string) ($raw['createdAt'] ?? ''))->setTimezone(config('app.timezone'));
        } catch (Throwable) {
            return null;
        }

        $description = trim((string) data_get($raw, 'transaction.description', ''));
        $counterparty = trim((string) data_get($raw, 'transaction.counterParty.name', ''));
        $transactionType = strtoupper(trim((string) data_get($raw, 'transaction.type', '')));

        return [
            'external_id' => mb_substr($id, 0, 100),
            'transaction_id' => mb_substr(trim((string) data_get($raw, 'transaction.id', '')), 0, 100) ?: null,
            'direction' => $type === 'CREDIT' ? 'credit' : 'debit',
            'transaction_type' => $transactionType !== '' ? mb_substr($transactionType, 0, 30) : null,
            'amount' => number_format(abs((int) $cents) / 100, 2, '.', ''),
            'occurred_at' => $occurredAt,
            'description' => $description !== '' ? mb_substr($description, 0, 255) : null,
            'counterparty_name' => $counterparty !== '' ? mb_substr($counterparty, 0, 150) : null,
        ];
    }

    /** Mensagem guardada e mostrada no painel: sem corpo da resposta nem dados da conta. */
    private function describe(Throwable $e): string
    {
        if ($e instanceof RequestException) {
            return match ($e->response->status()) {
                401, 403 => 'A Cora recusou o acesso ao extrato (HTTP ' . $e->response->status() . '). Verifique se as credenciais têm permissão de extrato.',
                default => 'A Cora respondeu com erro HTTP ' . $e->response->status() . ' ao consultar o extrato.',
            };
        }
        if ($e instanceof RuntimeException) {
            return $e->getMessage();
        }

        return 'Não foi possível consultar o extrato na Cora.';
    }
}
