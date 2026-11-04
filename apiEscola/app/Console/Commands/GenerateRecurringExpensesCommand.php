<?php

namespace App\Console\Commands;

use App\Services\Payables\RecurringExpenseService;
use Illuminate\Console\Command;

class GenerateRecurringExpensesCommand extends Command
{
    protected $signature = 'finance:generate-recurring-expenses {--tenant= : Filtrar por tenant_id}';

    protected $description = 'Gera as próximas competências das despesas mensais (até 30 dias à frente, sem duplicar)';

    public function handle(RecurringExpenseService $service): int
    {
        $tenant = $this->option('tenant');
        $created = $service->generate($tenant !== null && $tenant !== '' ? (int) $tenant : null);
        $this->info("{$created} despesa(s) recorrente(s) gerada(s).");

        return self::SUCCESS;
    }
}
