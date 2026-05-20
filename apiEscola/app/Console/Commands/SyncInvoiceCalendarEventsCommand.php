<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Services\InvoiceCalendarSyncService;
use Illuminate\Console\Command;

class SyncInvoiceCalendarEventsCommand extends Command
{
    protected $signature = 'calendar:sync-invoices {--tenant= : ID do tenant}';

    protected $description = 'Sincroniza cobranças em aberto com vencimento no calendário';

    public function handle(InvoiceCalendarSyncService $sync): int
    {
        $query = Invoice::query()
            ->whereNotNull('due_date')
            ->whereNotNull('student_id')
            ->whereNotIn('status', ['paid', 'cancelled']);

        if ($tenantId = $this->option('tenant')) {
            $query->where('tenant_id', (int) $tenantId);
        }

        $count = 0;
        $query->chunkById(100, function ($invoices) use ($sync, &$count) {
            foreach ($invoices as $invoice) {
                $sync->sync($invoice);
                $count++;
            }
        });

        $this->info("Sincronizadas {$count} cobrança(s).");

        return self::SUCCESS;
    }
}
