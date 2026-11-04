<?php

namespace App\Services\Saas;

use App\Models\Tenant;
use App\Models\TenantStorageUsage;
use App\Services\TenantUploadSettingsService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/** Mede o espaço ocupado por tenant (diretórios de upload por categoria) e guarda a foto do dia. */
class TenantStorageMeter
{
    public function __construct(
        private readonly TenantUploadSettingsService $uploads,
    ) {
    }

    public function measure(Tenant $tenant): TenantStorageUsage
    {
        $config = $this->uploads->getForTenant($tenant);
        $categories = [];
        foreach (config('saas.storage_paths', []) as $category => $paths) {
            $categories[$category] = $this->sum($config['disk'], $paths, $config['base_path'], $tenant->id);
        }
        foreach (config('saas.private_storage_paths', []) as $category => $paths) {
            $current = $categories[$category] ?? ['bytes' => 0, 'files' => 0];
            $measured = $this->sum('local', $paths, '', $tenant->id);
            $categories[$category] = ['bytes' => $current['bytes'] + $measured['bytes'], 'files' => $current['files'] + $measured['files']];
        }

        $usage = TenantStorageUsage::query()->updateOrCreate(['tenant_id' => $tenant->id], [
            'bytes' => array_sum(array_column($categories, 'bytes')),
            'files' => array_sum(array_column($categories, 'files')),
            'by_category' => $categories,
            'measured_at' => now(),
        ]);

        return $usage;
    }

    /** @return array{bytes: int, files: int} */
    private function sum(string $disk, array $paths, string $base, int $tenantId): array
    {
        $bytes = 0;
        $files = 0;
        foreach ($paths as $pattern) {
            $directory = trim(str_replace(['{base}', '{tenant}'], [$base, (string) $tenantId], $pattern), '/');
            try {
                $storage = Storage::disk($disk);
                if (! $storage->directoryExists($directory)) {
                    continue;
                }
                foreach ($storage->allFiles($directory) as $file) {
                    $bytes += (int) $storage->size($file);
                    $files++;
                }
            } catch (Throwable $e) {
                Log::warning('Armazenamento: falha ao medir diretório', ['tenant_id' => $tenantId, 'disk' => $disk, 'error' => $e->getMessage()]);
            }
        }

        return ['bytes' => $bytes, 'files' => $files];
    }
}
