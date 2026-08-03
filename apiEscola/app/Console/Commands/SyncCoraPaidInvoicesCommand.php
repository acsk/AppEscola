<?php

namespace App\Console\Commands;

use App\Services\CoraPaidInvoicesSyncService;
use Illuminate\Console\Command;

class SyncCoraPaidInvoicesCommand extends Command
{
    protected $signature = 'cora:sync-paid-invoices
                            {--tenant= : Filtrar por tenant_id}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--limit= : Limite de faturas a consultar}
                            {--sleep-ms=150 : Pausa entre consultas à Cora (ms)}
                            {--dry-run : Apenas simula, sem gravar alterações}';

    protected $description = 'Consulta cobranças abertas na Cora e atualiza faturas pagas/canceladas no sistema';

    public function handle(CoraPaidInvoicesSyncService $sync): int
    {
        $tenantOption = $this->option('tenant');
        $tenantId = $tenantOption !== null && $tenantOption !== ''
            ? (int) $tenantOption
            : null;

        $limitOption = $this->option('limit');
        $limit = $limitOption !== null && $limitOption !== ''
            ? (int) $limitOption
            : null;

        $environment = (string) $this->option('environment');
        $dryRun = (bool) $this->option('dry-run');
        $sleepMs = max(0, (int) $this->option('sleep-ms'));

        $this->info('Iniciando sync de cobranças Cora...');
        if ($dryRun) {
            $this->warn('Modo dry-run: nenhuma fatura será alterada.');
        }

        $summary = $sync->sync(
            tenantId: $tenantId,
            environment: $environment,
            dryRun: $dryRun,
            limit: $limit,
            sleepMs: $sleepMs,
        );

        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Consultadas', $summary['checked']],
                ['Marcadas como pagas', $summary['marked_paid']],
                ['Marcadas como canceladas', $summary['marked_cancelled']],
                ['Sem mudança de status', $summary['unchanged']],
                ['Ignoradas (não-Cora / sem tenant)', $summary['skipped']],
                ['Falhas', $summary['failed']],
            ]
        );

        if ($summary['paid_invoice_ids'] !== []) {
            $this->info('IDs pagas: ' . implode(', ', $summary['paid_invoice_ids']));
        }

        if ($summary['cancelled_invoice_ids'] !== []) {
            $this->info('IDs canceladas: ' . implode(', ', $summary['cancelled_invoice_ids']));
        }

        if ($summary['failures'] !== []) {
            $this->warn('Falhas:');
            foreach ($summary['failures'] as $failure) {
                $this->line("  #{$failure['invoice_id']}: {$failure['message']}");
            }
        }

        $this->info($dryRun
            ? 'Dry-run concluído.'
            : 'Sync concluído. Painel e mobile passam a ver os status atualizados na próxima carga.');

        return $summary['failed'] > 0 && $summary['marked_paid'] === 0 && $summary['marked_cancelled'] === 0
            ? self::FAILURE
            : self::SUCCESS;
    }
}
