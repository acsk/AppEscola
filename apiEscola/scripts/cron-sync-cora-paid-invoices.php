<?php

/**
 * Cron diário (Hostinger / servidor compartilhado).
 *
 * Exemplo no painel de Cron Jobs:
 *   /opt/alt/php83/usr/bin/php /home/USUARIO/caminho/apiEscola/scripts/cron-sync-cora-paid-invoices.php
 *
 * Ou via URL (se o arquivo ficar acessível — não recomendado em public/):
 *   php scripts/cron-sync-cora-paid-invoices.php
 */

$appDir = dirname(__DIR__);
chdir($appDir);

require $appDir . '/vendor/autoload.php';

$app = require $appDir . '/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$status = $kernel->call('cora:sync-paid-invoices', [
    '--environment' => getenv('CORA_SYNC_ENVIRONMENT') ?: 'prod',
    '--sleep-ms' => getenv('CORA_SYNC_SLEEP_MS') ?: '800',
]);

echo $kernel->output();

exit($status);
