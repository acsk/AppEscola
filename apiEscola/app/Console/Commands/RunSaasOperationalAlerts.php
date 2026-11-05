<?php

namespace App\Console\Commands;

use App\Services\Saas\SaasAlertService;
use Illuminate\Console\Command;

class RunSaasOperationalAlerts extends Command
{
    protected $signature = 'saas:operational-alerts';

    protected $description = 'Avalia os alertas operacionais da plataforma e avisa os administradores globais por e-mail';

    public function handle(SaasAlertService $alerts): int
    {
        $result = $alerts->run();
        $this->info("Abertos: {$result['opened']} · atualizados: {$result['updated']} · resolvidos: {$result['resolved']} · avisados por e-mail: {$result['notified']}");

        return self::SUCCESS;
    }
}
