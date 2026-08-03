<?php

/**
 * Cron diário (Hostinger / servidor compartilhado).
 *
 * Exemplo no painel de Cron Jobs:
 *   /opt/alt/php83/usr/bin/php /home/u304177849/domains/appcurso.com.br/public_html/apiEscola/scripts/cron-sync-cora-paid-invoices.php
 *
 * Tempo sugerido (1x/dia às 06:15):
 *   15 6 * * *
 */

declare(strict_types=1);

// Garante saída no "Ver resultado" da Hostinger mesmo se algo falhar depois.
echo '[' . date('Y-m-d H:i:s') . "] cron-sync-cora-paid-invoices: iniciando\n";
flush();

$appDir = dirname(__DIR__);

if (! is_dir($appDir)) {
    echo "ERRO: diretório da API não encontrado: {$appDir}\n";
    exit(1);
}

chdir($appDir);

$autoload = $appDir . '/vendor/autoload.php';
if (! is_file($autoload)) {
    echo "ERRO: vendor/autoload.php não encontrado em {$appDir}\n";
    echo "Rode composer install no servidor ou confira o caminho do cron.\n";
    exit(1);
}

try {
    require $autoload;

    $app = require $appDir . '/bootstrap/app.php';

    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $status = $kernel->call('cora:sync-paid-invoices', [
        '--environment' => getenv('CORA_SYNC_ENVIRONMENT') ?: 'prod',
        '--sleep-ms' => getenv('CORA_SYNC_SLEEP_MS') ?: '800',
    ]);

    echo $kernel->output();
    echo '[' . date('Y-m-d H:i:s') . "] cron-sync-cora-paid-invoices: finalizado (exit={$status})\n";

    exit($status);
} catch (Throwable $e) {
    echo 'ERRO: ' . $e->getMessage() . "\n";
    echo $e->getFile() . ':' . $e->getLine() . "\n";
    exit(1);
}
