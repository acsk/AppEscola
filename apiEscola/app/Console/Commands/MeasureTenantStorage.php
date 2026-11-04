<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\Saas\TenantStorageMeter;
use Illuminate\Console\Command;

class MeasureTenantStorage extends Command
{
    protected $signature = 'saas:measure-storage {--tenant= : Só um tenant}';

    protected $description = 'Mede o armazenamento de arquivos de cada tenant (somente leitura nos discos)';

    public function handle(TenantStorageMeter $meter): int
    {
        $tenants = Tenant::query()->when($this->option('tenant'), fn ($q, $id) => $q->whereKey($id))->get();
        foreach ($tenants as $tenant) {
            $usage = $meter->measure($tenant);
            $this->line(sprintf('%s: %s MB em %d arquivos', $tenant->name, number_format($usage->bytes / 1048576, 1, ',', '.'), $usage->files));
        }

        return self::SUCCESS;
    }
}
