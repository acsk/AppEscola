<?php
echo "Procurando PHP 8.3+ no sistema...\n\n";

$paths_to_check = [
    '/opt/alt/php83/usr/bin/php',
    '/opt/alt/php82/usr/bin/php', 
    '/opt/alt/php81/usr/bin/php',
    '/opt/alt/php80/usr/bin/php',
    '/usr/local/bin/php83',
    '/usr/local/bin/php82',
];

echo "Verificando caminhos alternados (cPanel alt-php):\n";
echo str_repeat("=", 80) . "\n";

foreach ($paths_to_check as $path) {
    if (file_exists($path)) {
        $version = shell_exec("$path -v 2>&1 | head -1");
        echo "✓ $path\n";
        echo "  $version\n";
    }
}

// Buscar via find
echo "\nBuscando via find (pode demorar):\n";
echo str_repeat("=", 80) . "\n";
$find_result = shell_exec("find /opt/alt -name 'php' -type f -executable 2>/dev/null | head -20");
if ($find_result) {
    foreach (explode("\n", trim($find_result)) as $path) {
        if ($path) {
            $version = shell_exec("$path -v 2>&1 | head -1");
            echo "✓ $path\n";
            echo "  $version\n";
        }
    }
}
?>
