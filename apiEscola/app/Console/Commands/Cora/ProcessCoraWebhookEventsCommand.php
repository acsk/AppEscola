<?php

namespace App\Console\Commands\Cora;

use App\Services\Cora\CoraWebhookProcessor;
use Illuminate\Console\Command;

class ProcessCoraWebhookEventsCommand extends Command
{
    protected $signature = 'cora:process-webhook-events
                            {--limit=50 : Máximo de avisos por execução}';

    protected $description = 'Processa os avisos do webhook Cora pendentes ou interrompidos (consulta a cobrança e aplica a baixa)';

    public function handle(CoraWebhookProcessor $processor): int
    {
        $count = $processor->processDue(max(1, (int) $this->option('limit')));

        if ($count > 0) {
            $this->info("Avisos processados: {$count}.");
        }

        return self::SUCCESS;
    }
}
