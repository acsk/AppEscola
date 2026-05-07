<?php
// Limpar cache sem usar artisan
$cacheDir = __DIR__ . '/../bootstrap/cache/';
$files = ['config.php', 'routes.php', 'events.php'];

foreach ($files as $file) {
    $path = $cacheDir . $file;
    if (file_exists($path)) {
        unlink($path);
        echo "✓ Deletado: $file\n";
    }
}

echo "\n✅ Cache limpo!\n";
?>