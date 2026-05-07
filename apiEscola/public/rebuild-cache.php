<?php
ini_set('display_errors', 1);

$php83 = '/opt/alt/php83/usr/bin/php';
$projectRoot = dirname(__DIR__);

if (!file_exists($php83)) {
    die('❌ PHP 8.3 não encontrado em: ' . $php83);
}

echo "🚀 Limpando cache e regenerando com PHP 8.3...\n\n";
echo str_repeat("=", 80) . "\n\n";

// Deletar arquivos de cache manualmente
$cacheFiles = [
    $projectRoot . '/bootstrap/cache/config.php',
    $projectRoot . '/bootstrap/cache/routes.php',
    $projectRoot . '/bootstrap/cache/events.php',
];

foreach ($cacheFiles as $file) {
    if (file_exists($file)) {
        unlink($file);
        echo "✓ Deletado: " . basename($file) . "\n";
    }
}

echo "\n";

// Rodar config:cache
echo "Executando: config:cache\n";
$output = shell_exec("cd $projectRoot && $php83 artisan config:cache 2>&1");
echo $output . "\n";

// Rodar route:cache
echo "Executando: route:cache\n";
$output = shell_exec("cd $projectRoot && $php83 artisan route:cache 2>&1");
echo $output . "\n";

echo str_repeat("=", 80) . "\n";
echo "✅ Concluído! Cache regenerado com sucesso.\n";
?>
