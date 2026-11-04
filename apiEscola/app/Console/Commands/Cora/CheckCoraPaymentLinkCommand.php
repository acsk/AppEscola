<?php

namespace App\Console\Commands\Cora;

use App\Models\BankStatementEntry;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\Cora\CoraTransactionId;
use App\Services\Gateways\CoraPaymentGateway;
use App\Services\Reconciliation\BankReconciliationService;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Throwable;

/**
 * Verificação só de leitura: confere se o ID da transação do extrato (trx_/ent_) é o mesmo pagamento
 * registrado na cobrança (payments[].id). Não grava nada e só consulta a Cora com --fetch.
 */
class CheckCoraPaymentLinkCommand extends Command
{
    protected $signature = 'cora:check-payment-link
                            {--tenant= : Filtrar por tenant_id}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--fetch : Consulta na Cora (só leitura) as cobranças pagas sem a identificação do pagamento guardada}
                            {--limit=50 : Máximo de consultas à Cora com --fetch}';

    protected $description = 'Verifica (sem gravar) se o extrato Cora pode ser ligado às cobranças pelo ID do pagamento';

    public function handle(CoraPaymentGateway $gateway): int
    {
        $environment = $this->option('environment') === 'stage' ? 'stage' : 'prod';

        $tenantIds = BankStatementEntry::query()
            ->where('environment', $environment)
            ->when($this->option('tenant'), fn ($q, $id) => $q->where('tenant_id', (int) $id))
            ->distinct()
            ->pluck('tenant_id');

        if ($tenantIds->isEmpty()) {
            $this->warn('Nenhuma movimentação de extrato importada para este ambiente. Rode "Sincronizar agora" na Conciliação bancária antes.');

            return self::SUCCESS;
        }

        foreach (Tenant::query()->whereIn('id', $tenantIds)->get() as $tenant) {
            $this->checkTenant($tenant, $environment, $gateway);
        }

        $this->newLine();
        $this->line('Nada foi gravado.');

        return self::SUCCESS;
    }

    private function checkTenant(Tenant $tenant, string $environment, CoraPaymentGateway $gateway): void
    {
        $this->newLine();
        $this->info("Tenant {$tenant->id}");

        $entries = BankStatementEntry::query()
            ->where('tenant_id', $tenant->id)
            ->where('environment', $environment)
            ->where('direction', 'credit')
            ->get(['id', 'external_id', 'transaction_id', 'amount', 'occurred_at']);

        $invoices = BankReconciliationService::reconcilableInvoices((int) $tenant->id)
            ->where('status', 'paid')
            ->get(['id', 'amount', 'paid_at', 'cora_charge_id', 'cora_payload']);

        $paymentIds = $this->paymentIdsFromPayload($invoices);
        $fetched = 0;
        $fetchErrors = 0;

        if ($this->option('fetch')) {
            $limit = max(1, (int) $this->option('limit'));
            foreach ($invoices as $invoice) {
                if ($fetched >= $limit || in_array($invoice->id, $paymentIds, true)) {
                    continue;
                }
                try {
                    $remote = $gateway->getInvoiceById($tenant, (string) $invoice->cora_charge_id, $environment);
                    foreach ((array) data_get($remote, 'payments', []) as $payment) {
                        if ($uuid = CoraTransactionId::normalizeUuid(data_get($payment, 'id'))) {
                            $paymentIds[$uuid] = $invoice->id;
                        }
                    }
                } catch (Throwable) {
                    $fetchErrors++;
                }
                $fetched++;
                usleep(300_000);
            }
        }

        $byId = $invoices->keyBy('id');
        $matches = [];
        foreach ($entries as $entry) {
            foreach (['transaction_id' => 'trx', 'external_id' => 'ent'] as $field => $label) {
                foreach (CoraTransactionId::uuidCandidates($entry->{$field}) as $uuid) {
                    if (isset($paymentIds[$uuid])) {
                        $matches[] = [$entry, $byId[$paymentIds[$uuid]], $label];
                        continue 3;
                    }
                }
            }
        }

        $period = $entries->isEmpty() ? null : [$entries->min('occurred_at'), $entries->max('occurred_at')];
        $paidInPeriod = $period
            ? $invoices->filter(fn (Invoice $i) => $i->paid_at && $i->paid_at->between($period[0], $period[1]))->count()
            : 0;

        $this->table(['Verificação', 'Quantidade'], [
            ['Entradas no extrato importado', $entries->count()],
            ['Cobranças da aplicação pagas (com ID Cora, não importadas)', $invoices->count()],
            ['  pagas dentro do período do extrato', $paidInPeriod],
            ['  com identificação do pagamento disponível', count(array_unique($paymentIds))],
            ['Consultas à Cora (--fetch)', $this->option('fetch') ? "{$fetched} ({$fetchErrors} com erro)" : 'não usado'],
            ['Movimentações ligadas pelo ID do pagamento', count($matches)],
        ]);

        if ($matches !== []) {
            $rows = array_map(fn ($m) => [
                $m[0]->id,
                $m[2],
                "#{$m[1]->id}",
                number_format((float) $m[0]->amount, 2, ',', '.'),
                number_format((float) $m[1]->amount, 2, ',', '.'),
                BankReconciliationService::cents($m[0]->amount) === BankReconciliationService::cents($m[1]->amount) ? 'sim' : 'NÃO',
                $m[1]->paid_at ? abs($m[0]->occurred_at->diffInSeconds($m[1]->paid_at)) . ' s' : '—',
            ], array_slice($matches, 0, 20));
            $this->table(['Movimentação', 'Por', 'Cobrança', 'Valor extrato', 'Valor cobrança', 'Valor igual', 'Dif. horário'], $rows);
        }

        $sameAmount = count(array_filter($matches, fn ($m) => BankReconciliationService::cents($m[0]->amount) === BankReconciliationService::cents($m[1]->amount)));

        if ($matches !== [] && $sameAmount === count($matches)) {
            $this->info('Resultado: o ID do extrato corresponde ao pagamento da cobrança, com valores iguais. A ligação pelo ID é viável.');
        } elseif ($matches !== []) {
            $this->warn('Resultado: houve ligações, mas com valores diferentes em parte delas (juros/multa?). Envie esta saída para análise.');
        } elseif (count($paymentIds) === 0) {
            $this->warn('Resultado: nenhuma cobrança paga tem a identificação do pagamento guardada. Rode de novo com --fetch.');
        } elseif ($paidInPeriod === 0) {
            $this->warn('Resultado: nenhuma cobrança da aplicação foi paga no período do extrato importado. Sincronize um período que inclua pagamentos delas.');
        } else {
            $this->warn('Resultado: nenhuma ligação encontrada. O ID do extrato não parece ser o mesmo do pagamento da cobrança.');
        }
    }

    /**
     * @param  Collection<int, Invoice>  $invoices
     * @return array<string, int> uuid do pagamento => id da cobrança
     */
    private function paymentIdsFromPayload(Collection $invoices): array
    {
        $map = [];
        foreach ($invoices as $invoice) {
            foreach ((array) data_get($invoice->cora_payload, 'payments', []) as $payment) {
                if ($uuid = CoraTransactionId::normalizeUuid(data_get($payment, 'id'))) {
                    $map[$uuid] = $invoice->id;
                }
            }
        }

        return $map;
    }
}
