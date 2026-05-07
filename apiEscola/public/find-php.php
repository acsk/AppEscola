<?php
echo "Buscando PHPs instalados...\n\n";

$possiblePaths = [
    '/usr/bin/php',
    '/usr/bin/php7.4',
    '/usr/bin/php8.0',
    '/usr/bin/php8.1',
    '/usr/bin/php8.2',
    '/usr/bin/php8.3',
    '/usr/local/bin/php',
    '/usr/local/bin/php7.4',
    '/usr/local/bin/php8.0',
    '/usr/local/bin/php8.1',
    '/usr/local/bin/php8.2',
    '/usr/local/bin/php8.3',
    '/opt/php/bin/php',
    '/opt/php/bin/php7.4',
    '/opt/php/bin/php8.0',
    '/opt/php/bin/php8.1',
    '/opt/php/bin/php8.2',
    '/opt/php/bin/php8.3',
];

$found = [];
foreach ($possiblePaths as $path) {
    if (file_exists($path) && is_executable($path)) {
        $version = shell_exec("$path -v 2>&1");
        $found[$path] = trim($version);
    }
}

if (empty($found)) {
    echo "Nenhum PHP encontrado nos caminhos comuns.\n";
} else {
    echo "PHPs encontrados:\n";
    echo str_repeat("=", 80) . "\n";
    foreach ($found as $path => $version) {
        echo "$path\n";
        echo "  → $version\n\n";
    }
}

// Tentar via which
echo "\nTentando com 'which':\n";
echo str_repeat("=", 80) . "\n";
$which_result = shell_exec("which php 2>&1");
if ($which_result) {
    echo "which php: " . trim($which_result) . "\n";
}

echo "\nPHP Web atual:\n";
echo "Version: " . PHP_VERSION . "\n";
echo "Binary: " . PHP_BINARY . "\n";
?>
